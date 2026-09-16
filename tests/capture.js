/**
 * 收集一次渲染的输出。
 *
 * 渲染层只往 stdout 写（`console.log`），因此在进程内把 console.log 换掉即可断言输出，
 * 不必 spawn 子进程、也不必起假服务器——这正是把渲染与取数拆开的目的。
 */
function capture(fn) {
  const lines = [];
  const original = console.log;
  console.log = (value) => lines.push(String(value));
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

module.exports = { capture };
