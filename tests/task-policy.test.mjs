import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assessRawCompletionReadback,
  resolveTaskAssignee,
} from '../scripts/zentao/task-policy.mjs';

const execFileAsync = promisify(execFile);
const policyScript = fileURLToPath(new URL('../scripts/zentao/task-policy.mjs', import.meta.url));

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

const expectedCompletion = {
  taskId: '6163',
  storyId: '2796',
  assignedTo: 'panglei',
  type: 'devel',
  estimate: 2.5,
  realStarted: '2026-11-12 13:30:00',
  finishedDate: '2026-11-12 16:00:00',
  consumedBefore: 1,
  currentConsumed: 2.5,
  consumedAfter: 3.5,
  comment: completion,
};

function rawCompletion(overrides = {}) {
  return {
    status: 'success',
    task: {
      id: '6163',
      story: '2796',
      storyID: '2796',
      type: 'devel',
      assignedTo: 'panglei',
      estimate: '2.50',
      consumed: '3.50',
      status: 'done',
      realStarted: '2026-11-12 13:30:00',
      finishedDate: '2026-11-12 16:00:00',
      ...overrides.task,
    },
    actions: overrides.actions ?? [{
      id: '100065',
      objectID: '6163',
      action: 'finished',
      comment: completion,
      history: [
        { field: 'realStarted', old: '', new: '2026-11-12 13:30' },
        { field: 'consumed', old: '1.00', new: '3.50' },
        { field: 'status', old: '进行中', new: '已完成' },
        { field: 'finishedDate', old: '', new: '2026-11-12 16:00:00' },
      ],
    }],
  };
}

async function installFakeZenTao(raw) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'zentao-fake-cli-'));
  const fixture = path.join(temp, 'fixture.mjs');
  await writeFile(fixture, `
const args = process.argv.slice(2);
if (args.join(' ') !== 'task 6163 --format raw') {
  process.stderr.write('unexpected arguments: ' + args.join(' '));
  process.exit(2);
}
process.stdout.write(${JSON.stringify(JSON.stringify(raw))});
`);

  if (process.platform === 'win32') {
    await writeFile(
      path.join(temp, 'zentao.cmd'),
      `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`,
    );
  } else {
    const launcher = path.join(temp, 'zentao');
    await writeFile(launcher, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`);
    await chmod(launcher, 0o755);
  }
  return temp;
}

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

test('raw completion read-back separates consumed-before, current, and accumulated hours', () => {
  const result = assessRawCompletionReadback(rawCompletion(), expectedCompletion);

  assert.equal(result.passed, true);
  assert.deepEqual(result.values, {
    consumedBefore: 1,
    currentConsumed: 2.5,
    consumedAfter: 3.5,
    realStarted: '2026-11-12 13:30:00',
    finishedDate: '2026-11-12 16:00:00',
  });
  assert.deepEqual(result.issues, []);
});

test('raw completion read-back uses the latest finish action and rejects mismatches', () => {
  const raw = rawCompletion({
    task: {
      story: '2795',
      assignedTo: 'reviewer',
      consumed: '3.50',
    },
    actions: [
      {
        id: '100064',
        objectID: '6163',
        action: 'finished',
        comment: completion.replace('遗留问题：无', '遗留问题：旧记录'),
        history: [{ field: 'consumed', old: '0', new: '1' }],
      },
      {
        id: '100065',
        objectID: '6163',
        action: 'finished',
        comment: completion.replace('遗留问题：无', '遗留问题：最新记录'),
        history: [{ field: 'consumed', old: '1', new: '3.50' }],
      },
    ],
  });
  const result = assessRawCompletionReadback(raw, expectedCompletion);

  assert.equal(result.finishActionId, '100065');
  assert.equal(result.checks.story, false);
  assert.equal(result.checks.assignedTo, false);
  assert.equal(result.checks.consumedBefore, true);
  assert.equal(result.checks.currentConsumed, true);
  assert.equal(result.checks.consumedAfter, true);
  assert.equal(result.checks.exactComment, false);
  assert.equal(result.passed, false);
});

test('raw completion read-back rejects wrong current and accumulated hours', () => {
  const result = assessRawCompletionReadback(
    rawCompletion({
      task: { consumed: '4.50' },
      actions: [{
        id: '100065',
        objectID: '6163',
        action: 'finished',
        comment: completion,
        history: [{ field: 'consumed', old: '2.00', new: '4.00' }],
      }],
    }),
    expectedCompletion,
  );

  assert.equal(result.checks.consumedBefore, false);
  assert.equal(result.checks.currentConsumed, false);
  assert.equal(result.checks.consumedAfter, false);
  assert.equal(result.checks.accumulatedConsumed, false);
  assert.equal(result.passed, false);
});

test('raw completion read-back rejects an internally inconsistent expected time plan', () => {
  const result = assessRawCompletionReadback(rawCompletion(), {
    ...expectedCompletion,
    consumedAfter: 4,
  });

  assert.equal(result.checks.consumptionPlan, false);
  assert.equal(result.checks.consumedAfter, false);
  assert.equal(result.checks.accumulatedConsumed, false);
  assert.equal(result.passed, false);
});

test('raw completion read-back fails when the finish action or consumption history is missing', () => {
  const noAction = assessRawCompletionReadback(rawCompletion({ actions: [] }), expectedCompletion);
  assert.equal(noAction.passed, false);
  assert.equal(noAction.checks.finishActionIdentity, false);
  assert.equal(noAction.checks.exactComment, false);

  const noHistory = assessRawCompletionReadback(rawCompletion({
    actions: [{
      id: '100065',
      objectID: '6163',
      action: 'finished',
      comment: completion,
      history: [],
    }],
  }), expectedCompletion);
  assert.equal(noHistory.passed, false);
  assert.equal(noHistory.checks.consumedBefore, false);
  assert.equal(noHistory.checks.currentConsumed, false);
});

test('verify-completion CLI invokes task raw and validates the real response fixture', async () => {
  const temp = await installFakeZenTao(rawCompletion());
  const expectedFile = path.join(temp, 'expected.json');
  try {
    await writeFile(expectedFile, JSON.stringify(expectedCompletion));
    const envPath = `${temp}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ''}`;
    const { stdout } = await execFileAsync(
      process.execPath,
      [policyScript, 'verify-completion', '--task', '6163', '--expected-file', expectedFile],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: envPath },
      },
    );
    const result = JSON.parse(stdout);
    assert.equal(result.passed, true);
    assert.equal(result.values.currentConsumed, 2.5);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
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
