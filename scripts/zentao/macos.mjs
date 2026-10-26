import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LOGIN_URL = 'https://pms.daoyoudao.com/api.php/v2/users/login';
const FILES_URL = 'https://pms.daoyoudao.com/api.php/v2/files';
const TASKS_URL = 'https://pms.daoyoudao.com/api.php/v2/tasks';
const SERVER_URL = 'https://pms.daoyoudao.com/zentao/mcp';
const SERVER_NAME = 'zentao';
const KEYCHAIN_SERVICE = 'mcp-token-renewal.zentao';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const CREDENTIAL_PATH = path.join(os.homedir(), 'Library/Application Support/McpTokenRenewal/zentao/credentials.json');
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DOCUMENT_EXTENSIONS = new Set(['.doc', '.docx', '.md', '.odt', '.pdf', '.rtf', '.txt', '.xls', '.xlsx', '.ppt', '.pptx']);

export function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function updateCodexConfig(source, helperCommand) {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
  let content = source.slice(bom.length);
  const sectionHeader = /^\[mcp_servers\.zentao\][ \t]*(?:\r?\n|$)/gm;
  const sections = [...content.matchAll(sectionHeader)];
  if (sections.length > 1) throw new Error('Codex config has duplicate [mcp_servers.zentao] sections.');
  if (/^[ \t]*\[\[mcp_servers\.zentao\]\][ \t]*(?:#.*)?$/m.test(content)) {
    throw new Error('Codex ZenTao config uses an unsupported array table.');
  }
  if (/^[ \t]*\[mcp_servers\.zentao\.(?:http_headers|env_http_headers|oauth|bearer_token)\][ \t]*(?:#.*)?$/m.test(content)) {
    throw new Error('Codex ZenTao config uses an unsupported nested authentication table.');
  }

  if (sections.length === 0) {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const separator = content.length === 0 ? '' : /(?:\r?\n)$/.test(content) ? eol : `${eol}${eol}`;
    content += `${separator}[mcp_servers.zentao]${eol}url = "${SERVER_URL}"${eol}http_headers_helper = ${JSON.stringify(helperCommand)}${eol}`;
    return bom + content;
  }

  const start = sections[0].index;
  const sectionStart = start + sections[0][0].length;
  const nextTableOffset = content.slice(sectionStart).search(/^\[/m);
  const end = nextTableOffset < 0 ? content.length : sectionStart + nextTableOffset;
  let section = content.slice(start, end);
  const urlLines = [...section.matchAll(/^[ \t]*url[ \t]*=/gm)];
  const urls = [...section.matchAll(/^[ \t]*url[ \t]*=[ \t]*["']([^"']*)["'][ \t]*(?:#.*)?$/gm)];
  if (urls.length !== urlLines.length) throw new Error('Codex ZenTao url uses an unsupported format.');
  if (urls.length > 1) throw new Error('Codex ZenTao entry has duplicate url keys.');
  if (urls.length === 1 && urls[0][1] !== SERVER_URL) {
    throw new Error('Existing Codex zentao server uses a different URL.');
  }

  const eol = section.includes('\r\n') ? '\r\n' : '\n';
  if (urls.length === 0) section = section.trimEnd() + `${eol}url = "${SERVER_URL}"${eol}`;
  section = section.replace(/^[ \t]*(?:env_http_headers|http_headers|bearer_token_env_var|bearer_token|oauth|http_headers_helper)[ \t]*=.*(?:\r?\n|$)/gm, '');
  section = section.trimEnd() + `${eol}http_headers_helper = ${JSON.stringify(helperCommand)}${eol}`;
  return bom + content.slice(0, start) + section + content.slice(end);
}

export function updateClaudeConfig(source, helperCommand) {
  let config = {};
  if (source !== null) {
    try { config = JSON.parse(source); }
    catch { throw new Error('Claude config is not valid JSON.'); }
  }
  if (!config || Array.isArray(config) || typeof config !== 'object') throw new Error('Claude config must be a JSON object.');
  config.mcpServers ??= {};
  if (!config.mcpServers || Array.isArray(config.mcpServers) || typeof config.mcpServers !== 'object') {
    throw new Error('Claude mcpServers must be a JSON object.');
  }

  const entry = config.mcpServers[SERVER_NAME] ?? { type: 'http', url: SERVER_URL };
  if (!entry || Array.isArray(entry) || typeof entry !== 'object') throw new Error('Claude ZenTao entry must be a JSON object.');
  if (entry.url && entry.url !== SERVER_URL) throw new Error('Existing Claude Code zentao server uses a different URL.');
  delete entry.headers;
  delete entry.headersHelper;
  delete entry.oauth;
  entry.type = 'http';
  entry.url = SERVER_URL;
  entry.headersHelper = helperCommand;
  config.mcpServers[SERVER_NAME] = entry;
  return `${JSON.stringify(config, null, 2)}\n`;
}

function getPath(client) {
  return client === 'Codex'
    ? path.join(os.homedir(), '.codex', 'config.toml')
    : path.join(os.homedir(), '.claude.json');
}

function helperCommand() {
  const node = shellQuote(process.execPath);
  const script = shellQuote(SCRIPT_PATH);
  return `${node} ${script} headers`;
}

function readLine(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return rl.question(prompt).finally(() => rl.close());
}

async function readExisting(filePath) {
  try {
    const [content, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
    return { existed: true, content, mode: stat.mode & 0o777 };
  } catch (error) {
    if (error.code === 'ENOENT') return { existed: false, content: null, mode: 0o600 };
    throw error;
  }
}

async function writeAtomic(filePath, content, mode = 0o600) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    await fs.writeFile(temporaryPath, content, { encoding: 'utf8', mode, flag: 'wx' });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function backup(filePath, content, mode) {
  const stamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 17);
  const backupPath = `${filePath}.bak-${stamp}`;
  await fs.writeFile(backupPath, content, { encoding: 'utf8', mode, flag: 'wx' });
  console.log(`Backed up existing config to ${backupPath}`);
}

async function restore(filePath, original) {
  if (original.existed) await writeAtomic(filePath, original.content, original.mode);
  else await fs.rm(filePath, { force: true });
}

function runSecurity(args, interactive = false) {
  const result = spawnSync('/usr/bin/security', args, {
    encoding: 'utf8',
    stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) throw new Error('macOS Keychain operation failed.');
  return result.stdout?.trimEnd() ?? '';
}

async function readCredential() {
  let credential;
  try { credential = JSON.parse(await fs.readFile(CREDENTIAL_PATH, 'utf8')); }
  catch { throw new Error('ZenTao credential metadata is unavailable or invalid. Run setup again.'); }
  if (!credential.account || !credential.credential_id) throw new Error('ZenTao credential metadata is incomplete. Run setup again.');
  return credential;
}

async function saveCredentials() {
  const account = await readLine('ZenTao login name: ');
  if (!account.trim()) throw new Error('A non-empty ZenTao login name is required.');
  const old = await readExisting(CREDENTIAL_PATH);
  let oldId;
  if (old.existed) {
    try { oldId = JSON.parse(old.content).credential_id; }
    catch { throw new Error('Existing credential metadata is invalid; resolve it before setup.'); }
  }

  const credentialId = randomUUID().replaceAll('-', '');
  console.log('Enter the ZenTao password at the macOS Keychain prompt.');
  runSecurity(['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', credentialId, '-w'], true);
  try {
    await writeAtomic(CREDENTIAL_PATH, `${JSON.stringify({ account, credential_id: credentialId })}\n`);
  } catch (error) {
    spawnSync('/usr/bin/security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', credentialId], { stdio: 'ignore' });
    throw error;
  }
  if (oldId && oldId !== credentialId) {
    const result = spawnSync('/usr/bin/security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', oldId], { stdio: 'ignore' });
    if (result.status !== 0) console.warn('The old macOS Keychain entry could not be removed.');
  }
  console.log(`ZenTao password saved in macOS Keychain; account metadata saved to ${CREDENTIAL_PATH}`);
}

function requestToken(account, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ account, password });
    const request = https.request(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 7000,
    }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('aborted', () => reject(new Error('login response interrupted')));
      response.on('error', () => reject(new Error('login response failed')));
      response.on('data', (chunk) => {
        data += chunk;
        if (Buffer.byteLength(data) > 1024 * 1024) request.destroy(new Error('response too large'));
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error('login request rejected'));
        try {
          const result = JSON.parse(data);
          if (result.status !== 'success' || typeof result.token !== 'string' || !result.token.trim()) {
            return reject(new Error('login rejected'));
          }
          resolve(result.token);
        } catch { reject(new Error('login response invalid')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('login timed out')));
    request.on('error', () => reject(new Error('login request failed')));
    request.end(body);
  });
}

async function getHeaders() {
  const token = await getToken();
  process.stdout.write(`${JSON.stringify({ token })}\n`);
}

async function getToken() {
  const credential = await readCredential();
  const password = runSecurity(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', credential.credential_id, '-w']);
  if (!password) throw new Error('macOS Keychain credential unavailable.');
  return requestToken(credential.account, password);
}

export async function validateTaskAttachment(filePath, taskID) {
  if (!/^\d+$/.test(String(taskID)) || Number(taskID) <= 0) throw new Error('Task ID must be a positive integer.');
  const extension = path.extname(filePath).toLowerCase();
  if (!DOCUMENT_EXTENSIONS.has(extension)) throw new Error('Unsupported requirement document type.');
  const info = await fs.lstat(filePath);
  if (!info.isFile()) throw new Error('Attachment path must be a regular file.');
  if (info.size <= 0) throw new Error('Attachment file is empty.');
  if (info.size > MAX_UPLOAD_BYTES) throw new Error('Attachment exceeds the 50 MiB local safety limit.');
  return { name: path.basename(filePath), size: info.size };
}

function parseJson(text) {
  try { return JSON.parse(text); }
  catch { throw new Error('ZenTao returned an invalid response.'); }
}

function readTaskFiles(task) {
  return task?.files ?? task?.task?.files ?? task?.data?.files ?? null;
}

export function attachmentMatches(files, name, size) {
  if (!Array.isArray(files)) return false;
  return files.some(file => {
    const fileName = file.title ?? file.name ?? file.fileName ?? file.filename;
    const fileSize = Number(file.size ?? file.filesize ?? file.fileSize);
    return fileName === name && Number.isFinite(fileSize) && fileSize === size;
  });
}

export function createTaskAttachmentForm(fileBytes, fileName, taskID) {
  if (!/^\d+$/.test(String(taskID)) || Number(taskID) <= 0) throw new Error('Task ID must be a positive integer.');
  const body = new FormData();
  body.append('file', new Blob([fileBytes]), fileName);
  body.append('objectType', 'task');
  body.append('objectID', String(taskID));
  return body;
}

export async function uploadTaskAttachmentWithToken(fileBytes, attachment, taskID, token, fetchImpl = fetch) {
  const body = createTaskAttachmentForm(fileBytes, attachment.name, taskID);
  let upload;
  try {
    upload = await fetchImpl(FILES_URL, {
      method: 'POST',
      headers: { token },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    const task = await readTaskAttachmentState(taskID, token, fetchImpl);
    if (attachmentMatches(readTaskFiles(task), attachment.name, attachment.size)) {
      return { status: 'success', verified: true, fileName: attachment.name, taskID: Number(taskID), recoveredAfterTimeout: true };
    }
    return { status: 'unknown', verified: false, retrySafe: false, fileName: attachment.name, taskID: Number(taskID) };
  }

  if (upload.status >= 300 && upload.status < 400) throw new Error('ZenTao upload redirected the credentialed request; upload was stopped.');
  if (upload.status < 200 || upload.status >= 300) throw new Error(`ZenTao rejected the attachment upload (HTTP ${upload.status}).`);
  const result = parseJson(await upload.text());
  if (result.status !== 'success' || !Number.isInteger(Number(result.id)) || Number(result.id) <= 0) {
    throw new Error('ZenTao did not confirm attachment upload.');
  }

  const task = await readTaskAttachmentState(taskID, token, fetchImpl);
  const verified = attachmentMatches(readTaskFiles(task), attachment.name, attachment.size);
  return { status: 'success', verified, fileID: Number(result.id), fileName: attachment.name, taskID: Number(taskID) };
}

async function readTaskAttachmentState(taskID, token, fetchImpl) {
  try {
    const response = await fetchImpl(`${TASKS_URL}/${encodeURIComponent(taskID)}`, {
      method: 'GET',
      headers: { token },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status < 200 || response.status >= 300 || new URL(response.url).origin !== new URL(TASKS_URL).origin) return null;
    return parseJson(await response.text());
  } catch { return null; }
}

export async function uploadTaskAttachment(filePath, taskID, { fetchImpl = fetch } = {}) {
  const attachment = await validateTaskAttachment(filePath, taskID);
  const credential = await readCredential();
  const password = runSecurity(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', credential.credential_id, '-w']);
  if (!password) throw new Error('macOS Keychain credential unavailable.');
  const token = await requestToken(credential.account, password);
  const file = await fs.readFile(filePath);
  if (file.byteLength !== attachment.size) throw new Error('Attachment changed while it was being read; upload was stopped.');
  return uploadTaskAttachmentWithToken(file, attachment, taskID, token, fetchImpl);
}

async function showAccount() {
  const credential = await readCredential();
  process.stdout.write(`${JSON.stringify({ account: credential.account })}\n`);
}

async function removeCredentials() {
  try { await fs.access(CREDENTIAL_PATH); }
  catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No saved ZenTao credentials were found.');
      return;
    }
    throw error;
  }
  const credential = await readCredential();
  runSecurity(['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', credential.credential_id]);
  await fs.rm(CREDENTIAL_PATH);
  console.log('Saved ZenTao credentials removed.');
}

export async function configureMacOS() {
  if (process.platform !== 'darwin') throw new Error('This setup command is for macOS.');
  console.log('Select the client(s) to configure:\n  1. Codex\n  2. Claude Code\n  3. Both');
  const choice = await readLine('Choice (1-3): ');
  if (!['1', '2', '3'].includes(choice)) throw new Error('Select 1, 2, or 3.');

  const command = helperCommand();
  const updates = [];
  if (choice === '1' || choice === '3') {
    const filePath = getPath('Codex');
    const existing = await readExisting(filePath);
    updates.push({ filePath, existing, content: updateCodexConfig(existing.content ?? '', command) });
  }
  if (choice === '2' || choice === '3') {
    const filePath = getPath('Claude');
    const existing = await readExisting(filePath);
    updates.push({ filePath, existing, content: updateClaudeConfig(existing.content, command) });
  }

  try {
    for (const update of updates) {
      if (update.existing.existed) await backup(update.filePath, update.existing.content, update.existing.mode);
      await writeAtomic(update.filePath, update.content, update.existing.mode);
      console.log(`Configured ZenTao MCP in ${update.filePath}`);
    }
    await saveCredentials();
  } catch (error) {
    for (const update of updates) {
      try { await restore(update.filePath, update.existing); }
      catch { console.warn(`Could not restore config ${update.filePath}`); }
    }
    throw error;
  }
  console.log('Setup complete. Restart the selected MCP client to reload its ZenTao server configuration.');
}

export async function runMacOSCommand(command) {
  if (process.platform !== 'darwin') throw new Error('This command is for macOS.');
  if (command === 'headers') return getHeaders();
  if (command === 'account') return showAccount();
  if (command === 'remove') return removeCredentials();
  if (command === 'upload') {
    const filePath = process.argv[3];
    const taskID = process.argv[4];
    if (!filePath || !taskID) throw new Error('Use upload <document-path> <task-id>.');
    const result = await uploadTaskAttachment(filePath, taskID);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error('Use the setup entry point, or specify headers/account/remove/upload.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMacOSCommand(process.argv[2]).catch((error) => {
    process.stderr.write('ZenTao helper failed. Check local credentials, Keychain access, and network access.\n');
    process.exitCode = 1;
  });
}
