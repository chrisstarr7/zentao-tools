import { assessCompletionComment } from './task-quality.mjs';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function normalizedText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizedNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function resolveTaskAssignee({ profile, requestedAssignee } = {}) {
  const requested = normalizedText(requestedAssignee);
  if (requested) return { account: requested, source: 'user' };

  const current = normalizedText(profile?.account);
  if (current) return { account: current, source: 'current-user' };
  throw new Error('无法确定当前禅道账号；请指定负责人。');
}

export async function readZenTaoTaskRaw({ taskId, command = 'zentao' } = {}) {
  const id = normalizedText(taskId);
  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    throw new Error('Raw task read-back requires a positive numeric task ID.');
  }

  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      command,
      ['task', id, '--format', 'raw'],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        shell: process.platform === 'win32',
        windowsHide: true,
      },
    ));
  } catch (error) {
    const detail = normalizedText(error.stderr) || normalizedText(error.message) || 'unknown CLI error';
    throw new Error(`读取禅道任务 ${id} 的 raw 结果失败：${detail}`);
  }

  try {
    return JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim());
  } catch {
    throw new Error('禅道 raw 结果不是有效 JSON；停止核验，不能把命令输出当作成功。');
  }
}

export function assessRawCompletionReadback(raw, expected = {}) {
  const task = raw?.task;
  const actions = Array.isArray(raw?.actions) ? raw.actions : [];
  const finishedActions = actions.filter(action => action?.action === 'finished');
  const action = finishedActions.at(-1);
  const consumedHistory = [...(Array.isArray(action?.history) ? action.history : [])]
    .reverse()
    .find(item => item?.field === 'consumed');
  const consumedBefore = normalizedNumber(consumedHistory?.old);
  const consumedAfter = normalizedNumber(consumedHistory?.new);
  const currentConsumed = consumedBefore !== null && consumedAfter !== null
    ? consumedAfter - consumedBefore
    : null;
  const expectedTaskId = normalizedText(expected.taskId);
  const expectedStory = normalizedText(expected.storyId);
  const expectedAssignee = normalizedText(expected.assignedTo);
  const expectedRealStarted = normalizedText(expected.realStarted);
  const expectedFinishedDate = normalizedText(expected.finishedDate);
  const expectedComment = normalizedText(expected.comment);
  const storedComment = normalizedText(action?.comment);
  const storyValues = [task?.story, task?.storyID]
    .filter(value => value !== null && value !== undefined && normalizedText(value));
  const expectedConsumedBefore = normalizedNumber(expected.consumedBefore);
  const expectedCurrentConsumed = normalizedNumber(expected.currentConsumed);
  const expectedConsumedAfter = normalizedNumber(expected.consumedAfter);
  const commentQuality = assessCompletionComment(action?.comment);

  const checks = {
    response: normalizedText(raw?.status).toLowerCase() === 'success',
    taskIdentity: Boolean(task) && normalizedText(task?.id) === expectedTaskId,
    finishActionIdentity: Boolean(action) && normalizedText(action?.objectID) === expectedTaskId,
    status: normalizedText(task?.status).toLowerCase() === 'done',
    story: Boolean(expectedStory)
      && storyValues.length > 0
      && storyValues.every(value => normalizedText(value) === expectedStory),
    assignedTo: Boolean(expectedAssignee) && normalizedText(task?.assignedTo) === expectedAssignee,
    type: Boolean(normalizedText(expected.type))
      && normalizedText(task?.type) === normalizedText(expected.type),
    estimate: normalizedNumber(expected.estimate) !== null
      && normalizedNumber(task?.estimate) === normalizedNumber(expected.estimate),
    realStarted: Boolean(expectedRealStarted)
      && normalizedText(task?.realStarted) === expectedRealStarted,
    finishedDate: Boolean(expectedFinishedDate)
      && normalizedText(task?.finishedDate) === expectedFinishedDate,
    consumptionPlan: expectedConsumedBefore !== null
      && expectedCurrentConsumed !== null
      && expectedConsumedAfter !== null
      && expectedConsumedAfter === expectedConsumedBefore + expectedCurrentConsumed,
    consumedBefore: expectedConsumedBefore !== null && consumedBefore === expectedConsumedBefore,
    currentConsumed: expectedCurrentConsumed !== null && currentConsumed === expectedCurrentConsumed,
    consumedAfter: expectedConsumedAfter !== null && consumedAfter === expectedConsumedAfter,
    accumulatedConsumed: expectedConsumedAfter !== null
      && normalizedNumber(task?.consumed) === expectedConsumedAfter,
    commentQuality: commentQuality.passed,
    exactComment: Boolean(expectedComment) && storedComment === expectedComment,
  };
  const labels = {
    response: '禅道 raw 返回未明确成功。',
    taskIdentity: 'raw 返回的任务 ID 与目标任务不一致。',
    finishActionIdentity: '最近一条完成动作不属于目标任务。',
    status: '任务状态不是 done。',
    story: '任务原生关联需求与期望值不一致。',
    assignedTo: '任务负责人与期望值不一致。',
    type: '任务类型与期望值不一致。',
    estimate: '任务预估工时与期望值不一致。',
    realStarted: '任务实际开始时间与期望值不一致。',
    finishedDate: '任务实际完成时间与期望值不一致。',
    consumptionPlan: '期望文件中的完成后累计工时不等于完成前工时加本次工时。',
    consumedBefore: '完成动作中的完成前累计工时与期望值不一致。',
    currentConsumed: '完成动作中的本次消耗与期望值不一致。',
    consumedAfter: '完成动作中的完成后累计工时与期望值不一致。',
    accumulatedConsumed: '任务当前累计消耗与完成后期望值不一致。',
    commentQuality: '完成备注未达到 5/5 质量门槛。',
    exactComment: '禅道保存的完成备注与确认内容不一致。',
  };
  const issues = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => labels[name]);

  return {
    passed: issues.length === 0,
    taskId: expectedTaskId || null,
    finishActionId: action?.id ? String(action.id) : null,
    values: {
      consumedBefore,
      currentConsumed,
      consumedAfter,
      realStarted: task?.realStarted ?? null,
      finishedDate: task?.finishedDate ?? null,
    },
    checks,
    issues,
  };
}

