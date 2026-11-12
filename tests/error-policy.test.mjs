import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyZenTaoError } from '../scripts/zentao/error-policy.mjs';

test('401 and token expiry open a safe login recovery path', () => {
  const transport = classifyZenTaoError({ status: 401, source: 'transport', operation: 'read' });
  assert.equal(transport.category, 'authentication');
  assert.equal(transport.openLogin, true);
  assert.equal(transport.wrappedAuthReplayUnverified, false);
  assert.equal(classifyZenTaoError({ status: 401, operation: 'read', attempt: 1 }).retryable, false);

  const wrapped = classifyZenTaoError({ status: 200, message: 'HTTP 401: token expired', source: 'tool-result', operation: 'create' });
  assert.equal(wrapped.category, 'authentication');
  assert.equal(wrapped.wrappedAuthReplayUnverified, true);
  assert.equal(wrapped.retryable, false);
  assert.equal(wrapped.writeOutcomeUnknown, true);
  assert.match(wrapped.nextAction, /查询原任务/);

  const wrappedRead = classifyZenTaoError({ status: 200, message: 'HTTP 401', source: 'tool-result', operation: 'read' });
  assert.equal(wrappedRead.retryable, false);
  assert.match(wrappedRead.nextAction, /不被证明/);
});

test('403 permission does not cause blind re-login', () => {
  const result = classifyZenTaoError({ status: 403, message: '无权访问该执行', operation: 'update' });
  assert.equal(result.category, 'permission');
  assert.equal(result.openLogin, false);
  assert.equal(result.retryable, false);

  const expired = classifyZenTaoError({ status: 403, message: 'token expired', operation: 'read' });
  assert.equal(expired.category, 'authentication');
  assert.equal(expired.openLogin, true);
});

test('429, 5xx, and network reads use bounded retries', () => {
  for (const [status, message, category] of [[429, 'too many requests', 'rate-limit'], [503, 'service unavailable', 'server'], [0, 'ECONNRESET', 'network']]) {
    const result = classifyZenTaoError({ status, message, operation: 'read', attempt: 0 });
    assert.equal(result.category, category);
    assert.equal(result.retryable, true);
    assert.ok(result.delayMs > 0);
  }
  assert.equal(classifyZenTaoError({ status: 503, operation: 'read', attempt: 2 }).retryable, false);
});

test('uncertain writes require a state query before retry', () => {
  for (const input of [
    { status: 0, message: 'connection reset', operation: 'create' },
    { status: 504, operation: 'finish' },
    { status: 0, message: 'request timed out', operation: 'update' },
  ]) {
    const result = classifyZenTaoError(input);
    assert.equal(result.retryable, false);
    assert.equal(result.writeOutcomeUnknown, true);
    assert.match(result.nextAction, /先.*查询|状态/);
  }
});

test('business validation errors do not login or retry', () => {
  const result = classifyZenTaoError({ status: 400, message: 'estimate is required', operation: 'create' });
  assert.equal(result.category, 'business');
  assert.equal(result.openLogin, false);
  assert.equal(result.retryable, false);
});

test('operation aliases normalize and unknown operations fail closed as unsafe writes', () => {
  const aliased = classifyZenTaoError({ status: 503, operation: 'createTask' });
  assert.equal(aliased.category, 'server');
  assert.equal(aliased.operation, 'create');
  assert.equal(aliased.retryable, false);
  assert.equal(aliased.writeOutcomeUnknown, true);

  const unknown = classifyZenTaoError({ status: 503, operation: 'completeTask' });
  assert.equal(unknown.operation, 'unknown');
  assert.equal(unknown.retryable, false);
  assert.equal(unknown.writeOutcomeUnknown, true);
});

test('omitted auth source is not assumed to be transport level', () => {
  const result = classifyZenTaoError({ status: 401, operation: 'read', attempt: 0 });
  assert.equal(result.retryable, false);
  assert.equal(result.wrappedAuthReplayUnverified, true);
});

test('unknown write failures require state inspection instead of business-error handling', () => {
  for (const message of ['invalid response', 'unexpected response', 'parse error']) {
    const result = classifyZenTaoError({ operation: 'create', message });
    assert.equal(result.category, 'ambiguous-write');
    assert.equal(result.retryable, false);
    assert.equal(result.writeOutcomeUnknown, true);
    assert.match(result.nextAction, /查询实际状态/);
  }
  assert.equal(classifyZenTaoError({ status: 400, message: 'estimate is required', operation: 'create' }).category, 'business');
});
