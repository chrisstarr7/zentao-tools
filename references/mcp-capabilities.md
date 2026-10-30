# MCP capabilities and failure handling

## Inspect the live server

Before a task workflow, inspect available ZenTao tool names and their input/output schemas. The live MCP may be older or narrower than ZenTao's current API documentation. Do not assume that a documented endpoint is exposed, that an optional response field is actually returned, or that an enum is accepted by the company instance.

The task flow needs a way to read executions, tasks, stories, and task details, plus create/finish operations. Map creation values to the live schema's native fields (`executionID`, `module`, `story`, `type`, `assignedTo`, `name`, `pri`, `estimate`, `estStarted`, `deadline`) and finish values to `realStarted`, `finishedDate`, and `currentConsumed`. Inspect the actual field semantics and read-back precision; a string type alone does not prove clock-time precision. If the schema omits a needed field such as parent task, do not put it into `desc` as a substitute. If the detail tool omits needed fields, use a suitable task-list result or stop rather than fabricating state.

## Attachment upload

ZenTao's official API documents `POST /api.php/v2/files` with `multipart/form-data` fields `file`, `objectType=task`, and `objectID`, supported from ZenTao v22. The bundled native helper reuses the existing credential store and fixed HTTPS host. It has a 50 MiB local safety cap; that is a client limit, not a claim about the company's server limit.

The current connected MCP may expose only file rename/delete operations and no multipart upload. If so, the Skill may use the bundled platform-native upload helper only for the exact user-provided file, after confirming the configured auth source and fixed host. Upload is a separate step after task creation. A successful POST response is not a successful read-back check; report attachment verification only if the task's returned file list confirms it. If the server omits attachment details, report upload accepted but association unverified. On timeout, check read-back first and do not retry if success is uncertain.

Run the Windows helper with `-FilePath` and `-TaskID`:

```powershell
& "$HOME\.agents\skills\zentao-tools\scripts\zentao\upload-attachment.ps1" -FilePath "<user-provided-document>" -TaskID <task-id>
```

On macOS, use the native Node helper:

```sh
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/macos.mjs" upload "<user-provided-document>" <task-id>
```

Do not follow redirects for credentialed requests. Reject non-regular files, unsupported document types, invalid task IDs, and oversized files. The helper must not print password or token values.

## Expired token behavior

Codex `http_headers_helper` is supported for locally connected HTTP MCP servers. Client retry behavior depends on the **outer MCP HTTP response** and current Codex version; a tool result that merely contains `HTTP 401` is not proof that the header helper ran.

When a call reports an authentication error:

1. Distinguish outer transport status from text or structured tool error.
2. Never retry a task-creating or task-finishing operation immediately.
3. If transport-level auth failure invoked the configured helper, make at most the client's documented retry and then inspect the target task before another write.
4. If the upstream status was wrapped inside a normal HTTP 200 MCP response, explain that automatic header-helper recovery is not established. Do not claim that setting an error flag or printing `401` in tool content fixes transport-level retry.

The public `easysoft/zentao-mcp` source checked for this upgrade converts upstream response status and body to ordinary tool text and returns the MCP result without `isError` for non-2xx responses. This is evidence about that source revision, not proof that the company's deployed gateway is identical. A real gateway fix needs its source and a transport-level mock test; it must not be deployed from this Skill repository.
