import assert from 'node:assert/strict';
import test from 'node:test';
import { assessCompletionReadback, resolveTaskAssignee } from '../scripts/zentao/task-policy.mjs';

const completion = `完成状态：任务已完成
实际完成内容：
- 完成资产创建校验和重复提交保护，并阻止无效请求产生资产。
实现过程：
- 先校验业务状态，再执行去重和入库；保存失败时不保留半成品数据。
需求符合情况：
- 符合需求 2796 的状态校验、重复提交和异常提示验收标准。
验证结果：
- 已执行无效状态、重复提交和保存失败场景检查，结果符合预期。
遗留问题：无`;

test('assignment defaults to the current ZenTao account and allows an explicit override', () => {
  assert.deepEqual(resolveTaskAssignee({ profile: { account: 'panglei' } }), {
    account: 'panglei',
    source: 'current-user',
  });
  assert.deepEqual(resolveTaskAssignee({ profile: { account: 'panglei' }, requestedAssignee: 'reviewer' }), {
    account: 'reviewer',
    source: 'user',
  });
  assert.throws(() => resolveTaskAssignee({ profile: {} }), /无法确定当前禅道账号/);
});

test('completion read-back checks status, hours, and the exact saved comment', () => {
  assert.deepEqual(assessCompletionReadback({
    status: 'done',
    actualHours: 2.5,
    expectedHours: 2.5,
    comment: completion,
    expectedComment: completion,
  }), {
    passed: true,
    checks: { status: true, hours: true, commentQuality: true, exactComment: true },
  });

  const mismatch = assessCompletionReadback({
    status: 'done',
    actualHours: 2,
    expectedHours: 2.5,
    comment: completion.replace('遗留问题：无', '遗留问题：待跟进'),
    expectedComment: completion,
  });
  assert.equal(mismatch.passed, false);
  assert.equal(mismatch.checks.hours, false);
  assert.equal(mismatch.checks.exactComment, false);
  assert.equal(assessCompletionReadback({
    status: 'done',
    actualHours: 2.5,
    expectedHours: 2.5,
    comment: completion,
  }).passed, false);
});

test('a transport-level 401 can resume a read once authentication succeeds', async () => {
  const { classifyZenTaoError } = await import('../scripts/zentao/error-policy.mjs');
  const policy = classifyZenTaoError({ status: 401, source: 'transport', operation: 'read', attempt: 0 });
  const calls = [];
  const login = async () => calls.push('login');
  const read = async () => {
    calls.push('read');
    return [{ id: 6163 }];
  };

  if (policy.openLogin) await login();
  const result = policy.retryable ? await read() : null;

  assert.deepEqual(calls, ['login', 'read']);
  assert.deepEqual(result, [{ id: 6163 }]);
});
