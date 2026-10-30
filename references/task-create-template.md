# Task creation template

Use this template for a clearly requested new development task. Keep the task limited to the work the user described.

## Hard gate

Do not call the task-create MCP operation unless both are explicitly available: (1) the user's estimated hours and (2) the user's ZenTao story ID. If either is missing, ask for the missing value(s) and stop before creation. Never infer hours from task size or infer a story ID from a title/search result. After both are supplied, look up and verify the exact story ID before creating.

## Required fields

- **Execution (`executionID`):** select the confirmed execution associated with the requirement. If more than one remains plausible, show 3–5 candidates and ask the user to choose.
- **Module (`module`):** use the matched module. When no narrower module applies and the form shows the root `/` module, pass `0` (the value used for root-module tasks in the connected instance); do not omit a field just because it appears optional in the MCP schema.
- **Type (`type`):** `devel` (ZenTao API V2 development task).
- **Story (`story`):** require the user-provided ZenTao story ID. Fetch that exact ID with `get_stories_storyID`; verify the response succeeds, returns the same ID, is not deleted, and matches the requested requirement. If it does not match or cannot be verified, stop and clarify. Pass the verified ID in the create payload's native `story` field; do not merely mention it in `desc`.
- **Assignee (`assignedTo`):** pass the verified current authenticated user's ZenTao account. Do not infer it from the workstation username or an unverified “assigned to me” filter.
- **Name (`name`):** summarize `<requirement/task name> + <actual work in this task>` as one concise sentence; avoid generic titles.
- **Priority (`pri`):** 3 unless the user or project rules specify otherwise.
- **Estimate (`estimate`):** required; use the number of hours explicitly supplied by the user. If missing, ask and do not create. Never estimate effort from task size. Before calculating the interval, use a work schedule already provided in this conversation or saved in the user's calendar config. If neither exists, ask for shift start/end and break start/end. Round current Beijing time down to the whole hour as the interval end, then count the requested work hours backwards while skipping configured breaks. If the start passes before shift start, continue from the previous configured workday, skipping weekends and configured holidays. Calculate with `scripts/zentao/work-calendar.mjs --hours <hours> --interval`.
- **Planned dates (`estStarted`, `deadline`):** set these native MCP fields to the first and last work dates. The connected task API stores dates, estimate hours, and the requirement description in separate fields. Do not repeat type, assignee, estimate, date, or priority in the description.
- **Exact time segments:** the connected create schema has no clock-time schedule field. Use the calculated segments only to determine the native `estStarted`, `deadline`, and `estimate` values. Do not put the expected time segments in `desc` or another free-text task field; if useful, report them in the conversation response. Do not claim ZenTao stored clock-time precision.
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

If exact clock-time intervals are required but the MCP only accepts date-level planned fields, keep the intervals out of the task description and other free-text fields. Keep the estimated hours and overall first/last dates exclusively in `estimate`, `estStarted`, and `deadline`; provide the calculated clock-time segments to the user in the response when useful.

Summarize the requirement document and relevant current-chat messages to the level of a concise implementation requirement. Do not paste a whole PRD, include unrelated debugging logs, or invent implementation details, interfaces, dependencies, or verification results. Preserve uncertainty as an open question rather than turning it into a requirement. Keep task type `devel`; assign it to the verified current login user.

## Create and verify

Before POST, inspect the selected execution for likely duplicates using the exact story, current account, title terms, and open status. Include the verified story ID in the create payload. After creation, retain the returned task ID and read it back; verify its `story`/`storyID` equals the requested ID. If the task exists but is not linked, update that exact task's native `story` field once when supported, then read it back; never create a duplicate to repair a missing link. Upload the attachment only after the task exists if the API requires an object ID. If upload fails, keep the task and report “task created, attachment failed”; never retry a timed-out create blindly.
