import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_WORK_CALENDAR = Object.freeze({
  timeZone: 'Asia/Shanghai',
  workingDays: [1, 2, 3, 4, 5],
  dailyCapacityHours: 8,
  workWindow: { start: '09:00', breakStart: '12:00', breakEnd: '13:30', end: '19:00' },
  holidays: [],
  makeupWorkdays: [],
});

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) throw new Error(`Invalid date: ${value}`);
  return date;
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, amount = 1) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function todayInTimeZone(now = new Date(), timeZone = DEFAULT_WORK_CALENDAR.timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validateCalendar(calendar) {
  if (!calendar || typeof calendar !== 'object' || Array.isArray(calendar)) throw new Error('Work calendar must be an object.');
  if (typeof calendar.timeZone !== 'string' || !calendar.timeZone) throw new Error('Work calendar timeZone is required.');
  try { new Intl.DateTimeFormat('en', { timeZone: calendar.timeZone }); }
  catch { throw new Error(`Invalid time zone: ${calendar.timeZone}`); }
  if (!Array.isArray(calendar.workingDays) || calendar.workingDays.length === 0 || calendar.workingDays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new Error('workingDays must contain at least one ISO weekday number from 1 to 7.');
  }
  if (!Number.isFinite(calendar.dailyCapacityHours) || calendar.dailyCapacityHours <= 0) {
    throw new Error('dailyCapacityHours must be greater than zero.');
  }
  for (const key of ['holidays', 'makeupWorkdays']) {
    if (!Array.isArray(calendar[key])) throw new Error(`${key} must be an array of dates.`);
    for (const date of calendar[key]) parseDate(date);
  }
  const holidays = new Set(calendar.holidays);
  if (calendar.makeupWorkdays.some(date => holidays.has(date))) throw new Error('A date cannot be both a holiday and a makeup workday.');
}

export async function loadWorkCalendar(configPath = defaultConfigPath()) {
  try {
    const configured = JSON.parse(await fs.readFile(configPath, 'utf8'));
    const calendar = { ...DEFAULT_WORK_CALENDAR, ...configured };
    validateCalendar(calendar);
    return calendar;
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_WORK_CALENDAR };
    throw new Error(`Work calendar config is invalid: ${error.message}`);
  }
}

export function defaultConfigPath() {
  const root = process.platform === 'win32'
    ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(root, 'zentao-tools', 'work-calendar.json');
}

function isWorkday(date, calendar, holidays, makeupDays) {
  const value = dateString(date);
  if (makeupDays.has(value)) return true;
  if (holidays.has(value)) return false;
  const isoDay = date.getUTCDay() || 7;
  return calendar.workingDays.includes(isoDay);
}

export function calculateSchedule({ hours, startDate, deadline, today, now, calendar = DEFAULT_WORK_CALENDAR }) {
  validateCalendar(calendar);
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) throw new Error('Estimated hours must be a positive number.');

  const holidays = new Set(calendar.holidays);
  const makeupDays = new Set(calendar.makeupWorkdays);
  const explicitlyStarted = startDate !== undefined;
  let start = parseDate(startDate ?? today ?? todayInTimeZone(now, calendar.timeZone));
  if (explicitlyStarted && !isWorkday(start, calendar, holidays, makeupDays)) {
    throw new Error(`Explicit start date ${startDate} is not a workday in the configured calendar.`);
  }
  if (!explicitlyStarted) {
    do { start = addDays(start); }
    while (!isWorkday(start, calendar, holidays, makeupDays));
  }

  let workdays = 0;
  let end = new Date(start);
  while (workdays < Math.ceil(hours / calendar.dailyCapacityHours)) {
    if (isWorkday(end, calendar, holidays, makeupDays)) workdays++;
    if (workdays < Math.ceil(hours / calendar.dailyCapacityHours)) end = addDays(end);
  }

  const calculatedDeadline = dateString(end);
  if (deadline !== undefined) {
    const requestedDeadline = parseDate(deadline);
    if (requestedDeadline < end) {
      throw new Error(`Explicit deadline ${deadline} is earlier than the estimated completion date ${calculatedDeadline}.`);
    }
  }

  return {
    estStarted: dateString(start),
    deadline: deadline ?? calculatedDeadline,
    calculatedDeadline,
    workdays,
    dailyCapacityHours: calendar.dailyCapacityHours,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i].replace(/^--/, '').split('=', 2);
    if (!['hours', 'start', 'deadline', 'today', 'config'].includes(key)) throw new Error(`Unknown option: --${key}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`Missing value for --${key}`);
    result[key] = value;
  }
  if (result.hours === undefined) throw new Error('Provide --hours.');
  result.hours = Number(result.hours);
  return result;
}

async function main(argv) {
  const options = parseArgs(argv);
  const calendar = await loadWorkCalendar(options.config);
  process.stdout.write(`${JSON.stringify(calculateSchedule({
    hours: options.hours,
    startDate: options.start,
    deadline: options.deadline,
    today: options.today,
    calendar,
  }))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
