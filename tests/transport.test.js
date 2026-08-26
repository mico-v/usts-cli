const test = require('node:test');
const assert = require('node:assert/strict');

const { executeWithRetry } = require('../dist/infrastructure/http/transport');

test('read operations retry retryable connection failures', async () => {
  let attempts = 0;
  const result = await executeWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('ECONNRESET');
    return { status: 200 };
  }, { effect: 'read', sleep: async () => {}, random: () => 0 });
  assert.equal(result.status, 200);
  assert.equal(attempts, 3);
});

test('mutation operations are never retried automatically', async () => {
  let attempts = 0;
  await assert.rejects(
    executeWithRetry(async () => {
      attempts += 1;
      throw new Error('ECONNRESET');
    }, { effect: 'mutation', sleep: async () => {} }),
    /网络请求失败/,
  );
  assert.equal(attempts, 1);
});
