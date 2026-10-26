# Task completion template

Use this before marking an existing task complete. Completion is a business write; confirm that the user says the work is actually done and use only supplied or verified facts.

## Preflight

1. Resolve the exact task ID and read its status, current assignee, existing actual start, and existing consumed hours from available MCP results.
2. If the task is already `done`, return its existing result without writing or adding hours again. Do not complete `closed` or `cancel` tasks.
3. Require the actual start date, actual finish date, and hours consumed in this completion. Reuse a verified actual start date if present. Ask for missing values instead of inventing them.
4. Distinguish actual hours from the task estimate. Do not set total consumed to `old total + current hours` and also send `currentConsumed` unless the live API contract explicitly requires both.

## Completion record

Recommended comment:

```text
本次完成内容：<what was actually delivered>
验证情况：<tests or checks actually run; state unverified items plainly>
遗留问题：<known follow-up, if any>
```

If the user provides start/finish times but the active MCP/API schema accepts only dates, send date-only values to those fields and preserve the exact times in the comment. Do not claim ZenTao stored hour/minute precision. `currentConsumed` is the actual duration in hours; it must not be derived from planned estimate.

## Write and verify

Call the live finish operation once with the actual data and a concise comment. Do not call the close operation. Read the task back and confirm `done`; if the tool only returns a generic status or a transport result is ambiguous, do not claim the final state was verified and do not repeat the finish call without checking the task first.
