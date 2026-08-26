const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  mapAcademiaCourseItem,
  mapScheduleItem,
  mapScoreItem,
  mapSelectedCourseItem,
} = require('../dist/infrastructure/jwgl/mappers');
const { assertPdfResponse, assertReadableResponse } = require('../dist/infrastructure/jwgl/response-policy');
const { encryptPassword } = require('../dist/infrastructure/jwgl/rsa');

test('score DTO maps into the stable domain model', () => {
  assert.deepEqual(mapScoreItem({ kcmc: '软件工程', kch: 'CS101', xf: '3.0', cj: '90', jd: '4.0' }), {
    courseName: '软件工程', courseCode: 'CS101', courseNature: '', credit: 3,
    score: '90', score100: '', gpa: 4, college: '', teacher: '', assessMethod: '',
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
  assert.throws(() => assertReadableResponse({ status: 302, data: '', headers: {} }), (error) => error.code === 'SESSION_EXPIRED');
  assert.throws(() => assertReadableResponse({ status: 429, data: '', headers: {} }), (error) => error.code === 'RATE_LIMITED');
  assert.throws(() => assertPdfResponse(200, Buffer.from('<html>not pdf</html>')), (error) => error.code === 'PROTOCOL_CHANGED');
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
