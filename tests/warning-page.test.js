const test = require('node:test');
const assert = require('node:assert/strict');

const { parseWarningPage } = require('../dist/infrastructure/jwgl/warning-page');

/**
 * 夹具是**按实测页面结构合成的脱敏样本**（真实页面含姓名与学号，不入库）。
 * 无预警页面的正文就是一句结论；有预警时是明细表——「有没有预警」按结构判定。
 */
const NO_WARNING = `<!doctype html><html><body>
  <input type="hidden" name="sfzxsyjjbzg" value="1" id="sfzxsyjjbzg"/>
  <div class="form-horizontal sl_all_form">
    <div class="row clearfix">
      <div class="col-md-12 col-sm-12">
        <div style="color:blue"><h3>张三同学您好：</h3><br></div>
        <div style="color:green;"><h4>当前学年学期暂无预警！</h4></div>
      </div>
    </div>
  </div>
</body>
<script>
  // 页面脚本里也会出现标签文本，不能被当成正文
  var html = "<h4>脚本里的假标题</h4>";
</script>
</html>`;

const WITH_WARNING = NO_WARNING
  .replace('<h4>当前学年学期暂无预警！</h4>', `
    <table id="tabGrid">
      <thead><tr><th>学年学期</th><th>预警级别</th><th>学分绩点</th></tr></thead>
      <tbody>
        <tr><td>2025-2026/1</td><td>黄色预警</td><td>1.80</td></tr>
        <tr><td>2025-2026/2</td><td>红色预警</td><td>1.20</td></tr>
      </tbody>
    </table>`);

test('无预警页面：结构上没有明细表，结论文本原样取出', () => {
  const status = parseWarningPage(NO_WARNING);

  assert.equal(status.hasWarning, false);
  assert.deepEqual(status.messages, ['张三同学您好：', '当前学年学期暂无预警！']);
  assert.deepEqual(status.headers, []);
  assert.deepEqual(status.rows, []);
  assert.ok(!status.messages.some((message) => message.includes('脚本里')), 'script 里的标签不能混进正文');
});

test('有预警页面：按结构判定为有预警，并按页面原有表头成表', () => {
  const status = parseWarningPage(WITH_WARNING);

  assert.equal(status.hasWarning, true);
  assert.deepEqual(status.headers, ['学年学期', '预警级别', '学分绩点']);
  assert.deepEqual(status.rows, [
    ['2025-2026/1', '黄色预警', '1.80'],
    ['2025-2026/2', '红色预警', '1.20'],
  ]);
});

test('表头与单元格里的标签会被清成纯文本，表格内容不重复进 messages', () => {
  const status = parseWarningPage(WITH_WARNING);
  assert.ok(!status.messages.some((message) => message.includes('2025-2026/1')), '表格内容只由 rows 承载');
});

test('既没有结论文本也没有明细表时按空结构返回（由适配器判为协议变化）', () => {
  const status = parseWarningPage('<html><body><div>页面改版了</div></body></html>');
  assert.equal(status.hasWarning, false);
  assert.deepEqual(status.messages, []);
  assert.deepEqual(status.rows, []);
});
