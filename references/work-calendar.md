# Work calendar

The scheduling helper uses `Asia/Shanghai`, Monday–Friday, and an 8-hour planning capacity by default. The stated work window 09:00–19:00 with a 12:00–13:30 break contains 8.5 clock hours; `dailyCapacityHours: 8` is the explicit planning cap and remains authoritative. The helper computes date-only `estStarted` and `deadline` values; it does not assign intraday working slots.

## Per-user override

Optional JSON config:

- Windows: `%APPDATA%\zentao-tools\work-calendar.json`
- macOS: `$XDG_CONFIG_HOME/zentao-tools/work-calendar.json`, or `~/.config/zentao-tools/work-calendar.json`

Example:

```json
{
  "timeZone": "Asia/Shanghai",
  "workingDays": [1, 2, 3, 4, 5],
  "dailyCapacityHours": 8,
  "holidays": ["2026-10-01"],
  "makeupWorkdays": ["2026-10-10"]
}
```

Weekdays use ISO numbers (Monday=1 … Sunday=7). `holidays` removes normally scheduled days; `makeupWorkdays` adds weekend or holiday workdays. A date cannot be in both lists. Do not put personal calendars into the public repository.

## Rules

- An explicit start date must be a configured workday; otherwise ask instead of silently moving it.
- If no start date is given, start on the next configured workday after today in `Asia/Shanghai`.
- Workdays required are `ceil(estimateHours / dailyCapacityHours)` and the start day counts as day one. Examples: 0.5 hours takes one workday; 16 hours from Friday ends Monday when there are no holidays.
- Reject zero, negative, non-numeric, or non-finite estimates.
- If an explicit deadline is earlier than the calculated completion date, report a conflict and ask. A later explicit deadline is preserved as the requested deadline; the helper also reports the calculated date.
- Real start and finish dates are not shifted by this calendar. ZenTao API V2 completion fields are date-only; if the user supplied clock times, retain them in the completion comment and do not claim the API stored that precision.

Use `node scripts/zentao/work-calendar.mjs --hours 16 --start 2026-10-30` for a deterministic date calculation. `--start` is optional; `--today` is available for deterministic testing, and `--config` overrides the user config path.
