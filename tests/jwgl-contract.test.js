const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  mapAcademiaCourseItem,
  mapCourseListItem,
  mapExamItem,
  mapScheduleItem,
  mapScoreItem,
  mapSelectedCourseItem,
} = require('../dist/infrastructure/jwgl/mappers');
const { assertPdfResponse, assertReadableResponse, classifyResponse } = require('../dist/infrastructure/jwgl/response-policy');
const { AppError, isAmbiguousRejection, isSessionExpired } = require('../dist/domain/errors');
const { encryptPassword } = require('../dist/infrastructure/jwgl/rsa');

test('score DTO maps into the stable domain model', () => {
  assert.deepEqual(mapScoreItem({ kcmc: '软件工程', kch: 'CS101', xf: '3.0', cj: '90', jd: '4.0' }), {
    courseName: '软件工程', courseCode: 'CS101', courseNature: '', credit: 3,
    score: '90', gpa: 4, college: '', teacher: '', assessMethod: '',
    examType: '', academicYear: '', semester: '', className: '', major: '', teachingClass: '',
  });
});

test('schedule and selected-course DTOs normalize numbers and HTML', () => {
  const schedule = mapScheduleItem({ kcmc: '编译原理', jc: '5-6节', xqj: '2', xf: '2.5' });
  assert.equal(schedule.startSection, 5);
  assert.equal(schedule.endSection, 6);
  assert.equal(schedule.weekday, 2);

  const selected = mapSelectedCourseItem({ kcmc: '编译原理', jxbrs: '60人', yxzrs: '58', jxdd: '<b>教一楼</b>' });
  assert.equal(selected.capacity, 60);
  assert.equal(selected.selectedNumber, 58);
  assert.equal(selected.place, '教一楼');
});

test('gross remote protocol changes fail explicitly', () => {
  assert.throws(() => mapScoreItem({ unexpected: true }), /缺少预期字段/);
  assert.throws(() => mapAcademiaCourseItem({ unexpected: true }), /缺少预期字段/);
});

test('response policy classifies session, rate-limit and PDF protocol failures', () => {
  const loginRedirect = { status: 302, data: '', headers: { location: '/jwglxt/xtgl/login_slogin.html' } };
  assert.throws(() => assertReadableResponse(loginRedirect), (error) => error.code === 'SESSION_EXPIRED');
  assert.throws(() => assertReadableResponse({ status: 200, data: '<html>请先登录</html>', headers: {} }), (error) => error.code === 'SESSION_EXPIRED');
  assert.throws(() => assertReadableResponse({ status: 429, data: '', headers: {} }), (error) => error.code === 'RATE_LIMITED');
  assert.throws(() => assertReadableResponse({ status: 502, data: '', headers: {} }), (error) => error.code === 'REMOTE_SERVER_ERROR');
  assert.throws(() => assertPdfResponse(200, Buffer.from('<html>not pdf</html>')), (error) => error.code === 'PROTOCOL_CHANGED');
});

test('ambiguous rejections are marked, not guessed as session expiry', () => {
  const classify = (response) => classifyResponse(response);

  // 有 Location 但不是登录页：可能是下载跳转或 WAF 挑战页，不足以判定失效
  assert.equal(classify({ status: 302, data: '', headers: { location: '/jwglxt/x.pdf' } }), 'ambiguous');
  // 无 Location 的畸形 3xx 同样不下结论
  assert.equal(classify({ status: 302, data: '', headers: {} }), 'ambiguous');
  assert.equal(classify({ status: 401, data: '', headers: {} }), 'ambiguous');
  // 2026-09 实测：数据 Action 未认证返回 901 + 空 body，是会话失效的正面证据
  assert.equal(classify({ status: 901, data: '', headers: {} }), 'session-expired');
  assert.throws(() => assertReadableResponse({ status: 901, data: '', headers: {} }), (error) => error.code === 'SESSION_EXPIRED');
  // 200 + JSON 在分类器看来没有失效特征；`{"status":910}` 这类拒绝包裹体
  // 由 postGrid 的响应形状校验拦下（见 client.ts / 集成测试）。
  assert.equal(classify({ status: 200, data: '{"status":910}', headers: {} }), 'ok');
  assert.equal(classify({ status: 200, data: '{"items":[]}', headers: {} }), 'ok');

  assert.throws(
    () => assertReadableResponse({ status: 302, data: '', headers: {} }),
    (error) => error.code === 'PROTOCOL_CHANGED' && isAmbiguousRejection(error),
  );
  assert.equal(isAmbiguousRejection(new AppError('SESSION_EXPIRED', 'x')), false);
  assert.equal(isSessionExpired(new AppError('SESSION_EXPIRED', 'x')), true);
  assert.equal(isSessionExpired(new AppError('PROTOCOL_CHANGED', 'x')), false);
});

test('exam and course-list DTOs map into stable domain models', () => {
  const exam = mapExamItem({ kcmc: '编译原理', kssj: '2026-01-12 09:00', cdmc: '教一楼101', zwh: '12', ksxzmc: '期末' });
  assert.deepEqual(exam, {
    courseName: '编译原理', examTime: '2026-01-12 09:00', location: '教一楼101', seat: '12', examType: '期末',
  });

  // 教师字段是 jsmc（不是 jsxm）——这是课程的实测字段名
  const course = mapCourseListItem({ kcmc: '软件工程', kch: 'CS101', xf: '3.0', jsmc: '王老师', jxbmc: '软工01班' });
  assert.equal(course.teacher, '王老师');
  assert.equal(course.credit, '3.0');
  assert.equal(course.teachingClass, '软工01班');

  assert.throws(() => mapExamItem({ unexpected: true }), /缺少预期字段/);
  assert.throws(() => mapCourseListItem({ unexpected: true }), /缺少预期字段/);
});

test('RSA login encryption remains PKCS#1 v1.5 compatible', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  const jwk = publicKey.export({ format: 'jwk' });
  const toBase64 = (base64url) => Buffer.from(base64url, 'base64url').toString('base64');
  const encrypted = encryptPassword('secret-password', toBase64(jwk.n), toBase64(jwk.e));
  const plain = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(encrypted, 'base64'),
  );
  assert.equal(plain.toString(), 'secret-password');
});
