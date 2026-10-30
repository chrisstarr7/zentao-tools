# Work calendar

The date scheduler uses `Asia/Shanghai`, Monday–Friday, and an 8-hour planning capacity by default. Clock-time estimates require the user's actual shift and break times from the current conversation or saved config; do not silently assume a schedule. The time-interval helper rounds the current Beijing time down to the hour, then counts estimated work hours backwards, skipping the configured break.

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
  "workWindow": {
    "start": "09:00",
    "breakStart": "12:00",
    "breakEnd": "13:30",
    "end": "18:30"
  },
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
- `workWindow` must be provided by the user/config before calculating a time interval. The interval end is current Beijing time rounded down to the hour. If now is inside the configured break, use the break start as the last valid work-time boundary. If backward calculation passes before shift start, continue from the previous configured workday's shift end, skipping weekends and configured holidays. Return each contiguous work segment separately so an overnight gap is never represented as worked time.
- Example: for 09:00–18:30 with a 12:00–13:30 break, a 3-hour estimate at 14:11 uses 14:00 as its end and calculates 09:30–14:00 as the interval (the 1.5-hour break is excluded).
- With the same shift, a 4-hour estimate ending Friday at 14:00 spans Thursday 18:00–18:30, Friday 09:00–12:00, and Friday 13:30–14:00. The total is four working hours; weekends and overnight gaps are excluded.
- Real start and finish dates are not shifted by this calendar. ZenTao API V2 completion fields are date-only; if the user supplied clock times, retain them in the completion comment and do not claim the API stored that precision.

Use `node scripts/zentao/work-calendar.mjs --hours 16 --start 2026-10-30` for a deterministic date calculation. `--start` is optional; `--today` is available for deterministic testing, and `--config` overrides the user config path.

Use `node scripts/zentao/work-calendar.mjs --hours 3 --interval` to calculate a time window from the current Beijing time after the user's `workWindow` has been saved in config. Without that config, ask the user for work and break times.
