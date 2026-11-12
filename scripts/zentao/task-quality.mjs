import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DESCRIPTION_FIELDS = [
  '关联需求',
  '需求理解',
  '覆盖范围',
  '验收标准',
  '实现思路',
  '业务规则与数据处理',
  '异常场景',
  '前置依赖',
  '交付结果',
  '实施步骤',
];

const COMPLETION_FIELDS = [
  '完成状态',
  '实际完成内容',
  '实现过程',
  '需求符合情况',
  '验证结果',
  '遗留问题',
];

const CODE_IDENTIFIER_PATTERNS = [
  { label: '代码文件', pattern: /(?<![\w.-])(?:[A-Za-z]:\\|(?:[\w.-]+[\\/])*[\w.-]+\.(?:java|kt|kts|gradle|py|js|mjs|cjs|ts|tsx|jsx|vue|go|rs|cs|php|rb|swift|c|cc|cpp|h|hpp|yml|yaml|xml|sql|properties|toml|json|html|css|scss|less|sh|ps1|bat|cmd))(?=\b|$)/gim },
  { label: '代码类型', pattern: /\b[A-Za-z_$][\w$]*(?:Service|ServiceImpl|Controller|Mapper|Repository|Dao|DAO|Impl|Adapter|Handler|Manager)\b/g },
  { label: '包名', pattern: /\b(?:package\s+)?(?:com|org|cn|io)(?:\.[A-Za-z_$][\w$]*){2,}\b/gim },
  { label: '方法或函数', pattern: /\b[A-Za-z_$][\w$]*\s*\(\s*\)/g },
  { label: '代码块', pattern: /```[\s\S]*?```/g },
  { label: '代码组织描述', pattern: /(?:修改|调整|新增|删除).{0,20}(?:类|方法|函数|文件|路径|包名|Service|Controller|Mapper)/gi },
];

const GENERIC_CONTENT = new Set([
  '完成',
  '已完成',
  '任务已完成',
  '开发完成',
  '功能已实现',
  '测试通过',
  '验证通过',
  '无',
  '暂无',
  '待补充',
  '待确认',
  'tbd',
]);

function stripMarkup(value) {
  return value
    .replace(/^\s*(?:[-*]|\d+[.)、])\s*/gm, '')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lineField(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^\\s*(?:[-*]\\s*)?${escaped}\\s*[：:]\\s*(.*)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

function blockField(text, label, knownFields) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`^\\s*(?:[-*]\\s*)?${escaped}\\s*[：:]\\s*(.*)$`, 'm');
  const match = matcher.exec(text);
  if (!match) return '';
  const rest = text.slice(match.index + match[0].length);
  const next = rest.search(new RegExp(
    `^\\s*(?:[-*]\\s*)?(?:${knownFields.map(field => field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[：:]`,
    'm',
  ));
  return `${match[1]}\n${next < 0 ? rest : rest.slice(0, next)}`.trim();
}

function substantive(value, minimum = 8) {
  const clean = stripMarkup(value);
  return clean.length >= minimum && !GENERIC_CONTENT.has(clean.toLowerCase());
}

function listItems(value) {
  return value
    .split(/\r?\n/)
    .map(line => line.match(/^\s*\d+[.)、]\s*(.+)$/)?.[1]?.trim())
    .filter(Boolean);
}

export function findCodeIdentifiers(text) {
  const findings = new Set();
  for (const { pattern } of CODE_IDENTIFIER_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      findings.add(value.length > 120 ? `${value.slice(0, 117)}...` : value);
    }
  }
  return [...findings].sort();
}

function check(name, passed, reason) {
  return { name, passed, reason };
}

