# Task completion template

Use this before marking an existing task complete. Completion is a business write; confirm that the user says the work is actually done and use only supplied or verified facts.

## Preflight

1. Resolve the exact task ID and read its status, current assignee, existing actual start, and existing consumed hours from available MCP results.
2. If the task is already `done`, return its existing result without writing or adding hours again. Do not complete `closed` or `cancel` tasks.
3. Require actual start and finish dates and consumed hours. If the user confirms the work followed the task's estimated interval and completed as planned, reuse the estimated interval and hours. Otherwise require the actual interval/hours or use verified task/work-log evidence. Never copy planned values into actual fields without that confirmation.
4. Distinguish actual hours from the task estimate. Do not set total consumed to `old total + current hours` and also send `currentConsumed` unless the live API contract explicitly requires both.

## Structured completion record

Recommended comment:

```text
任务名称：<confirmed task name and ID>
需求背景：<requirement/story this task implements>
实际完成内容：
- <delivered item>
- <delivered item>
实际工作时间：<YYYY-MM-DD HH:mm–HH:mm, Asia/Shanghai>
本次实际耗时：<hours>
验证结果：
- <check performed and its result; mark anything not run as unverified>
遗留问题：<known follow-up, or omit if none>
```

If the user confirms completion exactly matches the estimate, the planned time interval and estimate may populate the actual-time and actual-hours fields. Otherwise never make them equal just for convenience. If the active MCP/API schema accepts only dates, send date-only values to those fields and preserve exact times in the structured completion record. Do not claim ZenTao stored hour/minute precision. `currentConsumed` is the actual duration in hours; never infer it from the estimate alone.

## Write and verify

Call the live finish operation once with the actual data and a concise comment. Do not call the close operation. Read the task back and confirm `done`; if the tool only returns a generic status or a transport result is ambiguous, do not claim the final state was verified and do not repeat the finish call without checking the task first.
