import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assessCompletionComment,
  assessTaskBreakdown,
  assessTaskDescription,
  findCodeIdentifiers,
} from '../scripts/zentao/task-quality.mjs';

const execFileAsync = promisify(execFile);
const qualityScript = fileURLToPath(new URL('../scripts/zentao/task-quality.mjs', import.meta.url));

const description = `## 一、需求理解及对应范围
- 关联需求：#2796 资产创建校验
- 需求理解：用户创建资产时需要根据素材来源和业务状态判断是否允许入库。
- 覆盖范围：覆盖资产创建校验、重复提交处理和异常状态提示。
- 验收标准：不符合条件的请求不会产生资产，重复提交只保留一次有效结果。

## 二、业务实现方案
- 实现思路：先校验业务状态，再完成去重，最后写入资产并返回处理结果。
- 业务规则与数据处理：素材必须来源明确；资产状态必须允许创建；业务字段保存成功后才对用户可见。
- 异常场景：状态无效、重复请求、保存失败时给出明确提示，且不留下半成品数据。
- 前置依赖：暂无已知依赖。
- 交付结果：可验证的资产创建能力、重复提交保护和异常提示。
- 实施步骤：
  1. 核对需求规则和现有业务边界。
  2. 实现状态校验、去重、入库及异常处理。
  3. 验证正常、重复、无效状态和保存失败场景。`;

const completion = `完成状态：任务已完成
实际完成内容：
- 完成资产创建前的来源和状态校验，并阻止无效请求入库。
- 增加重复提交保护，相同请求只保留一次有效结果。
实现过程：
- 在资产创建流程中先完成业务规则校验，再执行去重和入库；保存失败时回滚本次处理。
需求符合情况：
- 符合需求 2796 的状态校验、重复提交处理和异常提示验收标准。
验证结果：
- 已执行状态无效、重复提交和保存失败场景检查，结果均符合预期；未执行生产环境验证。
遗留问题：无`;

test('a complete business description reaches a real 5/5 gate', () => {
  const result = assessTaskDescription(description, { storyId: 2796 });
  assert.equal(result.score, 5);
  assert.equal(result.passed, true);
  assert.deepEqual(result.issues, []);
});

test('description rejects missing story trace or acceptance even when headings exist', () => {
  const result = assessTaskDescription(description.replace('#2796', '#2795').replace(/验收标准：.*/u, '验收标准：待补充'), { storyId: 2796 });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(issue => issue.includes('不一致')));
  assert.ok(result.issues.some(issue => issue.includes('验收标准')));
  assert.equal(assessTaskDescription(description).passed, false);
  assert.equal(assessTaskDescription(description.replace('#2796', '#0'), { storyId: 0 }).passed, false);
});

test('description rejects code identifiers and method names', () => {
  const invalid = description.replace('实现思路：', '实现思路：修改 CrAssetServiceImpl 的 createAsset() 方法，');
  const result = assessTaskDescription(invalid, { storyId: 2796 });
  assert.equal(result.passed, false);
  assert.ok(result.codeIdentifiers.some(value => value.includes('CrAssetServiceImpl')));
  assert.ok(result.codeIdentifiers.some(value => value.includes('createAsset')));
  assert.deepEqual(findCodeIdentifiers('修改 application.yml、query.sql、src/Example.java 和 ExampleService'), [
    'ExampleService',
    'application.yml',
    'query.sql',
    'src/Example.java',
  ]);
});

test('completion requires all six fields and rejects empty summaries', () => {
  const result = assessCompletionComment(completion);
  assert.equal(result.score, 5);
  assert.equal(result.passed, true);

  for (const field of ['完成状态', '实际完成内容', '实现过程', '需求符合情况', '验证结果', '遗留问题']) {
    const withoutField = completion.replace(new RegExp(`^${field}：.*(?:\\r?\\n(?![^\\r\\n]*[：:]).*)*`, 'm'), '');
    assert.equal(assessCompletionComment(withoutField).passed, false, `missing ${field} must fail`);
  }
  const withoutStatus = assessCompletionComment(completion.replace(/^完成状态：.*$/m, ''));
  assert.equal(withoutStatus.passed, false);
  assert.ok(withoutStatus.score < 5);
  for (const status of ['已完成部分功能', '任务已完成部分功能', '任务未完成', '任务已完成，部分功能延期']) {
    assert.equal(assessCompletionComment(completion.replace(/^完成状态：.*$/m, `完成状态：${status}`)).passed, false);
  }
  assert.equal(assessCompletionComment('完成状态：任务已完成\n实际完成内容：开发完成').passed, false);
});

test('breakdown keeps a simple outcome cohesive and rejects missing or duplicated business outcomes', () => {
  const simple = assessTaskBreakdown({
    outcomeIds: ['asset-create-validation'],
    tasks: [{
      name: '完善资产创建校验',
      outcomeIds: ['asset-create-validation'],
      deliverable: '可验收的资产创建校验与异常提示',
      acceptance: '无效和重复请求不会产生额外资产',
      estimate: 3,
    }],
  });
  assert.equal(simple.passed, true);

  const complex = assessTaskBreakdown({
    outcomeIds: ['asset-import', 'asset-audit'],
    tasks: [
      { name: '完成资产导入', outcomeIds: ['asset-import'], deliverable: '导入能力', acceptance: '合法文件可导入', estimate: 5 },
      { name: '完成资产审核', outcomeIds: ['asset-audit'], deliverable: '审核能力', acceptance: '审核结果可追溯', estimate: 6 },
    ],
  });
  assert.equal(complex.passed, true);

  const medium = assessTaskBreakdown({
    outcomeIds: ['asset-import', 'asset-review', 'asset-audit'],
    tasks: [
      { name: '完成资产导入', outcomeIds: ['asset-import'], deliverable: '导入能力', acceptance: '合法文件可导入', estimate: 4 },
      { name: '完成资产审核', outcomeIds: ['asset-review'], deliverable: '审核能力', acceptance: '审核结果可追溯', estimate: 3.5 },
      { name: '完成资产审计记录', outcomeIds: ['asset-audit'], deliverable: '审计能力', acceptance: '关键操作可查询', estimate: 2.5 },
    ],
  });
  assert.equal(medium.passed, true);

  const broken = assessTaskBreakdown({
    outcomeIds: ['asset-import', 'asset-audit'],
    tasks: [{ name: '完成资产导入', outcomeIds: ['asset-import', 'asset-import'], deliverable: '导入能力', acceptance: '合法文件可导入', estimate: 5 }],
  });
  assert.equal(broken.passed, false);
  assert.ok(broken.issues.some(issue => issue.includes('重复')));
  assert.ok(broken.issues.some(issue => issue.includes('未覆盖')));
});

test('description CLI requires the expected story ID and passes a complete task', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'zentao-quality-test-'));
  const file = path.join(temp, 'task.md');
  try {
    await writeFile(file, description);
    await assert.rejects(
      execFileAsync(process.execPath, [qualityScript, 'description', '--file', file], { encoding: 'utf8' }),
      error => error.code === 1 && /requires --story/.test(error.stderr),
    );
    const { stdout } = await execFileAsync(
      process.execPath,
      [qualityScript, 'description', '--file', file, '--story', '2796'],
      { encoding: 'utf8' },
    );
    assert.equal(JSON.parse(stdout).score, 5);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
