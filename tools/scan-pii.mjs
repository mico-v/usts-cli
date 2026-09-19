#!/usr/bin/env node
/**
 * 个人信息扫描：**所有入库文件**（不只是 src/tests）。
 *
 * 为什么单独做一份、而不并进 `tools/lint.mjs`：lint 只看代码目录，而真正出过事的是
 * `tests/` 里的真实学号与 `docs/plans/` 里的真实学号+姓名——后者甚至不在 `src` 下。
 * 这个脚本扫 `git ls-files` 的全集，因此新加的文档、夹具、脚本都会被覆盖。
 *
 * 用法：
 *   node tools/scan-pii.mjs            # 扫工作区（CI 用；失败即退出码 1）
 *   node tools/scan-pii.mjs --list     # 只列出会扫哪些文件
 *
 * 模式本身用码点拼装，避免这份规则文件自己命中。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = process.cwd();
const USTS_ID_PREFIX = String.fromCharCode(50, 53, 50, 48, 48); // 本校学号前 5 位

const PATTERNS = [
  [new RegExp(`\\b${USTS_ID_PREFIX}\\d{6}\\b`), '本校学号形态（11 位）'],
  [/\b1[3-9]\d{9}\b/, '手机号形态'],
  // 真实 JSESSIONID/会话令牌：Tomcat 生成的是大写十六进制，长度 ≥16。
  // 刻意**不**匹配任意 8 位以上的小写串——那会把脱敏测试里的假 token 也报成泄漏，
  // 规则一旦有假阳性就会被绕过，不如窄一点、确定一点。
  [/\bJSESSIONID\s*[=:]\s*(?!\[REDACTED\])[A-Z0-9]{16,}/, '真实 JSESSIONID'],
];

/** 只扫入库文件：未跟踪的临时脚本不构成泄漏。 */
function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

const files = trackedFiles();
if (process.argv.includes('--list')) {
  console.log(files.join('\n'));
  process.exit(0);
}

const findings = [];
for (const relative of files) {
  // 二进制与依赖目录跳过
  if (/\.(?:png|jpe?g|gif|ico|pdf|tgz|lock)$/i.test(relative)) continue;
  if (relative.startsWith('node_modules/')) continue;

  let content;
  try {
    content = fs.readFileSync(`${ROOT}/${relative}`, 'utf8');
  } catch {
    continue; // 读不了（子模块、符号链接指向外部）就跳过，不因此失败
  }
  if (content.includes('\0')) continue; // 二进制

  content.split(/\r?\n/).forEach((line, index) => {
    for (const [pattern, label] of PATTERNS) {
      if (pattern.test(line)) {
        findings.push(`${relative}:${index + 1}: ${label} → ${line.trim().slice(0, 100)}`);
      }
    }
  });
}

if (findings.length) {
  console.error('发现疑似个人信息（本仓库发布到公开 npm/GitHub，夹具与文档必须脱敏）：');
  console.error(findings.join('\n'));
  console.error('\n改用假值（如学号 20230001、班级 计算机2301），或把文件加进 .gitignore。');
  process.exit(1);
}
console.log(`个人信息扫描通过（${files.length} 个入库文件）`);
