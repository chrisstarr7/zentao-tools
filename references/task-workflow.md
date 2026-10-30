# Task workflow

## Create

1. Treat “create a task” as authorization for that task only. Read the current chat and explicit requirement files; do not search unrelated folders or other conversations.
2. Inspect live MCP tools and schemas. Confirm that task creation, task listing, story lookup, and execution lookup exist before relying on them. Read [task matching](task-matching.md) to resolve the current account and candidates.
3. Resolve the requirement/story and execution. Ask only when multiple options remain plausible or a required field is missing.
4. Apply [task creation template](task-create-template.md). Obtain estimate hours from the user; never infer them. Check the user's work schedule in the current conversation or saved calendar config. If absent, ask for shift start/end and break start/end before calculating the interval.
5. Round current Asia/Shanghai time down to the hour and calculate the estimate backwards, skipping configured breaks. If the start passes before shift start, continue into the previous configured workday, skipping weekends and holidays. Use [work calendar](work-calendar.md). If ZenTao only accepts date fields, preserve every date/time segment in the task description instead of claiming time precision in those fields.
6. Check for duplicates in the selected execution.
7. Create once. Read back the task ID/status if a live tool supports it. Upload the identified requirement document only through an available MCP upload tool or the bundled native helper when the user supplied the file and the fixed ZenTao target is confirmed.
8. If upload is unavailable or fails, keep the task, report that attachment state separately, and never say it was attached unless verified.

## Update

1. Resolve the exact task ID and read its current fields.
2. Use only the fields exposed by the live update schema. Change only fields the user explicitly requested; do not infer a new assignee, dates, priority, or estimate.
3. Check the current status and existing values before writing. If the target field is already correct, report that without issuing a write.
4. Call update once and read the task back when supported. On timeout or an ambiguous response, query before retrying.

## Complete

1. Resolve the exact task ID, inspect its live schema and read status, actual start, and consumed hours.
2. If already done, return the existing state. If closed/cancelled, stop. Do not assume code generation means the work passed tests.
3. Use estimated time and hours as actual only when the user confirms the task completed exactly as planned. Otherwise ask for or verify actual times and hours. Keep real work dates, including weekends, unchanged.
4. Apply [task completion template](task-complete-template.md), call finish once, then read back `done` if supported. Never call close as a substitute.

## Tool and result handling

The active MCP schema is authoritative for names and fields. ZenTao API documentation explains server-side behavior but does not prove that this MCP instance exposes it correctly. Treat HTTP status text inside a tool result separately from the MCP transport status. On auth-looking errors, do not repeat a write: diagnose the transport/tool result, refresh only through the configured client mechanism, then confirm the original operation's state before any retry.
