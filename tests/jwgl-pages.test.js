const test = require('node:test');
const assert = require('node:assert/strict');

const { parseProfilePage } = require('../dist/infrastructure/jwgl/profile-page');
const { parseGpaSummary, parseAcademiaSummary } = require('../dist/infrastructure/jwgl/academia-page');
const { parseBjkbdyOptions, buildClassScheduleBody } = require('../dist/infrastructure/jwgl/class-schedule-page');
const { buildSchedulePdfBody } = require('../dist/infrastructure/jwgl/documents');
const { displaySemester } = require('../dist/domain/term');

test('profile page parses label/value pairs and col_* fallbacks', () => {
  const html = `
    <div><label>学号：</label><p class="form-control-static">20230001</p></div>
    <div><label>姓名：</label><p class="form-control-static">张三</p></div>
    <div><label>年级：</label><p class="form-control-static">2023</p></div>
    <div id="col_bh_id"><p class="form-control-static">计算机2301</p></div>
    <div><label>电子邮箱：</label><p class="form-control-static">z@example.com</p></div>`;
  const profile = parseProfilePage(html, '');
  assert.equal(profile.studentId, '20230001');
  assert.equal(profile.displayName, '张三');
  assert.equal(profile.grade, '2023');
  assert.equal(profile.enrollmentYear, 2023);
  assert.equal(profile.className, '计算机2301');
  assert.equal(profile.email, 'z@example.com');
});

test('profile page falls back to the session username when 学号 is absent', () => {
  const profile = parseProfilePage('<html></html>', '20230002');
  assert.equal(profile.studentId, '20230002');
  assert.equal(profile.username, '20230002');
});

test('GPA summary reads structured values and tolerates a missing 平均分', () => {
  const html = `
    <div>平均绩点 3.85</div>
    <div>总学分 160</div>
    <div>获得学分 120</div>
    <font size="2px">3.85</font>`;
  const gpa = parseGpaSummary(html);
  assert.equal(gpa.gpa, 3.85);
  assert.equal(gpa.totalCredits, 160);
  assert.equal(gpa.earnedCredits, 120);
  assert.equal(gpa.averageScore, undefined);
});

test('academia summary parses the credit-category tree from the page template', () => {
  const html = `
    <input id="xh_id" value="20230001">
    <script>
      var node = "通识教育类&nbsp;" + $.i18n.get('yqxf')/* 要求学分 */ + ":40&nbsp;" + $.i18n.get('hdxf')/* 获得学分 */ + ":24&nbsp;&nbsp;" + $.i18n.get('whdxf')/* 未获得学分 */ + ":16&nbsp;" + "<span id='showKc123'>";
    </script>
    <div>计划总课程 60 门 通过 42 门</div>
    <div>未通过 3 门</div>`;
  const summary = parseAcademiaSummary(html);
  assert.equal(summary.studentId, '20230001');
  assert.equal(summary.categories.length, 1);
  assert.deepEqual(
    { name: summary.categories[0].name, required: summary.categories[0].requiredCredits, earned: summary.categories[0].earnedCredits, missing: summary.categories[0].missingCredits, id: summary.categories[0].id },
    { name: '通识教育类', required: 40, earned: 24, missing: 16, id: '123' },
  );
  assert.equal(summary.plannedCourses, 60);
  assert.equal(summary.passedCourses, 42);
  assert.equal(summary.failedCourses, 3);
});

test('academia summary falls back to the session username when the page has no 学号', () => {
  assert.equal(parseAcademiaSummary('<html></html>', '20230002').studentId, '20230002');
});

test('class schedule view options parse selects and their defaults', () => {
  const html = `
    <select name="njdm_id"><option value="2024">2024</option><option value="2025" selected>2025</option></select>
    <select name="xqh_id"><option value="2" selected>石湖</option><option value="1">江枫</option></select>
    <select name="jg_id"><option value="">全部</option><option value="204">电子与信息工程学院</option></select>
    <select name="pyccdm"><option value="1">本科</option></select>`;
  const view = parseBjkbdyOptions(html);
  assert.deepEqual(view.grades, [{ value: '2024', label: '2024' }, { value: '2025', label: '2025' }]);
  assert.equal(view.defaultGrade, '2025');
  assert.equal(view.defaultCampus, '2');
  assert.deepEqual(view.colleges, [{ value: '204', label: '电子与信息工程学院' }], '空 value 的「全部」项应被过滤');
});

test('class schedule body carries the class number and the display semester code', () => {
  const body = new URLSearchParams(buildClassScheduleBody({
    xnm: '2026', xqm: '3', xqhId: '2', njdmId: '2025', jgId: '204', zyhId: '0107',
    bhId: '99', bh: '2520401000', bj: '测试班级', zymc: '计算机科学与技术', jgmc: '电子学院', njmc: '2025',
  }));
  assert.equal(body.get('bh'), '2520401000', 'bh 必须是班级编号，传班级名会返回空 kbList');
  assert.equal(body.get('njdm_id'), '2025');
  assert.equal(body.get('njmc'), '2025');
  assert.equal(body.get('xnmc'), '2026-2027');
  assert.equal(body.get('xqmmc'), '1', 'USTS 的 xqm=3 对应打印模块的学期序号 1');
  assert.equal(body.get('kzlx'), 'ck');
});

test('schedule PDF body uses the USTS semester code itself, not the display code', () => {
  const body = new URLSearchParams(buildSchedulePdfBody('2026', '12'));
  assert.equal(body.get('xqm'), '12');
  assert.equal(body.get('xqmmc'), '2');
  assert.equal(body.get('xszd.jszc'), 'false');
});

test('displaySemester maps USTS term codes and passes through unknown ones', () => {
  assert.equal(displaySemester('3'), '1');
  assert.equal(displaySemester('12'), '2');
  assert.equal(displaySemester('16'), '3');
  assert.equal(displaySemester(''), '1');
  assert.equal(displaySemester('99'), '99');
});
