const test = require('node:test');
const assert = require('node:assert/strict');

const { AppError } = require('../dist/domain/errors');
const { printJsonEnvelope } = require('../dist/lib/format');
const { reportCommandError } = require('../dist/commands/_shared');

test('JSON success output uses a versioned envelope', () => {
  const original = console.log;
  let output = '';
  console.log = (value) => { output += String(value); };
  try {
    printJsonEnvelope('gpa', { gpa: 4, raw: { secret: true } }, { source: 'test' });
  } finally {
    console.log = original;
  }
  assert.deepEqual(JSON.parse(output), {
    schemaVersion: 1,
    command: 'gpa',
    data: { gpa: 4 },
    meta: { source: 'test' },
    warnings: [],
  });
});

test('JSON errors have stable codes and exit status', () => {
  const original = console.error;
  const previousExitCode = process.exitCode;
  let output = '';
  console.error = (value) => { output += String(value); };
  try {
    reportCommandError(new AppError('SESSION_EXPIRED', 'expired'), 'failed', { json: true, command: 'gpa' });
    assert.equal(process.exitCode, 3);
    assert.equal(JSON.parse(output).error.code, 'SESSION_EXPIRED');
  } finally {
    console.error = original;
    process.exitCode = previousExitCode;
  }
});