function parseArgs(argv) {
  const [kind, ...rest] = argv;
  const options = { kind };
  for (let index = 0; index < rest.length; index++) {
    const argument = rest[index].replace(/^--/, '');
    const separator = argument.indexOf('=');
    const key = separator < 0 ? argument : argument.slice(0, separator);
    const inline = separator < 0 ? undefined : argument.slice(separator + 1);
    if (!['profile-account', 'requested', 'task', 'expected-file'].includes(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
    const value = inline ?? rest[++index];
    if (value === undefined) throw new Error(`Missing value for --${key}`);
    options[key] = value;
  }
  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.kind === 'assignee') {
    process.stdout.write(`${JSON.stringify(resolveTaskAssignee({
      profile: { account: options['profile-account'] },
      requestedAssignee: options.requested,
    }))}\n`);
    return;
  }
  if (options.kind === 'verify-completion') {
    const taskId = normalizedText(options.task);
    if (!/^\d+$/.test(taskId) || Number(taskId) <= 0) {
      throw new Error('Completion read-back requires --task with the target task ID.');
    }
    if (!options['expected-file']) {
      throw new Error('Completion read-back requires --expected-file with the verified expectations.');
    }
    let expected;
    try { expected = JSON.parse(await fs.readFile(options['expected-file'], 'utf8')); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error('Completion expectations must contain valid JSON.');
      throw error;
    }
    if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
      throw new Error('Completion expectations must be a JSON object.');
    }
    if (expected.taskId !== undefined && normalizedText(expected.taskId) !== taskId) {
      throw new Error('The expected task ID does not match --task.');
    }
    expected.taskId = taskId;
    const raw = await readZenTaoTaskRaw({ taskId });
    const result = assessRawCompletionReadback(raw, expected);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
    return;
  }
  throw new Error('Use assignee or verify-completion.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
