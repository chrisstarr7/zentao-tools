# Task completion template

Use this before marking an existing task complete. Completion is a business write; confirm that the user says the work is actually done and use only supplied or verified facts.

## Preflight

1. Resolve the exact task ID and read its status, current assignee, existing actual start, and existing consumed hours from available MCP results.
2. If the task is already `done`, return its existing result without writing or adding hours again. Do not complete `closed` or `cancel` tasks.
3. Require actual start and finish dates and consumed hours. If the user confirms the work followed the task's estimated interval and completed as planned, reuse the estimated interval and hours. Otherwise require the actual interval/hours or use verified task/work-log evidence. Never copy planned values into actual fields without that confirmation.
4. Distinguish actual hours from the task estimate. Do not set total consumed to `old total + current hours` and also send `currentConsumed` unless the live API contract explicitly requires both.

## Structured completion record

Map actual dates and hours to the finish operation's native fields: `realStarted`, `finishedDate`, and `currentConsumed`. Use exact date-time values when the live API accepts them; otherwise pass its supported date format. `currentConsumed` is this completion's actual hours, not the planned estimate. Do not send a cumulative `consumed` value as well unless the live API explicitly requires it. The comment is for the outcome, verification, and follow-up only; do not copy task metadata into it.

Recommended comment:

```text
实际完成内容：
- <delivered item>
- <delivered item>
验证结果：
- <check performed and its result; mark anything not run as unverified>
遗留问题：<known follow-up, or omit if none>
```

When work happened in multiple non-contiguous intervals, include only the actual interval segments in the comment if the native start/finish fields cannot represent those breaks. Otherwise keep times and hours in their native fields and omit duplicate metadata from the comment. Use estimated dates/hours as actual values only when the user confirms the work followed the estimate and completed as planned. Never copy planned values merely to make actuals match; never infer actual hours from the estimate alone.

## Write and verify

Call the live finish operation once with the actual data and a concise comment. Do not call the close operation. Read the task back and confirm `done`; if the tool only returns a generic status or a transport result is ambiguous, do not claim the final state was verified and do not repeat the finish call without checking the task first.
