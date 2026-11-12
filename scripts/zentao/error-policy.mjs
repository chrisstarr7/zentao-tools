import { pathToFileURL } from 'node:url';

const OPERATION_ALIASES = new Map([
  ['read', 'read'],
  ['get', 'read'],
  ['list', 'read'],
  ['query', 'read'],
  ['create', 'create'],
  ['createTask', 'create'],
  ['update', 'update'],
  ['start', 'start'],
  ['finish', 'finish'],
  ['complete', 'finish'],
  ['upload', 'upload'],
  ['assign', 'assign'],
]);
const READ_OPERATIONS = new Set(['read']);
const AUTH_PATTERN = /\b401\b|unauthori[sz]ed|token\s*(?:expired|invalid|失效|过期)|登录(?:已)?失效|认证(?:已)?失效|重新登录/i;
const NETWORK_PATTERN = /econnreset|econnrefused|enotfound|socket|network|fetch failed|connection (?:reset|closed|interrupted)|连接(?:重置|中断|失败)|网络(?:异常|错误)/i;
const TIMEOUT_PATTERN = /timeout|timed out|超时/i;

export function classifyZenTaoError({
  status,
  message = '',
  source = 'unknown',
  operation = 'unknown',
  attempt = 0,
} = {}) {
  const code = Number(status);
  const text = String(message);
  const normalizedOperation = OPERATION_ALIASES.get(operation) ?? 'unknown';
  const read = READ_OPERATIONS.has(normalizedOperation);
  const write = !read;
  const normalizedSource = ['transport', 'tool-result'].includes(source) ? source : 'unknown';
  const authHint = AUTH_PATTERN.test(text);
  const timeout = code === 408 || TIMEOUT_PATTERN.test(text);
  const network = NETWORK_PATTERN.test(text);

  if (code === 401 || authHint) {
    return {
      category: 'authentication',
      operation: normalizedOperation,
      retryable: read && normalizedSource === 'transport' && attempt < 1,
      writeOutcomeUnknown: write,
      openLogin: true,
      recoveryCommand: 'zentao login --web',
      nonInteractiveCommand: 'zentao login --no-browser',
      wrappedAuthReplayUnverified: normalizedSource !== 'transport',
      nextAction: write
        ? '先完成认证，再查询原任务的当前状态；确认未写入后才能决定是否重试。'
        : normalizedSource !== 'transport'
          ? '打开安全登录入口；当前来源中的 401 不被证明会触发客户端 Header Helper 自动重放。'
          : '让客户端 Header Helper 或 CLI 凭证在认证成功后重试一次；仍失败则停止并报告。',
    };
  }

  if (code === 403) {
    return {
      category: 'permission',
      operation: normalizedOperation,
      retryable: false,
      writeOutcomeUnknown: false,
      openLogin: false,
      nextAction: '按权限不足处理；不要盲目重复登录，展示服务端返回的权限原因。',
    };
  }

  if (code === 429) {
    return {
      category: 'rate-limit',
      operation: normalizedOperation,
      retryable: read && attempt < 3,
      writeOutcomeUnknown: write,
      openLogin: false,
      delayMs: 1000 * (attempt + 1),
      nextAction: write
        ? '先查询原任务状态；写入结果不明确时不得直接重试。'
        : '有限退避后重试只读请求；连续失败时停止并报告。',
    };
  }

  if (code >= 500 && code < 600) {
    return {
      category: 'server',
      operation: normalizedOperation,
      retryable: read && attempt < 2,
      writeOutcomeUnknown: write,
      openLogin: false,
      delayMs: 500 * (attempt + 1),
      nextAction: write
        ? '先查询原任务状态；服务端响应丢失可能发生在写入成功之后。'
        : '有限退避后重试只读请求。',
    };
  }

  if (timeout || network) {
    return {
      category: timeout ? 'timeout' : 'network',
      operation: normalizedOperation,
      retryable: read && attempt < 2,
      writeOutcomeUnknown: write,
      openLogin: false,
      delayMs: 500 * (attempt + 1),
      nextAction: write
        ? '先按任务 ID、需求、负责人和近期时间查询实际状态；未知时停止，禁止盲目重试。'
        : '有限退避后重试只读请求。',
    };
  }

  if (code >= 400 && code < 500) {
    return {
      category: 'business',
      operation: normalizedOperation,
      retryable: false,
      writeOutcomeUnknown: false,
      openLogin: false,
      nextAction: '报告业务参数或服务端校验错误；不要触发登录或盲目重试。',
    };
  }

  if (write) {
    return {
      category: 'ambiguous-write',
      operation: normalizedOperation,
      retryable: false,
      writeOutcomeUnknown: true,
      openLogin: false,
      nextAction: '写入失败原因无法确认；先按任务 ID、需求、负责人和近期时间查询实际状态，未知时停止。',
    };
  }

  return {
    category: 'business',
    operation: normalizedOperation,
    retryable: false,
    writeOutcomeUnknown: false,
    openLogin: false,
    nextAction: '报告业务参数或服务端校验错误；不要触发登录或盲目重试。',
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const [key, inline] = argv[index].replace(/^--/, '').split('=', 2);
    if (!['status', 'message', 'source', 'operation', 'attempt'].includes(key)) throw new Error(`Unknown option: --${key}`);
    const value = inline ?? argv[++index];
    if (value === undefined) throw new Error(`Missing value for --${key}`);
    options[key] = value;
  }
  if (options.status !== undefined && !Number.isFinite(Number(options.status))) throw new Error('--status must be numeric.');
  if (options.attempt !== undefined) options.attempt = Number(options.attempt);
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(classifyZenTaoError(parseArgs(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
