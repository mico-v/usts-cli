const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * 门禁自检：**不会失败的规则等于没有规则**。
 *
 * `tools/lint.mjs` 是 CI 的架构门禁，但它本身没有任何测试——一条写错的正则（比如
 * 路径比较在 Windows 上恒假、或只匹配 `from 'axios'` 的某一种写法）会让规则静默失效，
 * 而 CI 依然显示绿色。这里在临时目录里造出各类违规，逐条断言门禁真的报错。
 */
const ROOT = path.resolve(__dirname, '..');

/**
 * 造一个只含 lint 脚本与目录骨架的临时副本，返回 { root, run, write, cleanup }。
 *
 * 探针里用的学号/手机号**由码点拼装**：直接写成字面量的话，这个测试文件自己就会被
 * PII 扫描拦住（门禁会拦住自己的测试夹具，说明它确实在工作，但没法留在仓库里）。
 */
const PROBE_ID = [50, 53, 50, 48, 48, 49, 48, 55, 49, 49, 56].map((c) => String.fromCharCode(c)).join('');
const PROBE_PHONE = [49, 51, 56, 49, 50, 51, 52, 53, 54, 55, 56].map((c) => String.fromCharCode(c)).join('');

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usts-lint-probe-'));
  for (const dir of ['src/domain', 'src/cli', 'src/application/usecases', 'src/infrastructure/jwgl', 'tests', 'tools']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.copyFileSync(path.join(ROOT, 'tools/lint.mjs'), path.join(root, 'tools/lint.mjs'));

  const run = () => spawnSync(process.execPath, ['tools/lint.mjs'], { cwd: root, encoding: 'utf8' });
  const write = (relative, body) => fs.writeFileSync(path.join(root, relative), body);

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, run, write };
}

test('门禁：空副本必须通过（否则「命中」可能来自别的原因）', (t) => {
  const { run } = sandbox(t);
  const result = run();
  assert.equal(result.status, 0, `空副本不该报错，实际输出：${result.stderr}`);
});

const RULES = [
  { name: 'axios 越界（import 形态）', file: 'src/cli/probe.ts', body: "import axios from 'axios';\nexport const a = axios;\n", expect: /Axios 只能/ },
  { name: 'axios 越界（require 形态）', file: 'src/application/usecases/probe.ts', body: "const axios = require('axios');\nmodule.exports = axios;\n", expect: /Axios 只能/ },
  { name: '依赖方向：domain → cli', file: 'src/domain/probe.ts', body: 'import { header } from "../cli/logger";\nexport const y = header;\n', expect: /依赖方向违规/ },
  { name: '依赖方向：application → cli', file: 'src/application/usecases/probe.ts', body: 'import { printTable } from "../../cli/format";\nexport const y = printTable;\n', expect: /依赖方向违规/ },
  { name: 'cli 层按远端字段名挑字段', file: 'src/cli/probe.ts', body: "export const pick = (it) => pick(it, ['kcmc', 'jsxm']);\n", expect: /不得按远端字段名挑选/ },
  { name: 'application 文案引用 CLI 开关名', file: 'src/application/usecases/probe.ts', body: 'export const m = () => "请用 --jg 指定学院";\n', expect: /CLI 开关名/ },
  { name: 'infrastructure 文案引用 CLI 开关名', file: 'src/infrastructure/jwgl/probe.ts', body: 'export const m = () => "目标已存在，请加 --force";\n', expect: /CLI 开关名/ },
  { name: '疑似真实学号', file: 'tests/probe.js', body: `const id = '${PROBE_ID}';\nmodule.exports = id;\n`, expect: /疑似个人信息/ },
  { name: '疑似手机号', file: 'tests/probe.js', body: `const phone = '${PROBE_PHONE}';\nmodule.exports = phone;\n`, expect: /疑似个人信息/ },
  { name: '行尾空白', file: 'src/cli/probe.ts', body: 'export const x = 1;   \n', expect: /行尾空白/ },
];

for (const rule of RULES) {
  test(`门禁规则会真的报错：${rule.name}`, (t) => {
    const { run, write } = sandbox(t);
    write(rule.file, rule.body);

    const result = run();
    assert.notEqual(result.status, 0, `应当报错但通过了：${rule.name}`);
    assert.match(result.stderr, rule.expect, `${rule.name} 报的错不对：${result.stderr}`);
  });
}
