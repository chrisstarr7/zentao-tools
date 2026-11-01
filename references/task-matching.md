# Task and identity matching

## Verify the current account

Use a trusted current-user endpoint when the live MCP exposes one. Otherwise, use the local saved account only after confirming that the active `zentao` MCP configuration uses this Skill's local header helper and the same fixed server URL. The bundled `account` command reveals account metadata only; it never reads or prints a password or token. If the configured authentication source cannot be tied to that account, explain the uncertainty and ask the user to confirm their ZenTao account instead of ending the workflow. For example: “无法可靠识别当前禅道登录人，请确认你的禅道账号；确认后我会继续创建并指派任务。” If a candidate has been verified, show its display name and exact account for confirmation. A display name alone may not be unique; clarify the account when needed. A user-confirmed account can be used as the intended assignee, but do not claim it proves who owns the MCP token. Keep the requested action pending, perform no write with an uncertain assignee, and continue after confirmation without another permission prompt.

Run the account helper only when that binding needs checking:

```powershell
& "$HOME\.agents\skills\zentao-tools\scripts\zentao\account.ps1"
```

```sh
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/macos.mjs" account
```

Do not treat the `assignedtome` query parameter as proof of identity. Compare returned assignees and statuses with the requested filter. If it returns mixed accounts, completed/cancelled tasks, or the same result as `all`, the filter is not trustworthy: use a verified or user-confirmed account to filter returned tasks locally; if the identity is still uncertain, explain and ask the user to confirm it before continuing. Never call `get_users` and guess which person is the token owner.

## Locate a task or execution

- If the user supplied a task ID or story ID, start with that exact ID and inspect the returned schema. Avoid broad searches when a direct result is sufficient.
- For task creation, require the user-provided story ID. Fetch it with the active MCP's story-detail operation (Codex's company MCP exposes `get_stories_storyID`), verify the returned ID/title and that it is not deleted, then pass that exact ID using the create schema's story-link field. If no ID is supplied or the lookup is mismatched, ask/clarify and do not create an unlinked task.
- For “my current tasks”, enumerate only accessible, non-deleted active executions, page each task list, and filter by the verified account plus `wait`/`doing` status. `assignedtome` may be used as a narrowing hint only after its result is checked against the actual `assignedTo` and `status` fields.
- Match a new task against the user's project/product, linked story, execution, and request language. A story title is evidence for the requirement; it does not by itself identify the correct execution.
- Before creation, inspect all relevant pages in the selected execution for an existing open task with the same story and materially similar scope. Do not consider a done/cancelled task a duplicate without comparing the requested scope.
- If several stories, executions, or existing tasks are credible candidates, present 3–5 concise options with IDs, names, execution, status, and the reason each matches. Do not select one just because it is the first result.
- Never choose a cancelled, inaccessible, or unrelated story/execution. If no match is supported, ask for the missing identifier or project context.

## Retry safety

After a create timeout, connection reset, malformed response, or lost client response, search the selected execution by verified account, story, name, and recent creation time before retrying. If the search cannot establish whether the write succeeded, report the outcome as uncertain and stop. For completion, read current status and consumed hours before any retry.
