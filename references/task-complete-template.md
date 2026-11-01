# Task completion template

Use this before marking a task complete. Completion requires an explicit user request. For a newly created task in a [combined create and complete request](task-workflow.md#create-and-complete), the request itself authorizes using the supplied hours and calculated planned interval as the actual record; no separate completion or matching-actuals confirmation is required. For other completion requests, use supplied or verified actuals, or the user's confirmation of completion as planned.

## Preflight

1. Resolve the exact task ID and read its status, current assignee, existing actual start, and existing consumed hours from available MCP results.
2. If the task is already `done`, return its existing result without writing or adding hours again. Do not complete `closed` or `cancel` tasks.
3. For the newly created task in an explicit combined request, use the interval calculated once during creation for actual start/finish and the supplied hours for this completion's consumed hours. Explicit actual dates/hours take precedence. Otherwise require actual start/finish and consumed hours from the user or verified task/work-log evidence; reuse planned values only if the user confirms completion as planned. Do not apply the combined shortcut to an unrelated or pre-existing task.
4. Distinguish actual hours from the task estimate. Do not set total consumed to `old total + current hours` and also send `currentConsumed` unless the live API contract explicitly requires both.

## Structured completion record

Map actual dates and hours to the finish operation's native fields: `realStarted`, `finishedDate`, and `currentConsumed`. Use exact date-time values when the live API accepts them; otherwise pass its supported date format and preserve the actual clock-time interval in the completion comment. `currentConsumed` is this completion's hours; for the combined request it defaults to the same supplied hours used for `estimate`. Do not send a cumulative `consumed` value as well unless the live API explicitly requires it. Keep the comment to outcomes, verification, follow-up and actual time precision the native fields cannot store.

Recommended comment:

```text
实际完成内容：
- <delivered item>
- <delivered item>
验证结果：
- <check performed and its result; mark anything not run as unverified>
遗留问题：<known follow-up, or omit if none>
```

When the native start/finish fields cannot represent the actual clock-time interval or its breaks, include the actual interval segments in the comment. Otherwise keep times and hours in their native fields and omit duplicate metadata from the comment. Reusing planned dates/hours as actuals is authorized by the explicit combined request for the newly created task, or by the user's confirmation of completion as planned. Outside those cases, do not infer actuals from an estimate alone. Reusing the interval does not establish a test result or justify inventing delivered work.

## Write and verify

Call the live finish operation once with the actual data and a concise comment. Do not call the close operation. Read the task back and confirm `done`; if the tool only returns a generic status or a transport result is ambiguous, do not claim the final state was verified and do not repeat the finish call without checking the task first.
