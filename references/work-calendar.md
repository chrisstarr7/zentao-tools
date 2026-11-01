# Work calendar

The scheduler defaults to `Asia/Shanghai`, Monday–Friday, 09:00–18:30 with a 12:00–13:30 break (8 working hours per day). Use these defaults automatically without asking for work or break times. Explicit settings in the current conversation override saved config, which overrides the built-in defaults. The time-interval helper rounds the current Beijing time down to a half-hour boundary, then counts supplied work hours backwards, skipping the configured break.

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
- `workWindow` defaults to 09:00–18:30 with a 12:00–13:30 break; no config file is required. The interval end is current Beijing time rounded down to the nearest half hour: 16:29 → 16:00, 16:30 → 16:30, 16:50 → 16:30. If now is inside the configured break, use the break start as the last valid work-time boundary. After the shift, use shift end; at or before shift start, or on a non-working day, use the previous configured workday's shift end. If backward calculation passes before shift start, continue from the previous configured workday's shift end, skipping weekends and configured holidays. Return each contiguous work segment separately so an overnight gap is never represented as worked time.
- Example: for 09:00–18:30 with a 12:00–13:30 break, a 3-hour estimate at 14:11 uses 14:00 as its end and calculates 09:30–14:00 as the interval (the 1.5-hour break is excluded).
- With the same shift, a 4-hour estimate ending Friday at 14:00 spans Thursday 18:00–18:30, Friday 09:00–12:00, and Friday 13:30–14:00. The total is four working hours; weekends and overnight gaps are excluded.
- On a working day at 16:50, a 3-hour interval is 13:30–16:30. In an explicit [create and complete request](task-workflow.md#create-and-complete), use that same calculated interval and the supplied 3 hours for both planned and actual records, unless explicit actual values override them. Calculate once for the whole workflow; a later finish call must not move the interval.
- Explicit actual start and finish dates are not shifted by this calendar. Use native completion date-time precision only when verified; if the API stores dates only, retain actual clock times (including a reused interval from a combined request) in the completion comment and do not claim the native fields stored that precision.

Use `node scripts/zentao/work-calendar.mjs --hours 16 --start 2026-10-30` for a deterministic date calculation. `--start` is optional; `--today` is available for deterministic testing, and `--config` overrides the user config path.

Use `node scripts/zentao/work-calendar.mjs --hours 3 --interval` to calculate a time window from the current Beijing time with the built-in defaults or the user's saved overrides. An explicit conversation override can be supplied using `--config` with a temporary calendar JSON; do not persist it as the user's preference unless requested. Missing config is not a reason to ask for work and break times.
