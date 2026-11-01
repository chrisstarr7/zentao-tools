import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSchedule, calculateWorkInterval, DEFAULT_WORK_CALENDAR, loadWorkCalendar, todayInTimeZone } from '../scripts/zentao/work-calendar.mjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const shiftCalendar = { ...DEFAULT_WORK_CALENDAR, workWindow: { start: '09:00', breakStart: '12:00', breakEnd: '13:30', end: '18:30' } };

test('calculates 16 hours from Friday across a weekend and month boundary', () => {
  assert.deepEqual(calculateSchedule({ hours: 16, startDate: '2026-10-30' }), {
    estStarted: '2026-10-30', deadline: '2026-11-02', calculatedDeadline: '2026-11-02', workdays: 2, dailyCapacityHours: 8,
  });
});

test('calculates across year boundary and leap day', () => {
  assert.equal(calculateSchedule({ hours: 16, startDate: '2024-02-29' }).deadline, '2024-03-01');
  assert.equal(calculateSchedule({ hours: 16, startDate: '2026-12-31' }).deadline, '2027-01-01');
});

test('moves an automatic weekend start to the next workday', () => {
  const result = calculateSchedule({ hours: 1, today: '2026-10-31' });
  assert.equal(result.estStarted, '2026-11-02');
  assert.equal(result.deadline, '2026-11-02');
});

test('rejects an explicitly requested weekend start instead of shifting it', () => {
  assert.throws(() => calculateSchedule({ hours: 1, startDate: '2026-10-31' }), /not a workday/);
});

test('supports fractional estimates and makeup workdays', () => {
  const calendar = { ...DEFAULT_WORK_CALENDAR, makeupWorkdays: ['2026-10-31'] };
  assert.equal(calculateSchedule({ hours: 0.5, startDate: '2026-10-30' }).deadline, '2026-10-30');
  assert.equal(calculateSchedule({ hours: 16, startDate: '2026-10-30', calendar }).deadline, '2026-10-31');
});

test('skips configured holidays and preserves a later explicit deadline', () => {
  const calendar = { ...DEFAULT_WORK_CALENDAR, holidays: ['2026-11-02'] };
  const result = calculateSchedule({ hours: 16, startDate: '2026-10-30', deadline: '2026-11-04', calendar });
  assert.equal(result.calculatedDeadline, '2026-11-03');
  assert.equal(result.deadline, '2026-11-04');
});

test('rejects impossible estimates, dates, and explicit deadline conflicts', () => {
  for (const hours of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => calculateSchedule({ hours, startDate: '2026-10-26' }), /positive number/);
  }
  assert.throws(() => calculateSchedule({ hours: 8, startDate: '2026-02-30' }), /Invalid date/);
  assert.throws(() => calculateSchedule({ hours: 16, startDate: '2026-10-30', deadline: '2026-10-30' }), /earlier than/);
});

test('rejects conflicting holiday and makeup-workday overrides', () => {
  const calendar = { ...DEFAULT_WORK_CALENDAR, holidays: ['2026-10-31'], makeupWorkdays: ['2026-10-31'] };
  assert.throws(() => calculateSchedule({ hours: 1, startDate: '2026-10-31', calendar }), /both a holiday/);
  assert.throws(() => calculateSchedule({ hours: 1, today: '2026-10-26', calendar: { ...DEFAULT_WORK_CALENDAR, workingDays: [] } }), /at least one/);
});

test('uses the supplied time zone when deriving today', () => {
  assert.equal(todayInTimeZone(new Date('2026-10-25T17:00:00Z'), 'Asia/Shanghai'), '2026-10-26');
});

test('rounds the Beijing time down to a half hour and skips lunch when counting backwards', () => {
  assert.deepEqual(calculateWorkInterval({ hours: 3, endDate: '2026-10-30', endTime: '14:11', calendar: shiftCalendar }), {
    startDate: '2026-10-30', startTime: '09:30', endDate: '2026-10-30', endTime: '14:00', hours: 3,
    segments: [{ date: '2026-10-30', startTime: '09:30', endTime: '12:00' }, { date: '2026-10-30', startTime: '13:30', endTime: '14:00' }],
  });
});

