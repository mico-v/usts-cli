const test = require('node:test');
const assert = require('node:assert/strict');

const { ALL_SPECS, QUERY_SPECS } = require('../dist/cli/registry');

/** 不进查询子菜单的命令：账号类命令与个人信息（个人信息在主菜单上）。 */
const NOT_IN_QUERY_MENU = ['login', 'logout', 'profile'];

test('命令注册表：id 唯一、顺序稳定、帮助文本齐备', () => {
  const ids = ALL_SPECS.map((spec) => spec.id);
  assert.equal(new Set(ids).size, ids.length, '命令 id 不得重复');
  // 顺序即 `usts --help` 的命令表顺序：写成断言是为了让调整顺序变成一个显式决定。
  assert.deepEqual(ids, [
    'login', 'logout', 'scores', 'exams', 'courses', 'schedule', 'clsched', 'profile',
    'gpa', 'notifications', 'academia', 'selected-courses', 'schedule-pdf', 'academia-pdf',
  ]);

  for (const spec of ALL_SPECS) {
    assert.ok(spec.summary, `${spec.id} 缺少 summary`);
    assert.ok(spec.help.includes('说明:') || spec.help.includes('示例:'), `${spec.id} 的 --help 缺少详细说明`);
    assert.equal(spec.help, spec.help.trimEnd(), `${spec.id} 的帮助文本不得有多余尾随空白`);
    assert.equal(typeof spec.run, 'function', `${spec.id} 缺少 run`);
  }
});

test('查询子菜单覆盖除账号类命令外的全部命令，且顺序与声明顺序一致', () => {
  // 这条断言的作用是拦住「加了命令却忘了 menu」——加命令时要么进菜单，要么进豁免表。
  const expected = ALL_SPECS.map((spec) => spec.id).filter((id) => !NOT_IN_QUERY_MENU.includes(id));
  assert.deepEqual(QUERY_SPECS.map((spec) => spec.id), expected);

  for (const spec of QUERY_SPECS) {
    assert.ok(spec.menu.label, `${spec.id} 的菜单项缺少 label`);
  }
});
