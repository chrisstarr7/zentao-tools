# Task creation template

Use this template for a clearly requested new development task. Keep the task limited to the work the user described.

## Required fields

- **Name:** `Business/module - specific development work`. Use the requirement name plus the concrete scope; avoid generic titles such as “related development”.
- **Execution:** use the confirmed execution associated with the requirement. If more than one remains plausible, show 3–5 candidates and ask the user to choose.
- **Type:** `devel` (ZenTao API V2 development task).
- **Story:** the real ZenTao story ID when one is matched. Do not manufacture an ID or link an unrelated story.
- **Assignee:** the verified current authenticated account. Do not infer it from the workstation username or an unverified “assigned to me” filter.
- **Priority:** 3 unless the user or project rules specify otherwise.
- **Estimate:** use hours explicitly supplied by the user or a configured default. If neither exists, ask. Never estimate effort from task size.
- **Start and deadline:** use the user's explicit dates or calculate them with `scripts/zentao/work-calendar.mjs`; read [work calendar](work-calendar.md).
- **Attachment:** attach only the actual requirement document the user identified. If it is absent, inaccessible, unsupported, or upload cannot be verified, report that fact. Do not silently attach a different file.

## Description

```text
需求背景：<problem and confirmed requirement source>

开发内容：<concrete implementation work>

实现范围：<what this task includes and excludes>

验收要点：
- <observable result grounded in the requirement>
- <observable result grounded in the current request>
```

Summarize the requirement document and relevant current-chat messages. Do not paste a whole PRD, include unrelated debugging logs, or invent implementation details, interfaces, or verification results. Preserve uncertainty as an open question rather than turning it into a requirement.

## Create and verify

Before POST, inspect the selected execution for likely duplicates using the exact story, current account, title terms, and open status. After creation, retain the returned task ID and read it back when a suitable detail/list tool is available. Upload the attachment only after the task exists if the API requires an object ID. If upload fails, keep the task and report “task created, attachment failed”; never retry a timed-out create blindly.
