# Task creation template

Use this template for a clearly requested new development task. Keep the task limited to the work the user described.

## Required fields

- **Name:** Summarize as one sentence from `<requirement/task name> + <the actual work in this task>`. Be specific and concise; avoid generic titles such as “related development”.
- **Execution:** use the confirmed execution associated with the requirement. If more than one remains plausible, show 3–5 candidates and ask the user to choose.
- **Type:** `devel` (ZenTao API V2 development task).
- **Story:** the real ZenTao story ID when one is matched. Do not manufacture an ID or link an unrelated story.
- **Assignee:** the verified current authenticated user's ZenTao display name/account. Do not infer it from the workstation username or an unverified “assigned to me” filter.
- **Priority:** 3 unless the user or project rules specify otherwise.
- **Estimate and time interval:** use hours explicitly supplied by the user; never estimate effort from task size. Before calculating, use a work schedule already provided in this conversation or saved in the user's calendar config. If neither exists, ask for shift start/end and break start/end. Round current Beijing time down to the whole hour as the interval end, then count the requested work hours backwards while skipping configured breaks. If the start passes before shift start, continue from the previous configured workday, skipping weekends and configured holidays; retain each day's separate work segment in the description.
- **Start and deadline:** use the interval's first and last work dates; calculate with `scripts/zentao/work-calendar.mjs --hours <hours> --interval`. If MCP/API fields accept dates only, write the first/last date there and put each precise estimated segment in the structured description. Do not claim ZenTao stored clock-time precision.
- **Attachment:** attach only the actual requirement document the user identified. If it is absent, inaccessible, unsupported, or upload cannot be verified, report that fact. Do not silently attach a different file.

## Structured requirement description

Do not write the description as one free-form paragraph. Summarize the requirement document and relevant current conversation in this structure, omitting a section only when its facts are unavailable:

```text
需求名称：<confirmed requirement/story name and ID if available>

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

预计安排：<YYYY-MM-DD HH:mm–HH:mm, Asia/Shanghai; list each workday segment separately across breaks/days>

验收标准：
- <observable result grounded in the requirement>
- <observable result grounded in the current request>

依赖与约束：
- <confirmed dependency, limit, or “暂无已知依赖”>
```

Summarize the requirement document and relevant current-chat messages to the level of a concise implementation requirement. Do not paste a whole PRD, include unrelated debugging logs, or invent implementation details, interfaces, dependencies, or verification results. Preserve uncertainty as an open question rather than turning it into a requirement. Keep task type `devel`; assign it to the verified current login user.

## Create and verify

Before POST, inspect the selected execution for likely duplicates using the exact story, current account, title terms, and open status. After creation, retain the returned task ID and read it back when a suitable detail/list tool is available. Upload the attachment only after the task exists if the API requires an object ID. If upload fails, keep the task and report “task created, attachment failed”; never retry a timed-out create blindly.