export function assessTaskDescription(description, { storyId } = {}) {
  if (typeof description !== 'string' || !description.trim()) {
    return { score: 0, passed: false, checks: [check('描述内容', false, '任务描述为空。')], issues: ['任务描述为空。'] };
  }

  const storyMatch = lineField(description, '关联需求').match(/^#?(\d+)\b/);
  const matchedStory = storyMatch && Number(storyMatch[1]) > 0 ? String(Number(storyMatch[1])) : null;
  const storyText = String(storyId ?? '');
  const expectedStory = /^\d+$/.test(storyText) && Number(storyText) > 0 ? String(Number(storyText)) : null;
  const requirementTrace = Boolean(expectedStory)
    && Boolean(matchedStory)
    && matchedStory === expectedStory
    && substantive(lineField(description, '覆盖范围'), 4);
  const requirementUnderstanding = substantive(lineField(description, '需求理解'), 12);
  const acceptance = substantive(lineField(description, '验收标准'), 8);
  const codeFindings = findCodeIdentifiers(description);
  const implementation = [
    '实现思路',
    '业务规则与数据处理',
    '异常场景',
    '前置依赖',
    '交付结果',
  ].every(field => substantive(lineField(description, field), 4));
  const implementationAndDelivery = implementation && codeFindings.length === 0;
  const steps = listItems(blockField(description, '实施步骤', DESCRIPTION_FIELDS));
  const executable = steps.length >= 3 && steps.every(step => substantive(step, 2));

  const checks = [
    check('需求追溯准确性', requirementTrace, !expectedStory
      ? '必须提供并写明用户指定的需求 ID。'
      : matchedStory && matchedStory !== expectedStory
      ? `描述绑定了需求 ${matchedStory}，与用户指定需求 ${expectedStory} 不一致。`
      : '必须写明用户指定的需求 ID、需求理解范围和覆盖范围。'),
    check('需求理解完整性', requirementUnderstanding, '需求理解必须说明要解决的问题、业务规则和预期结果。'),
    check('边界与验收标准', acceptance, '验收标准必须写成可观察、可验证的结果。'),
    check('实现与交付完整性', implementationAndDelivery, codeFindings.length
      ? `任务描述包含代码标识符：${codeFindings.slice(0, 5).join('、')}。`
      : '必须是业务实现方案，并写清业务规则、异常场景、依赖和交付结果。'),
    check('Agent 可执行性', executable, '实施步骤至少列出三条可执行步骤。'),
  ];
  const issues = checks.filter(item => !item.passed).map(item => item.reason);
  const score = checks.filter(item => item.passed).length;
  return { score, passed: score === 5, checks, issues, codeIdentifiers: codeFindings };
}

export function assessCompletionComment(comment) {
  if (typeof comment !== 'string' || !comment.trim()) {
    return { score: 0, passed: false, checks: [check('完成说明', false, '完成说明为空。')], issues: ['完成说明为空。'] };
  }

  const values = Object.fromEntries(COMPLETION_FIELDS.map(field => [
    field,
    blockField(comment, field, COMPLETION_FIELDS),
  ]));
  const status = /^任务已完成[。.]?$/.test(stripMarkup(values['完成状态']));
  const delivered = substantive(values['实际完成内容'], 12);
  const implementation = substantive(values['实现过程'], 12);
  const requirementMatch = /需求|验收|符合/.test(values['需求符合情况'])
    && substantive(values['需求符合情况'], 10);
  const verification = /测试|验证|检查|构建|用例|未执行|未验证/.test(values['验证结果'])
    && substantive(values['验证结果'], 8);
  const remaining = /^无[。.]?$/u.test(stripMarkup(values['遗留问题']))
    || substantive(values['遗留问题'], 6);

  const checks = [
    check('实际完成内容', delivered, '实际完成内容必须具体说明已交付的功能和结果。'),
    check('实现过程', implementation, '实现过程必须说明主要实现方式和关键业务处理。'),
    check('需求符合情况', requirementMatch, '需求符合情况必须逐项对照需求或验收标准。'),
    check('验证情况', verification, '验证结果必须记录实际执行的检查及结果；未执行时必须明确说明。'),
    check('遗留问题', remaining, '遗留问题必须明确后续事项；没有时必须写“无”。'),
  ];
  const issues = checks.filter(item => !item.passed).map(item => item.reason);
  if (!status) issues.unshift('完成状态必须明确写为“任务已完成”。');
  const contentScore = checks.filter(item => item.passed).length;
  const score = status ? contentScore : Math.min(contentScore, 4);
  return { score, passed: status && score === 5, checks, issues };
}

export function assessTaskBreakdown({ outcomeIds, tasks }) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { passed: false, checks: [check('任务清单', false, '至少需要一个具有独立交付结果的任务。')], issues: ['任务清单为空。'] };
  }
  const expected = Array.isArray(outcomeIds) ? [...new Set(outcomeIds.map(String))] : [];
  const mapped = [];
  const issues = [];
  for (const task of tasks) {
    const ids = Array.isArray(task.outcomeIds) ? task.outcomeIds.map(String) : [];
    if (!task.name || !substantive(task.deliverable, 4) || !substantive(task.acceptance, 4)) {
      issues.push(`任务“${task.name || '未命名'}”缺少名称、交付结果或验收标准。`);
    }
    if (!Number.isFinite(task.estimate) || task.estimate <= 0) issues.push(`任务“${task.name || '未命名'}”缺少有效预估工时。`);
    if (ids.length === 0) issues.push(`任务“${task.name || '未命名'}”未映射任何独立业务结果。`);
    if (findCodeIdentifiers(`${task.name ?? ''}\n${task.deliverable ?? ''}`).length) {
      issues.push(`任务“${task.name || '未命名'}”混入了代码文件或代码结构。`);
    }
    mapped.push(...ids);
  }
  if (expected.length) {
    const duplicates = mapped.filter((id, index) => mapped.indexOf(id) !== index);
    const missing = expected.filter(id => !mapped.includes(id));
    const unexpected = mapped.filter(id => !expected.includes(id));
    if (duplicates.length) issues.push(`以下业务结果被重复拆分：${[...new Set(duplicates)].join('、')}。`);
    if (missing.length) issues.push(`以下业务结果未覆盖：${missing.join('、')}。`);
    if (unexpected.length) issues.push(`任务映射了未确认的业务结果：${[...new Set(unexpected)].join('、')}。`);
  }
  const passed = issues.length === 0;
  return {
    passed,
    checks: [check('业务覆盖与独立验收', passed, issues.join(' ') || '任务已覆盖全部业务结果，且每项都有交付结果和验收标准。')],
    issues,
  };
}

