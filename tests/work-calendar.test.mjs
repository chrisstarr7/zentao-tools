import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSchedule, calculateWorkInterval, DEFAULT_WORK_CALENDAR, todayInTimeZone } from '../scripts/zentao/work-calendar.mjs';

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

test('rounds the Beijing time down to the hour and skips lunch when counting backwards', () => {
  assert.deepEqual(calculateWorkInterval({ hours: 3, endTime: '14:11', calendar: shiftCalendar }), {
    startTime: '09:30', endTime: '14:00', hours: 3,
  });
});

test('uses Beijing time, requires configured working hours, and rejects estimates outside the shift', () => {
  const now = new Date('2026-10-30T06:11:00Z');
  assert.equal(calculateWorkInterval({ hours: 3, now, calendar: shiftCalendar }).endTime, '14:00');
  assert.throws(() => calculateWorkInterval({ hours: 1, endTime: '14:00' }), /Configure working hours/);
  assert.throws(() => calculateWorkInterval({ hours: 10, endTime: '14:00', calendar: shiftCalendar }), /does not fit/);
});
