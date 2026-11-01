# Task workflow

## Create

1. Treat “create a task” as authorization for that task only. Read the current chat and explicit requirement files; do not search unrelated folders or other conversations.
2. Inspect live MCP tools and schemas. Confirm that task creation, task listing, story lookup, and execution lookup exist before relying on them. Read [task matching](task-matching.md) to resolve the current account and candidates.
3. Apply [task creation template](task-create-template.md)'s hard gate: both user-specified estimate hours and a user-specified story ID are required. If either is missing, ask for it and stop before creation. Do not infer either value.
4. Call the active MCP's story-detail lookup with the exact user-specified ID (Codex's company MCP exposes `get_stories_storyID`); verify the returned ID, title/relevance, and non-deleted state. If it cannot be found or does not match the requested work, clarify instead of creating an unlinked or mislinked task.
5. Resolve the execution and map each supported value to its native MCP field (`executionID`, `module`, `story`, `type`, `assignedTo`, `name`, `pri`, `estimate`, `estStarted`, `deadline`). Pass the verified ID in `story`. Use module `0` only when it is verified as the selected root `/` module in this instance. The live schema does not expose a parent task field; do not smuggle unsupported fields into `desc`.
6. Use the supplied estimate to calculate the interval. Prefer the user's explicit work schedule in the current conversation, then saved calendar config; otherwise use the built-in Asia/Shanghai Monday–Friday 09:00–18:30 shift with a 12:00–13:30 break without asking. Round current time down to a half hour, move to the last valid work-time boundary when outside a shift or during a break, and calculate backwards, skipping breaks. If the start passes before shift start, continue into the previous configured workday, skipping weekends and holidays. Set native date fields to the first/last work dates. The clock-time segments are for calculation and conversational reporting only; never put expected time segments in the task description or another free-text task field.
7. Check for duplicates in the selected execution.
8. Create once. Read back the task ID, status, and linked story ID. If the association did not persist, update that exact task's `story` field once when supported and verify; never create a duplicate. Upload the identified requirement document only through an available MCP upload tool or bundled native helper when the user supplied the file and the fixed ZenTao target is confirmed.
9. If upload is unavailable or fails, keep the task, report that attachment state separately, and never say it was attached unless verified.

## Create and complete

An explicit request such as “帮我创建刚在做的需求的禅道任务并完成任务，工时是 3 小时，关联需求 ID 是 123” requests both writes and authorizes using the supplied hours and the computed interval for both planned and actual records. Do not require a separate “已做完” or confirmation that actuals match the plan. If the user supplies different actual hours or dates, use those actual values instead. A request that only says create must not finish a task.

1. Follow Create above, verifying the story, execution, identity and duplicates. If identity is uncertain, prompt for the account as described in [task matching](task-matching.md), then resume.
2. Calculate the interval once and retain its dates, times, segments and supplied hours through both operations. On a working day at 16:50 Beijing time, 3 hours means 13:30–16:30 after rounding down to 16:30. Set `estimate=3` and the supported planned date fields from that interval; creation cannot claim clock-time precision that its fields do not store.
3. After creation and story-link read-back succeed, apply [task completion template](task-complete-template.md) to that exact returned task ID. Use the retained start/end for `realStarted`/`finishedDate` and supplied hours for `currentConsumed`, unless explicit actuals override them. Do not recalculate using the later completion clock, substitute the tool-call time, or treat estimated hours as cumulative consumed hours. Preserve clock times in the completion comment when native fields only store dates.
4. Read back the task and verify `done` and the returned actual fields when available. If completion fails, report the existing task ID and its observed state; do not create a replacement task. The combined shortcut applies to the newly created task: if a likely duplicate already exists, ask which task/action the user intends before applying new actual values to it.

## Update

1. Resolve the exact task ID and read its current fields.
2. Use only the fields exposed by the live update schema. Change only fields the user explicitly requested; do not infer a new assignee, dates, priority, estimate, story, or module.
3. Check the current status and existing values before writing. If the target field is already correct, report that without issuing a write.
4. Call update once and read the task back when supported. On timeout or an ambiguous response, query before retrying.

## Complete

1. Resolve the exact task ID, inspect its live schema and read status, actual start, and consumed hours.
2. If already done, return the existing state. If closed/cancelled, stop. Do not assume code generation means the work passed tests.
3. For the newly created task in an explicit combined Create and complete request, reuse its retained interval and supplied hours as actuals without another confirmation, unless explicit actual values override them. For other completion requests, use planned values only when the user confirms completion as planned; otherwise ask for or verify actual times and hours. Keep explicit real work dates, including weekends, unchanged.
4. Apply [task completion template](task-complete-template.md): write actual start, finish, and this completion's consumed hours to `realStarted`, `finishedDate`, and `currentConsumed`. Keep the comment to actual results, verification, follow-ups and any actual clock-time intervals the native fields cannot store. Call finish once, then read back `done` if supported. Never call close as a substitute.

## Tool and result handling

The active MCP schema is authoritative for names and fields. ZenTao API documentation explains server-side behavior but does not prove that this MCP instance exposes it correctly. Treat HTTP status text inside a tool result separately from the MCP transport status. On auth-looking errors, do not repeat a write: diagnose the transport/tool result, refresh only through the configured client mechanism, then confirm the original operation's state before any retry.
