# Task creation template

Use this template for a clearly requested new development task. Keep the task limited to the work the user described.

## Required fields

- **Execution (`executionID`):** select the confirmed execution associated with the requirement. If more than one remains plausible, show 3–5 candidates and ask the user to choose.
- **Module (`module`):** use the matched module. When no narrower module applies and the form shows the root `/` module, pass `0` (the value used for root-module tasks in the connected instance); do not omit a field just because it appears optional in the MCP schema.
- **Type (`type`):** `devel` (ZenTao API V2 development task).
- **Story (`story`):** pass the real matched ZenTao story ID. Otherwise omit it; never manufacture an ID or link an unrelated story.
- **Assignee (`assignedTo`):** pass the verified current authenticated user's ZenTao account. Do not infer it from the workstation username or an unverified “assigned to me” filter.
- **Name (`name`):** summarize `<requirement/task name> + <actual work in this task>` as one concise sentence; avoid generic titles.
- **Priority (`pri`):** 3 unless the user or project rules specify otherwise.
- **Estimate (`estimate`):** use hours explicitly supplied by the user; never estimate effort from task size. Before calculating the interval, use a work schedule already provided in this conversation or saved in the user's calendar config. If neither exists, ask for shift start/end and break start/end. Round current Beijing time down to the whole hour as the interval end, then count the requested work hours backwards while skipping configured breaks. If the start passes before shift start, continue from the previous configured workday, skipping weekends and configured holidays. Calculate with `scripts/zentao/work-calendar.mjs --hours <hours> --interval`.
- **Planned dates (`estStarted`, `deadline`):** set these native MCP fields to the first and last work dates. The connected task API stores dates, estimate hours, and the requirement description in separate fields. Do not repeat type, assignee, estimate, date, or priority in the description.
- **Exact time segments:** the connected create schema has no clock-time schedule field. When the user requires a calculated interval, preserve only each exact work segment (date and clock times) in a short `预计时段（MCP 日期字段不含时分）` note in the description; do not repeat the overall date range or total estimate. Do not claim ZenTao stored clock-time precision.
- **Parent task:** the connected MCP create/update schema currently exposes no parent-task field. Do not put a parent ID or label into `desc` as a substitute; report the limitation if a parent task is required.
- **Attachment:** the connected create schema has no attachment field. Attach only the actual requirement document the user identified using the supported post-create upload flow. If it is absent, inaccessible, unsupported, or upload cannot be verified, report that fact. Do not silently attach a different file.

## Description field

Use `desc` only for requirement and implementation content; map all other data to the matching native fields above. Summarize the requirement document and relevant current conversation in this structure, omitting a section only when its facts are unavailable:

```text
需求背景：
<problem to solve, intended user/business outcome, and source document>

需求说明：
<requirement-standard summary of relevant behavior and rules; separate confirmed requirements from open questions>

本任务开发内容：
- <specific implementation item>
- <specific implementation item>

实现范围：
- 包含：<work owned by this task>
- 不包含：<related work outside this task, only when needed to avoid scope ambiguity>

验收标准：
- <observable result grounded in the requirement>
- <observable result grounded in the current request>

依赖与约束：
- <confirmed dependency, limit, or “暂无已知依赖”>
```

If exact clock-time intervals are required but the MCP only accepts date-level planned fields, append only those intervals in the separate short note specified above. Keep the estimated hours and overall first/last dates exclusively in `estimate`, `estStarted`, and `deadline`.

Summarize the requirement document and relevant current-chat messages to the level of a concise implementation requirement. Do not paste a whole PRD, include unrelated debugging logs, or invent implementation details, interfaces, dependencies, or verification results. Preserve uncertainty as an open question rather than turning it into a requirement. Keep task type `devel`; assign it to the verified current login user.

## Create and verify

Before POST, inspect the selected execution for likely duplicates using the exact story, current account, title terms, and open status. After creation, retain the returned task ID and read it back when a suitable detail/list tool is available. Upload the attachment only after the task exists if the API requires an object ID. If upload fails, keep the task and report “task created, attachment failed”; never retry a timed-out create blindly.
