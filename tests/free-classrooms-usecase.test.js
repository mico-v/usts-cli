const test = require('node:test');
const assert = require('node:assert/strict');

const { parseNumberList, readFreeClassrooms } = require('../dist/application/usecases/free-classrooms');
const { renderFreeClassrooms } = require('../dist/cli/render/free-classrooms');
const { freeClassCommand } = require('../dist/cli/freeclass');
const { capture } = require('./capture');

const TERM = { xnm: '2026', xqm: '3' };

const MULTIMEDIA = { code: '021293', name: '石5-103', category: '多媒体教室', campus: '石湖', building: '石5', seats: 80, borrowable: '是' };
const LAB = { code: '021294', name: '石5-113', category: '机房', campus: '石湖', building: '石5', seats: 40, borrowable: '否' };
const JIANGFENG = { code: '010001', name: '江J-1', category: '多媒体教室', campus: '江枫', building: '江J', seats: 196, borrowable: '是' };


/** 记录网关收到的查询，便于断言「哪些条件发给了服务端、哪些在本地筛」。 */
function gateway(items = [MULTIMEDIA, LAB, JIANGFENG]) {
  const calls = [];
  return {
    calls,
    queryFreeClassrooms: async (query) => { calls.push(query); return items; },
  };
}

test('时段参数：支持区间、逗号列表与去重排序', () => {
  assert.deepEqual(parseNumberList('3', '周次', 30), [3]);
  assert.deepEqual(parseNumberList('1-4', '周次', 30), [1, 2, 3, 4]);
  assert.deepEqual(parseNumberList('3,5,7', '周次', 30), [3, 5, 7]);
  assert.deepEqual(parseNumberList('3-5,7，9', '周次', 30), [3, 4, 5, 7, 9], '全角逗号也要认');
  assert.deepEqual(parseNumberList('5,5,3', '周次', 30), [3, 5], '去重并升序');
});

test('时段参数：越界或写错一律报参数错误，不静默忽略', () => {
  for (const spec of ['0', '8', 'abc', '5-3', '1-']) {
    assert.throws(() => parseNumberList(spec, '星期', 7), (error) => error.code === 'CONFIGURATION_ERROR', `应拒绝：${spec}`);
  }
  assert.deepEqual(parseNumberList('', '星期', 7), [], '空串 = 不设条件，由调用方决定不传该参数');
});

test('时段过滤：周次/星期/节次必须齐全——少给一项服务端会退化成不过滤', async () => {
  const client = gateway();
  await assert.rejects(
    () => readFreeClassrooms(client, { ...TERM, week: '3' }),
    (error) => error.code === 'CONFIGURATION_ERROR' && /同时给出/.test(error.message),
  );
  await assert.rejects(
    () => readFreeClassrooms(client, { ...TERM, week: '3', weekday: '3' }),
    (error) => error.code === 'CONFIGURATION_ERROR',
  );
  assert.equal(client.calls.length, 0, '参数不齐时不该发请求');
});

test('时段过滤：三项齐全时归一成数字数组发给网关', async () => {
  const client = gateway();
  await readFreeClassrooms(client, { ...TERM, week: '1-2', weekday: '1,3', section: '5-6' });
  assert.deepEqual(client.calls[0], {
    xnm: '2026', xqm: '3', weeks: [1, 2], weekdays: [1, 3], sections: [5, 6],
  });
});

test('名称与座位筛选在本地做，服务端只收到时段条件', async () => {
  const client = gateway();
  const view = await readFreeClassrooms(client, { ...TERM, campus: '石湖', type: '多媒体', minSeats: 60 });

  assert.deepEqual(client.calls[0], { xnm: '2026', xqm: '3', weeks: [], weekdays: [], sections: [] });
  assert.deepEqual(view.items.map((room) => room.name), ['石5-103']);
  assert.equal(view.total, 3, 'total 是筛选前的场地数，用来区分「本来就没有」与「被筛掉了」');
});

test('名称筛选按子串且大小写不敏感；场地名也参与匹配', async () => {
  const client = gateway();
  const byBuilding = await readFreeClassrooms(client, { ...TERM, building: '石5' });
  assert.deepEqual(byBuilding.items.map((room) => room.name), ['石5-103', '石5-113']);

  const byName = await readFreeClassrooms(client, { ...TERM, name: 'j-1' });
  assert.deepEqual(byName.items.map((room) => room.name), ['江J-1'], '名称子串匹配要忽略大小写');
});

test('无时段条件时列表是该学期全部场地，渲染要给出口径提示', () => {
  const view = { items: [MULTIMEDIA], total: 946, criteria: { weeks: [], weekdays: [], sections: [] } };
  const output = capture(() => renderFreeClassrooms(view, TERM, 50));

  assert.match(output, /空闲教室\s+2026-2027 学年 · 第一学期/);
  assert.match(output, /未指定时段：下面是该学期全部场地/, '不说清楚口径，用户会以为这就是「空闲」');
  assert.match(output, /共 1 间场地/);
});

test('时段条件与筛选条件都写进标题，超出 --limit 时说明只显示了多少', () => {
  const view = {
    items: [MULTIMEDIA, LAB, JIANGFENG],
    total: 3,
    criteria: { weeks: [3], weekdays: [3], sections: [5, 6], campus: '石湖', minSeats: 40 },
  };
  const output = capture(() => renderFreeClassrooms(view, TERM, 2));

  assert.match(output, /第 3 周 · 周三 · 第 5\/6 节/);
  assert.match(output, /校区含「石湖」/);
  assert.match(output, /座位 ≥ 40/);
  assert.match(output, /共 3 间场地，已显示前 2 间/);
});

test('筛选后为空时区分「该时段没有空闲场地」与「都不符合筛选条件」', () => {
  const noneFree = capture(() => renderFreeClassrooms(
    { items: [], total: 0, criteria: { weeks: [3], weekdays: [3], sections: [5] } }, TERM, 50,
  ));
  assert.match(noneFree, /没有符合条件的场地/);

  const filteredOut = capture(() => renderFreeClassrooms(
    { items: [], total: 770, criteria: { weeks: [3], weekdays: [3], sections: [5] } }, TERM, 50,
  ));
  assert.match(filteredOut, /该时段有 770 间场地空闲，但没有一间符合/);
});

test('--json 契约：data 是场地数组，meta 带学期、筛选前总数与归一后的条件', async () => {
  const client = gateway();
  const output = await collect(() => freeClassCommand(
    { ensureValidSession: async () => 'valid', lastRecovery: () => undefined, ...client },
    { xnm: '2026', xqm: '3', week: '3', weekday: '3', section: '5-6', json: true },
  ));
  const envelope = JSON.parse(output);

  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.command, 'freeclass');
  assert.deepEqual(envelope.data, [MULTIMEDIA, LAB, JIANGFENG]);
  // undefined 归一成 null：字段始终存在，消费方不必区分「缺失」与「空」
  assert.deepEqual(envelope.meta.criteria, {
    weeks: [3], weekdays: [3], sections: [5, 6],
    campus: null, type: null, building: null, name: null, minSeats: null,
  });
  assert.equal(envelope.meta.serverTotal, 3);
  assert.equal(envelope.meta.xnm, '2026');
});

/** 收集命令写到 stdout 的行（JSON 信封走 stdout）。 */
async function collect(fn) {
  const lines = [];
  const original = console.log;
  console.log = (value) => lines.push(String(value));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}
