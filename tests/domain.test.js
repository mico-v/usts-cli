const test = require('node:test');
const assert = require('node:assert/strict');

const { currentTerm } = require('../dist/domain/term');
const { AppError, exitCodeForError } = require('../dist/domain/errors');
const { sanitizeTerminalText } = require('../dist/shared/sanitize');

test('currentTerm follows USTS semester codes at month boundaries', () => {
  assert.deepEqual(currentTerm(new Date(2026, 7, 1)), { academicYear: '2026', semester: '3' });
  assert.deepEqual(currentTerm(new Date(2026, 1, 1)), { academicYear: '2025', semester: '12' });
  assert.deepEqual(currentTerm(new Date(2026, 0, 1)), { academicYear: '2025', semester: '3' });
});

test('stable application errors map to documented exit codes', () => {
  assert.equal(exitCodeForError(new AppError('SESSION_EXPIRED', 'expired')), 3);
  assert.equal(exitCodeForError(new AppError('PROTOCOL_CHANGED', 'changed')), 5);
  assert.equal(exitCodeForError(new Error('unknown')), 1);
});

test('terminal sanitizer strips control and ANSI sequences', () => {
  assert.equal(sanitizeTerminalText('\u001b[31m危险\u001b[0m\u0007'), '危险');
  assert.equal(sanitizeTerminalText('第一行\n第二行'), '第一行\n第二行');
});