function parseArgs(argv) {
  const options = { kind: 'description', file: null, story: undefined, outcomes: [] };
  for (let index = 0; index < argv.length; index++) {
    const [key, inline] = argv[index].replace(/^--/, '').split('=', 2);
    if (index === 0 && !argv[index].startsWith('--')) {
      options.kind = argv[index];
      continue;
    }
    if (!['kind', 'file', 'story', 'outcomes'].includes(key)) throw new Error(`Unknown option: --${key}`);
    const value = inline ?? argv[++index];
    if (value === undefined) throw new Error(`Missing value for --${key}`);
    if (key === 'outcomes') options.outcomes = value.split(',').map(item => item.trim()).filter(Boolean);
    else options[key] = value;
  }
  return options;
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  try { return JSON.parse(content); }
  catch { throw new Error('Draft file must contain valid JSON.'); }
}

async function main(argv) {
  const options = parseArgs(argv);
  if (!['description', 'completion', 'breakdown'].includes(options.kind)) {
    throw new Error('Use description, completion, or breakdown.');
  }
  let result;
  if (options.kind === 'breakdown') {
    if (!options.file) throw new Error('Breakdown validation requires --file with a JSON draft.');
    const draft = await readJson(options.file);
    result = assessTaskBreakdown({
      outcomeIds: options.outcomes.length ? options.outcomes : draft.outcomeIds,
      tasks: draft.tasks,
    });
  } else {
    if (!options.file) throw new Error('Provide --file with the complete task text.');
    if (options.kind === 'description'
      && (options.story === undefined || !/^\d+$/.test(String(options.story)) || Number(options.story) <= 0)) {
      throw new Error('Description validation requires --story with the user-specified requirement ID.');
    }
    const text = await fs.readFile(options.file, 'utf8');
    result = options.kind === 'description'
      ? assessTaskDescription(text, { storyId: options.story })
      : assessCompletionComment(text);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
