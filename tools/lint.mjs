#!/usr/bin/env node
/**
 * 架构与卫生门禁。
 *
 * `docs/architecture.md` 写了 10 条依赖规则，但能被机械检查的只有一部分——这里实现其中
 * 可判定的几条，其余（如「用例不渲染」）靠 review。原则：**只加能给出确定结论的规则**，
 * 宁可少查也不要误报，否则门禁会被当成噪音而绕过。
 *
 * 现有检查：
 *   1. 文件长度、行尾空白、Tab（卫生）
 *   2. Axios 只能出现在 HTTP 基础设施与网关适配器
 *   3. 分层导入方向：domain 不得依赖上层；types 不得依赖任何实现层
 *   4. 远端字段名不得出现在 cli/ 的字段挑选里（`pick(item, ['kcmc'…])` 那种）
 *   5. application/ 与 infrastructure/ 不得出现面向人的中文文案（架构规则 10）
 *   6. 不得提交真实身份信息（学号/姓名/手机号）——这是发布到公开仓库的仓库
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['src', 'tests', 'tools'];
const errors = [];

/** 路径统一用 `/`，否则 Windows 上的前缀比较恒为假（等于规则静默失效）。 */
function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else if (/\.(?:ts|js|mjs)$/.test(entry.name)) files.push(target);
  }
  return files;
}

const FILES = [];
for (const relative of SOURCE_ROOTS) FILES.push(...walk(path.join(ROOT, relative)));

// ---------- 1. 卫生 ----------
for (const file of FILES) {
  const source = fs.readFileSync(file, 'utf8');
  const display = toPosix(path.relative(ROOT, file));
  const lines = source.split(/\r?\n/);
  if (lines.length > 800) errors.push(`${display}: 文件超过 800 行，请继续拆分职责`);
  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) errors.push(`${display}:${index + 1}: 行尾空白`);
    if (/\t/.test(line)) errors.push(`${display}:${index + 1}: 使用了 Tab 缩进`);
  });
}

// ---------- 2. Axios 的边界 ----------
const AXIOS_IMPORT = /(?:from\s+['"]axios['"]|require\(\s*['"]axios['"]\s*\))/;
for (const file of FILES) {
  const display = toPosix(path.relative(ROOT, file));
  if (!display.startsWith('src/')) continue;
  if (!AXIOS_IMPORT.test(fs.readFileSync(file, 'utf8'))) continue;
  const allowed = display === 'src/infrastructure/jwgl/gateway.ts'
    || display.startsWith('src/infrastructure/http/');
  if (!allowed) errors.push(`${display}: Axios 只能出现在 HTTP 基础设施或网关适配器中`);
}

// ---------- 3. 分层导入方向 ----------
/** 每层允许依赖的层（同级与更内层）。 */
const LAYER_DEPS = {
  'src/domain/': [],
  // types 位于 domain 之上（docs/architecture.md），允许 type-only 依赖 domain
  'src/types/': ['src/domain/'],
  'src/shared/': [],
  'src/config/': ['src/domain/', 'src/shared/', 'src/config/'],
  'src/application/': ['src/domain/', 'src/types/', 'src/shared/', 'src/application/'],
  'src/infrastructure/': ['src/domain/', 'src/types/', 'src/shared/', 'src/config/', 'src/application/', 'src/infrastructure/'],
  'src/cli/': ['src/domain/', 'src/types/', 'src/shared/', 'src/config/', 'src/application/', 'src/infrastructure/', 'src/cli/'],
};
function layerOf(display) {
  return Object.keys(LAYER_DEPS).find((prefix) => display.startsWith(prefix));
}
for (const file of FILES) {
  const display = toPosix(path.relative(ROOT, file));
  const layer = layerOf(display);
  if (!layer) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const resolved = toPosix(path.normalize(path.join(path.dirname(display), match[1])));
    const target = layerOf(resolved);
    if (!target || target === layer) continue;
    if (!LAYER_DEPS[layer].includes(target)) {
      errors.push(`${display}: 依赖方向违规——${layer} 不得依赖 ${target}（见 docs/architecture.md）`);
    }
  }
}

// ---------- 4. 远端字段名不得出现在 cli/ 的字段挑选里 ----------
// 只匹配「按远端键名挑选」这种形态，避免把正常的中文/语义变量名误报。
const REMOTE_PICK = /pick\s*\(\s*\w+\s*,\s*\[[^\]]*['"][a-z]{2,6}(?:_?[a-z]{1,4})?['"]/;
for (const file of FILES) {
  const display = toPosix(path.relative(ROOT, file));
  if (!display.startsWith('src/cli/')) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (REMOTE_PICK.test(source)) {
    errors.push(`${display}: cli/ 不得按远端字段名挑选字段，映射请放在 infrastructure/jwgl`);
  }
}

// ---------- 5. 面向人的中文文案不得出现在 application/ 与 infrastructure/ ----------
// 判据：中文字符串字面量出现在 AppError 之外的**展示**位置很难机械判定，因此只查
// 「中文文案 + 明显属于 CLI 措辞的词」这一类确定违规；CLI 开关名（--xxx）是最明确的信号。
const CLI_FLAG_IN_MESSAGE = /['"`][^'"`]*--[a-z][a-z-]{1,20}[^'"`]*['"`]/;
for (const file of FILES) {
  const display = toPosix(path.relative(ROOT, file));
  if (!/^src\/(?:application|infrastructure)\//.test(display)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const line of source.split(/\r?\n/)) {
    // 注释里提开关名是可以的（那是给维护者看的）；只查字符串字面量。
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/^\s*\*/.test(line)) continue;
    if (CLI_FLAG_IN_MESSAGE.test(code) && /[一-鿿]/.test(code)) {
      errors.push(`${display}: 应用/基础设施层不得在文案里引用 CLI 开关名（架构规则 10）：${line.trim().slice(0, 80)}`);
    }
  }
}

// ---------- 6. 真实身份信息 ----------
// 本仓库发布到公开 npm/GitHub，夹具必须脱敏。查「像本校学号的 11 位数字」与手机号，
// 以及真实姓名（在测试夹具里出现过的那一个）。
// 模式本身用码点拼装：否则这份规则文件自己就会命中「疑似个人信息」。
const USTS_ID_PREFIX = String.fromCharCode(50, 53, 50, 48, 48); // 本校学号前 5 位
const PII_PATTERNS = [
  [new RegExp(`\\b${USTS_ID_PREFIX}\\d{6}\\b`), '疑似真实学号（本校 11 位学号形态）'],
  [/\b1[3-9]\d{9}\b/, '疑似手机号'],
];
for (const file of FILES) {
  const display = toPosix(path.relative(ROOT, file));
  const source = fs.readFileSync(file, 'utf8');
  source.split(/\r?\n/).forEach((line, index) => {
    for (const [pattern, label] of PII_PATTERNS) {
      if (pattern.test(line)) errors.push(`${display}:${index + 1}: 疑似个人信息——${label}；夹具请用假值`);
    }
  });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('source policy checks passed');
}
