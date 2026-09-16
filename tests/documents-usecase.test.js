const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_ACADEMIA_PDF_NAME,
  defaultSchedulePdfName,
  saveAcademiaPdf,
  saveSchedulePdf,
} = require('../dist/application/usecases/documents');
const { FileDocumentStore } = require('../dist/infrastructure/documents/file-document-store');

/** 内存版落盘：记录调用，用于断言「先判存在、再下载」这类顺序规则。 */
function memoryStore(existing = []) {
  const written = [];
  return {
    written,
    exists: (destination) => existing.includes(destination),
    write: (destination, bytes) => {
      written.push({ destination, bytes });
      return path.resolve(destination);
    },
  };
}

test('缺省文件名：课表带学年学期，成绩总表固定', () => {
  assert.equal(defaultSchedulePdfName('2026', '3'), 'schedule-2026-3.pdf');
  assert.equal(defaultSchedulePdfName('2026', ''), 'schedule-2026-all.pdf', '全部学期也要能区分');
  assert.equal(DEFAULT_ACADEMIA_PDF_NAME, 'transcript.pdf');
});

test('课表 PDF：目标已存在且未加 --force 时**先**拒绝，不去跑下载链', async () => {
  let downloaded = 0;
  const client = { downloadSchedulePdf: async () => { downloaded += 1; return Buffer.from('%PDF-1.4'); } };
  const store = memoryStore(['schedule-2026-3.pdf']);

  await assert.rejects(
    () => saveSchedulePdf(client, store, { xnm: '2026', xqm: '3' }),
    (error) => {
      assert.equal(error.code, 'FILE_SYSTEM_ERROR');
      assert.match(error.message, /目标文件已存在：schedule-2026-3\.pdf（使用 --force 覆盖）/);
      return true;
    },
  );

  assert.equal(downloaded, 0, '已存在就该立刻失败，不该先吃一次 WAF 配额');
  assert.equal(store.written.length, 0);
});

test('课表 PDF：--force 覆盖，文件名与内容原样落盘', async () => {
  const bytes = Buffer.from('%PDF-1.4 fake');
  const client = { downloadSchedulePdf: async (xnm, xqm) => { assert.equal(xnm, '2026'); assert.equal(xqm, '3'); return bytes; } };
  const store = memoryStore(['schedule-2026-3.pdf']);

  const saved = await saveSchedulePdf(client, store, { xnm: '2026', xqm: '3', force: true });

  assert.equal(saved, path.resolve('schedule-2026-3.pdf'));
  assert.deepEqual(store.written, [{ destination: 'schedule-2026-3.pdf', bytes }]);
});

test('成绩总表 PDF：缺省 transcript.pdf，可指定输出路径', async () => {
  const client = { downloadAcademiaPdf: async () => Buffer.from('%PDF-1.4') };

  const byDefault = memoryStore();
  await saveAcademiaPdf(client, byDefault);
  assert.equal(byDefault.written[0].destination, 'transcript.pdf');

  const custom = memoryStore();
  await saveAcademiaPdf(client, custom, { output: 'grades/2026.pdf' });
  assert.equal(custom.written[0].destination, 'grades/2026.pdf');
});

test('文件落盘：原子写入、0600 权限、不留临时文件', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usts-doc-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'schedule.pdf');
  const store = new FileDocumentStore();

  assert.equal(store.exists(destination), false);
  const saved = store.write(destination, Buffer.from('%PDF-1.4 hello'));

  assert.equal(saved, destination);
  assert.equal(store.exists(destination), true);
  assert.equal(fs.readFileSync(destination, 'utf8'), '%PDF-1.4 hello');
  assert.equal(fs.statSync(destination).mode & 0o777, 0o600, 'PDF 含成绩与学籍信息，权限必须是 0600');
  assert.deepEqual(fs.readdirSync(root), ['schedule.pdf'], '临时文件必须被 rename 掉');
});
