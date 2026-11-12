import { assessCompletionComment } from './task-quality.mjs';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';

function normalizedText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function resolveTaskAssignee({ profile, requestedAssignee } = {}) {
  const requested = normalizedText(requestedAssignee);
  if (requested) return { account: requested, source: 'user' };

  const current = normalizedText(profile?.account);
  if (current) return { account: current, source: 'current-user' };
  throw new Error('无法确定当前禅道账号；请指定负责人。');
}

export function assessCompletionReadback({
  status,
  actualHours,
  expectedHours,
  comment,
  expectedComment,
} = {}) {
  const statusOK = normalizedText(status).toLowerCase() === 'done';
  const hoursOK = Number.isFinite(Number(actualHours))
    && Number.isFinite(Number(expectedHours))
    && Number(actualHours) === Number(expectedHours);
  const commentQuality = assessCompletionComment(comment);
  const exactComment = expectedComment !== undefined
    && normalizedText(comment) === normalizedText(expectedComment);
  const passed = statusOK && hoursOK && commentQuality.passed && exactComment;
  return {
    passed,
    checks: {
      status: statusOK,
      hours: hoursOK,
      commentQuality: commentQuality.passed,
      exactComment,
    },
  };
}

function parseArgs(argv) {
  const [kind, ...rest] = argv;
  const options = { kind };
  for (let index = 0; index < rest.length; index++) {
    const [key, inline] = rest[index].replace(/^--/, '').split('=', 2);
    if (!['profile-account', 'requested', 'file'].includes(key)) throw new Error(`Unknown option: --${key}`);
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
  if (options.kind === 'readback') {
    if (!options.file) throw new Error('Readback validation requires --file with a JSON fixture.');
    let input;
    try { input = JSON.parse(await fs.readFile(options.file, 'utf8')); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error('Readback fixture must contain valid JSON.');
      throw error;
    }
    const result = assessCompletionReadback(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
    return;
  }
  throw new Error('Use assignee or readback.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
