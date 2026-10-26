import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentMatches, createTaskAttachmentForm, shellQuote, updateClaudeConfig, updateCodexConfig, uploadTaskAttachmentWithToken, validateTaskAttachment } from '../scripts/zentao/macos.mjs';
import { mkdtemp, rm, writeFile, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const serverUrl = 'https://pms.daoyoudao.com/zentao/mcp';
const helper = "'/usr/local/bin/node' '/Users/test/.agents/skills/zentao-tools/scripts/zentao/macos.mjs' headers";

test('Codex setup appends one user-level MCP server without changing other tables', () => {
  const result = updateCodexConfig('[projects]\n"/tmp" = { trust_level = "trusted" }\n', helper);
  assert.match(result, /\[projects\]/);
  assert.match(result, /\[mcp_servers\.zentao\]/);
  assert.match(result, new RegExp(`url = "${serverUrl.replaceAll('.', '\\.')}"`));
  assert.match(result, /http_headers_helper = /);
});

test('Codex setup replaces auth settings in the matching server section only', () => {
  const source = `[mcp_servers.zentao]\nurl = "${serverUrl}"\nhttp_headers = { token = "stale" }\n\n[mcp_servers.other]\nurl = "https://example.com/mcp"\n`;
  const result = updateCodexConfig(source, helper);
  assert.doesNotMatch(result, /http_headers =/);
  assert.match(result, /http_headers_helper =/);
  assert.match(result, /\[mcp_servers\.other\]\nurl = "https:\/\/example.com\/mcp"/);
});

test('Codex setup refuses duplicate, unsupported, and conflicting entries', () => {
  assert.throws(() => updateCodexConfig(`[mcp_servers.zentao]\nurl = "${serverUrl}"\n[mcp_servers.zentao]\n`, helper), /duplicate/);
  assert.throws(() => updateCodexConfig(`[[mcp_servers.zentao]]\nurl = "${serverUrl}"\n`, helper), /array table/);
  assert.throws(() => updateCodexConfig('[mcp_servers.zentao]\nurl = "https://other.example/mcp"\n', helper), /different URL/);
});

test('Claude setup preserves unrelated servers and removes conflicting auth fields', () => {
  const source = JSON.stringify({ mcpServers: {
    other: { type: 'http', url: 'https://example.com/mcp' },
    zentao: { type: 'http', url: serverUrl, headers: { token: 'stale' }, oauth: {} },
  } });
  const result = JSON.parse(updateClaudeConfig(source, helper));
  assert.deepEqual(result.mcpServers.other, { type: 'http', url: 'https://example.com/mcp' });
  assert.equal(result.mcpServers.zentao.headersHelper, helper);
  assert.equal('headers' in result.mcpServers.zentao, false);
  assert.equal('oauth' in result.mcpServers.zentao, false);
});

test('Claude setup refuses a conflicting ZenTao URL and malformed JSON', () => {
  assert.throws(() => updateClaudeConfig('{"mcpServers":{"zentao":{"url":"https://other.example/mcp"}}}', helper), /different URL/);
  assert.throws(() => updateClaudeConfig('{', helper), /not valid JSON/);
});

test('shell quoting preserves apostrophes in executable and script paths', () => {
  assert.equal(shellQuote("/Users/D'Angelo/node"), "'/Users/D'\\''Angelo/node'");
});

test('attachment validation accepts an explicit document and rejects invalid targets', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'zentao-upload-test-'));
  try {
    const document = path.join(temp, 'requirement.docx');
    const executable = path.join(temp, 'program.exe');
    const empty = path.join(temp, 'empty.pdf');
    await writeFile(document, 'doc');
    await writeFile(executable, 'binary');
    await writeFile(empty, '');
    assert.deepEqual(await validateTaskAttachment(document, 123), { name: 'requirement.docx', size: 3 });
    await assert.rejects(validateTaskAttachment(document, 0), /positive integer/);
    await assert.rejects(validateTaskAttachment(executable, 123), /Unsupported/);
    await assert.rejects(validateTaskAttachment(empty, 123), /empty/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('multipart upload includes the task association and the binary document', async () => {
  const form = createTaskAttachmentForm(Buffer.from('contents'), 'requirements.md', 456);
  assert.equal(form.get('objectType'), 'task');
  assert.equal(form.get('objectID'), '456');
  assert.equal(form.get('file').name, 'requirements.md');
  assert.equal(form.get('file').size, 8);
  assert.throws(() => createTaskAttachmentForm(Buffer.from('x'), 'requirements.md', 0), /positive integer/);
});

test('attachment read-back requires a matching filename and exact size', () => {
  assert.equal(attachmentMatches([{ title: 'requirement.docx', size: '12' }], 'requirement.docx', 12), true);
  assert.equal(attachmentMatches([{ title: 'requirement.docx', size: '11' }], 'requirement.docx', 12), false);
  assert.equal(attachmentMatches(undefined, 'requirement.docx', 12), false);
});

test('mock upload confirms task association and never retries an uncertain POST', async () => {
  const attachment = { name: 'requirement.md', size: 8 };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') return { status: 200, text: async () => '{"status":"success","id":99}' };
    return { status: 200, url, text: async () => JSON.stringify({ files: [{ title: attachment.name, size: attachment.size }] }) };
  };
  const result = await uploadTaskAttachmentWithToken(Buffer.from('contents'), attachment, 456, 'test-token', fetchImpl);
  assert.deepEqual(result, { status: 'success', verified: true, fileID: 99, fileName: attachment.name, taskID: 456 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.body.get('objectType'), 'task');
  assert.equal(calls[0].options.body.get('objectID'), '456');
  assert.equal(calls[0].options.headers.token, 'test-token');

  let requests = 0;
  const uncertain = await uploadTaskAttachmentWithToken(Buffer.from('contents'), attachment, 456, 'test-token', async (url, options) => {
    requests++;
    if (options.method === 'POST') throw new Error('connection reset');
    return { status: 200, url, text: async () => JSON.stringify({ files: [] }) };
  });
  assert.equal(uncertain.status, 'unknown');
  assert.equal(uncertain.retrySafe, false);
  assert.equal(requests, 2);
});

test('mock upload reports denied writes and blocks redirects', async () => {
  const attachment = { name: 'requirement.md', size: 1 };
  await assert.rejects(uploadTaskAttachmentWithToken(Buffer.from('x'), attachment, 456, 'test-token', async () => ({ status: 403 })), /HTTP 403/);
  await assert.rejects(uploadTaskAttachmentWithToken(Buffer.from('x'), attachment, 456, 'test-token', async () => ({ status: 302 })), /redirected/);
});

test('attachment validation rejects files over its local cap', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'zentao-upload-large-'));
  const file = path.join(temp, 'large.pdf');
  let handle;
  try {
    handle = await open(file, 'w');
    await handle.truncate(50 * 1024 * 1024 + 1);
    await handle.close();
    handle = null;
    await assert.rejects(validateTaskAttachment(file, 123), /50 MiB/);
  } finally {
    await handle?.close();
    await rm(temp, { recursive: true, force: true });
  }
});
