const test = require('node:test');
const assert = require('node:assert/strict');

const { parseProfilePage } = require('../dist/infrastructure/jwgl/profile-page');
const { parseGpaSummary, parseAcademiaSummary } = require('../dist/infrastructure/jwgl/academia-page');
const { parseBjkbdyOptions, buildClassScheduleBody } = require('../dist/infrastructure/jwgl/class-schedule-page');
const { parseCascadeOptions, parseSelect } = require('../dist/infrastructure/jwgl/select-options');
const { weekMask, sectionMask, weekdayList } = require('../dist/infrastructure/jwgl/facilities');
const { mapFreeClassroom, mapPlanCourse, mapPaymentItem } = require('../dist/infrastructure/jwgl/mappers');
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
  // 页面锚点（学号隐藏域 + i18n 模板）必须存在，否则解析器按「不是学业情况页」拒绝
  const html = `
    <input id="xh_id" value="20230001">
    <script>var n = "通识教育类&nbsp;" + $.i18n.get('yqxf')/* 要求学分 */ + ":40&nbsp;";</script>
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

test('GPA/academia 解析器拒绝不含页面锚点的 HTML（错误提示页不能被当成空学业情况）', () => {
  const notThePage = '<html><head><title>错误提示</title></head><body>错误提示</body></html>';
  assert.throws(() => parseGpaSummary(notThePage), (error) => error.code === 'PROTOCOL_CHANGED');
  assert.throws(() => parseAcademiaSummary(notThePage, '20230001'), (error) => error.code === 'PROTOCOL_CHANGED');
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
  // 有页面锚点（i18n 模板）但没有 xh_id 隐藏域 → 用调用方给的学号兜底
  const html = `<script>var n = "通识教育类&nbsp;" + $.i18n.get('yqxf')/* 要求学分 */ + ":40&nbsp;";</script>`;
  assert.equal(parseAcademiaSummary(html, '20230002').studentId, '20230002');
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
    xnm: '2026', xqm: '3', campusId: '2', gradeId: '2025', majorId: '0107',
    classId: '99', classNumber: '2520401000', className: '测试班级', majorName: '计算机科学与技术', collegeName: '电子学院', gradeName: '2025',
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

test('级联视图页：按 name 取选项，并读出正方的预选值', () => {
  // 前缀相近的下拉必须互不误伤：jg_id 不能命中 jg_id_cx（执行计划页两者同时存在）
  const html = `
    <select name="jg_id_cx"><option value="999">另一个学院下拉</option></select>
    <select name="jg_id"><option value="">全部</option><option value="204" selected="selected">电子与信息工程学院</option></select>
    <select name="nj_cx"><option value="2025" selected>2025</option><option value="2024">2024</option></select>
    <select name="zyh_id_cx"><option value="0107" selected="selected">计算机科学与技术(0107)</option></select>`;

  const view = parseCascadeOptions(html, { college: 'jg_id', grade: 'nj_cx', major: 'zyh_id_cx' });

  assert.deepEqual(view.colleges, [{ value: '204', label: '电子与信息工程学院' }], '空 value 的「全部」项应被过滤');
  assert.deepEqual(view.grades, [{ value: '2025', label: '2025' }, { value: '2024', label: '2024' }]);
  assert.deepEqual(view.majors, [{ value: '0107', label: '计算机科学与技术(0107)' }]);
  assert.deepEqual(view.defaults, { collegeId: '204', gradeId: '2025', majorId: '0107' });
});

test('级联视图页：没预选时 defaults 为空串（不猜），下拉缺失时给空列表', () => {
  const view = parseCascadeOptions('<select name="jg_id"><option value="204">电子学院</option></select>', {
    college: 'jg_id', grade: 'njdm_id', major: 'zyh_id',
  });
  assert.deepEqual(view.defaults, { collegeId: '', gradeId: '', majorId: '' });
  assert.deepEqual(view.grades, []);
  assert.deepEqual(parseSelect('<html></html>', 'jg_id'), []);
});

test('空闲场地：周次/节次是 2^(n-1) 位掩码，星期是排序去重的逗号串', () => {
  assert.equal(weekMask([3]), '4');
  assert.equal(weekMask([1, 2, 3]), '7');
  assert.equal(weekMask([16]), '32768');
  assert.equal(sectionMask([5, 6]), '48', '第 5、6 节 = 2^4 + 2^5');
  assert.equal(weekdayList([5, 1, 1]), '1,5');
});

test('空闲场地映射：只取页面会展示的列，缺字段不报错', () => {
  const room = mapFreeClassroom({
    cd_id: '021293', cdbh: '021293', cdmc: '石5-103', cdlbmc: '多媒体教室',
    xqmc: '石湖', jxlmc: '石5', zws: '80', sfkjy: '是', kszws1: '60',
  });
  assert.deepEqual(room, {
    code: '021293', name: '石5-103', category: '多媒体教室',
    campus: '石湖', building: '石5', seats: 80, borrowable: '是',
  });
  assert.deepEqual(mapFreeClassroom({ cdmc: '石5-演播厅' }), {
    code: undefined, name: '石5-演播厅', category: undefined,
    campus: undefined, building: undefined, seats: undefined, borrowable: undefined,
  });
});

test('缴费映射：金额保留原样小数位，缺失字段留 undefined 而不是空串', () => {
  const payment = mapPaymentItem({
    zfywsj_ids: 'x', xnmc: '2025-2026', xqmc: '1', ywmc: '学费', order_name: '学分学费',
    order_amount: '500.00', sfqr: '已缴费', pay_time: '2026-09-01', order_id: 'A1',
  });
  assert.equal(payment.amount, '500.00');
  assert.equal(payment.status, '已缴费');
  assert.deepEqual(mapPaymentItem({ zfywsj_ids: 'x', order_name: '住宿费' }), {
    academicYear: undefined, semester: undefined, type: undefined, item: '住宿费',
    amount: undefined, status: undefined, paidAt: undefined, orderId: undefined,
    payStart: undefined, payEnd: undefined,
  });
});

test('执行计划课程映射：建议学期优先用网页拼好的学年学期串', () => {
  const course = mapPlanCourse({
    kch: '2AA31001', kcmc: '入学教育', xf: '0.0', zxs: '1', kcxzmc: '素质必修课',
    kclbmc: '素质拓展课程', yyxdxnxqmc: '2025-2026/1', jyxdxnm: '2025-2026', jyxdxqm: '1',
    khfsdm: '考查', kkbmmc: '教务处',
  });
  assert.deepEqual(course, {
    code: '2AA31001', name: '入学教育', credit: 0, hours: 1, nature: '素质必修课',
    category: '素质拓展课程', suggestedTerm: '2025-2026/1', assessMethod: '考查', department: '教务处',
  });
  assert.equal(mapPlanCourse({ kch: 'X', kcmc: 'Y', jyxdxnm: '2024-2025', jyxdxqm: '2' }).suggestedTerm, '2024-2025/2');
});