test('uses 13:30–16:30 for three hours at 16:50 Beijing time', () => {
  assert.deepEqual(calculateWorkInterval({ hours: 3, now: new Date('2026-11-02T08:50:00Z') }), {
    startDate: '2026-11-02', startTime: '13:30', endDate: '2026-11-02', endTime: '16:30', hours: 3,
    segments: [{ date: '2026-11-02', startTime: '13:30', endTime: '16:30' }],
  });
  for (const [endTime, expectedEnd] of [['16:29', '16:00'], ['16:30', '16:30'], ['16:59', '16:30'], ['17:00', '17:00']]) {
    assert.equal(calculateWorkInterval({ hours: 3, endDate: '2026-11-02', endTime }).endTime, expectedEnd);
  }
});

test('uses Beijing time and rolls estimates into previous configured workdays', () => {
  const now = new Date('2026-10-30T06:11:00Z');
  assert.equal(calculateWorkInterval({ hours: 3, now, calendar: shiftCalendar }).endTime, '14:00');
  assert.throws(() => calculateWorkInterval({ hours: 1, endTime: '14:00', calendar: { ...DEFAULT_WORK_CALENDAR, workWindow: null } }), /Configure working hours/);
  assert.deepEqual(calculateWorkInterval({ hours: 4, endDate: '2026-10-30', endTime: '14:00', calendar: shiftCalendar }), {
    startDate: '2026-10-29', startTime: '18:00', endDate: '2026-10-30', endTime: '14:00', hours: 4,
    segments: [
      { date: '2026-10-29', startTime: '18:00', endTime: '18:30' },
      { date: '2026-10-30', startTime: '09:00', endTime: '12:00' },
      { date: '2026-10-30', startTime: '13:30', endTime: '14:00' },
    ],
  });
  const weekend = calculateWorkInterval({ hours: 4, endDate: '2026-11-02', endTime: '14:11', calendar: shiftCalendar });
  assert.equal(weekend.startDate, '2026-10-30');
  assert.equal(weekend.startTime, '18:00');
  assert.equal(weekend.segments.length, 3);
});

test('uses the default shift without a calendar file and respects saved overrides', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'zentao-calendar-test-'));
  try {
    const configPath = path.join(temp, 'work-calendar.json');
    const calendar = await loadWorkCalendar(configPath);
    const interval = calculateWorkInterval({ hours: 3, now: new Date('2026-10-30T06:11:00Z'), calendar });
    assert.equal(interval.startTime, '09:30');
    assert.equal(interval.endTime, '14:00');
    assert.equal(interval.segments.length, 2);
    await writeFile(configPath, JSON.stringify({ holidays: ['2026-10-30'] }));
    const holiday = calculateWorkInterval({ hours: 8, endDate: '2026-10-30', endTime: '14:11', calendar: await loadWorkCalendar(configPath) });
    assert.equal(holiday.startDate, '2026-10-29');
    assert.equal(holiday.startTime, '09:00');
    assert.equal(holiday.endTime, '18:30');
    await writeFile(configPath, JSON.stringify({ workWindow: { start: '10:00', breakStart: '12:00', breakEnd: '13:00', end: '19:00' } }));
    const custom = calculateWorkInterval({ hours: 3, endDate: '2026-10-30', endTime: '14:11', calendar: await loadWorkCalendar(configPath) });
    assert.equal(custom.startTime, '10:00');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('uses the last working boundary before the shift, after the shift, on weekends, and during lunch', () => {
  for (const [endDate, endTime, expectedDate, expectedEnd, expectedStart] of [
    ['2026-10-30', '08:30', '2026-10-29', '18:30', '15:30'],
    ['2026-10-30', '09:00', '2026-10-29', '18:30', '15:30'],
    ['2026-10-30', '20:00', '2026-10-30', '18:30', '15:30'],
    ['2026-11-01', '14:11', '2026-10-30', '18:30', '15:30'],
    ['2026-10-30', '13:15', '2026-10-30', '12:00', '09:00'],
  ]) {
    const interval = calculateWorkInterval({ hours: 3, endDate, endTime });
    assert.equal(interval.endDate, expectedDate);
    assert.equal(interval.endTime, expectedEnd);
    assert.equal(interval.startTime, expectedStart);
  }
});
