# Task workflow

## Create

1. Treat “create a task” as authorization for that task only. Read the current chat and explicit requirement files; do not search unrelated folders or other conversations.
2. Inspect live MCP tools and schemas. Confirm that task creation, task listing, story lookup, and execution lookup exist before relying on them. Read [task matching](task-matching.md) to resolve the current account and candidates.
3. Apply [task creation template](task-create-template.md)'s hard gate: both user-specified estimate hours and a user-specified story ID are required. If either is missing, ask for it and stop before creation. Do not infer either value.
4. Call the active MCP's story-detail lookup with the exact user-specified ID (Codex's company MCP exposes `get_stories_storyID`); verify the returned ID, title/relevance, and non-deleted state. If it cannot be found or does not match the requested work, clarify instead of creating an unlinked or mislinked task.
5. Resolve the execution and map each supported value to its native MCP field (`executionID`, `module`, `story`, `type`, `assignedTo`, `name`, `pri`, `estimate`, `estStarted`, `deadline`). Pass the verified ID in `story`. Use module `0` only when it is verified as the selected root `/` module in this instance. The live schema does not expose a parent task field; do not smuggle unsupported fields into `desc`.
6. Use the supplied estimate to calculate the interval. Check the user's work schedule in the current conversation or saved calendar config. If absent, ask for shift start/end and break start/end before calculating. Round current Asia/Shanghai time down to the hour and calculate backwards, skipping breaks. If the start passes before shift start, continue into the previous configured workday, skipping weekends and holidays. Set native date fields to the first/last work dates. The clock-time segments are for calculation and conversational reporting only; never put expected time segments in the task description or another free-text task field.
7. Check for duplicates in the selected execution.
8. Create once. Read back the task ID, status, and linked story ID. If the association did not persist, update that exact task's `story` field once when supported and verify; never create a duplicate. Upload the identified requirement document only through an available MCP upload tool or bundled native helper when the user supplied the file and the fixed ZenTao target is confirmed.
9. If upload is unavailable or fails, keep the task, report that attachment state separately, and never say it was attached unless verified.

## Update

1. Resolve the exact task ID and read its current fields.
2. Use only the fields exposed by the live update schema. Change only fields the user explicitly requested; do not infer a new assignee, dates, priority, estimate, story, or module.
3. Check the current status and existing values before writing. If the target field is already correct, report that without issuing a write.
4. Call update once and read the task back when supported. On timeout or an ambiguous response, query before retrying.

## Complete

1. Resolve the exact task ID, inspect its live schema and read status, actual start, and consumed hours.
2. If already done, return the existing state. If closed/cancelled, stop. Do not assume code generation means the work passed tests.
3. Use estimated time and hours as actual only when the user confirms the task completed exactly as planned. Otherwise ask for or verify actual times and hours. Keep real work dates, including weekends, unchanged.
4. Apply [task completion template](task-complete-template.md): write actual start, finish, and this completion's consumed hours to `realStarted`, `finishedDate`, and `currentConsumed`. Keep the comment to actual results, verification, and follow-ups; include actual split intervals only if native date-time fields cannot express them. Call finish once, then read back `done` if supported. Never call close as a substitute.

## Tool and result handling

The active MCP schema is authoritative for names and fields. ZenTao API documentation explains server-side behavior but does not prove that this MCP instance exposes it correctly. Treat HTTP status text inside a tool result separately from the MCP transport status. On auth-looking errors, do not repeat a write: diagnose the transport/tool result, refresh only through the configured client mechanism, then confirm the original operation's state before any retry.
