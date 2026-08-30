// Meeting dates are derived, never stored (#37).
//
// Content holds the standing rule ("third Tuesday of every month except July,
// August and December") plus a list of one-off cancellations. This module turns
// that into concrete dates at build time, so the page and the structured data
// always name a meeting that has not happened yet without anyone editing a list
// of dates. The weekly cron in .github/workflows/deploy.yml keeps the output
// ahead of the calendar.
//
// A crawler will not run JavaScript to work the date out, so this has to happen
// during the build and land in the static HTML.

export const MEETING_TIME_ZONE = "Europe/London";

/**
 * How many meetings /meetings.ics publishes: two years of a monthly rule with
 * three months off. Long enough that a subscription stays useful if the weekly
 * rebuild ever stops, short enough that we are not publishing dates nobody has
 * committed to. Lives here rather than in the endpoint because the page quotes
 * the count back to the reader, and the two must agree.
 */
export const CALENDAR_HORIZON = 18;

const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface MeetingRule {
  weekOfMonth: number;
  weekday: string;
  exceptMonths: string[];
  doorsOpen: string;
  startTime: string;
  endTime: string;
  attendanceNote: string;
}

export interface Meeting {
  /** Calendar date as yyyy-mm-dd, in the meeting's own time zone. */
  date: string;
  /** ISO 8601 start instant with the correct UTC offset for that date. */
  startIso: string;
  /** ISO 8601 end instant with the correct UTC offset for that date. */
  endIso: string;
  /** "Tuesday 15 September 2026" */
  longDate: string;
  /** "7pm for 7.30 start, to 9pm" style label built from the rule's times. */
  timeLabel: string;
}

/**
 * Milliseconds a time zone is ahead of UTC at a given instant.
 *
 * Derived by formatting the instant in the target zone and reading the wall
 * clock back as if it were UTC. The difference is the offset, which is how DST
 * gets handled without shipping a time zone database.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const f = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wallAsUtc = Date.UTC(
    f("year"),
    f("month") - 1,
    f("day"),
    f("hour"),
    f("minute"),
    f("second"),
  );
  return wallAsUtc - instant.getTime();
}

/**
 * Turn a wall-clock time in `timeZone` into the UTC instant it names.
 *
 * Two passes: guess that the wall time is UTC, measure the offset there, then
 * correct. One correction settles every case except the hour that DST skips,
 * which no meeting in this rule can land on.
 */
function wallTimeToInstant(
  year: number,
  month0: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month0, day, hours, minutes);
  let instant = new Date(naive);
  for (let pass = 0; pass < 2; pass++) {
    instant = new Date(naive - zoneOffsetMs(instant, timeZone));
  }
  return instant;
}

/** Format an instant as ISO 8601 with the wall time and offset of `timeZone`. */
function isoWithOffset(instant: Date, timeZone: string): string {
  const offsetMs = zoneOffsetMs(instant, timeZone);
  const wall = new Date(instant.getTime() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, "0");

  const sign = offsetMs < 0 ? "-" : "+";
  const offsetMinutes = Math.abs(Math.round(offsetMs / 60000));
  const offset = `${sign}${pad(Math.floor(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;

  return (
    `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
    `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:00${offset}`
  );
}

/**
 * Day of the month on which the nth given weekday falls, or 0 when the month
 * has no nth occurrence of it.
 */
export function nthWeekdayOfMonth(
  year: number,
  month0: number,
  weekdayIndex: number,
  n: number,
): number {
  const firstWeekday = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const offset = (weekdayIndex - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return day > daysInMonth ? 0 : day;
}

function parseClock(value: string): [number, number] {
  const [h, m] = value.split(":").map(Number);
  return [h, m ?? 0];
}

/** "19:30" -> "7.30pm", "19:00" -> "7pm". */
export function formatClock(value: string): string {
  const [h, m] = parseClock(value);
  const suffix = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}.${String(m).padStart(2, "0")}${suffix}`;
}

/**
 * The next `count` meetings the rule produces, skipping excluded months and
 * cancelled dates, starting from the first one that has not yet ended.
 */
export function nextMeetings(
  rule: MeetingRule,
  exceptions: string[] = [],
  count = 3,
  now: Date = new Date(),
  timeZone: string = MEETING_TIME_ZONE,
): Meeting[] {
  const weekdayIndex = WEEKDAY_INDEX[rule.weekday];
  if (weekdayIndex === undefined) {
    throw new Error(`Unknown weekday in meeting rule: ${rule.weekday}`);
  }

  const skipped = new Set(rule.exceptMonths);
  const cancelled = new Set(exceptions);
  const [startH, startM] = parseClock(rule.startTime);
  const [endH, endM] = parseClock(rule.endTime);
  const timeLabel =
    `${formatClock(rule.doorsOpen)} for a ${formatClock(rule.startTime)} start, ` +
    `until ${formatClock(rule.endTime)}`;

  const meetings: Meeting[] = [];
  // Start from the month `now` falls in, in the meeting's own zone.
  const nowWall = new Date(now.getTime() + zoneOffsetMs(now, timeZone));
  let year = nowWall.getUTCFullYear();
  let month0 = nowWall.getUTCMonth();

  // Two years of lookahead is far more than the three meetings anyone asks for;
  // it exists so a pathological rule terminates rather than spinning.
  for (let step = 0; step < 24 && meetings.length < count; step++, month0++) {
    if (month0 > 11) {
      month0 -= 12;
      year++;
    }
    if (skipped.has(MONTH_NAMES[month0])) continue;

    const day = nthWeekdayOfMonth(year, month0, weekdayIndex, rule.weekOfMonth);
    if (day === 0) continue;

    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${year}-${pad(month0 + 1)}-${pad(day)}`;
    if (cancelled.has(date)) continue;

    const start = wallTimeToInstant(year, month0, day, startH, startM, timeZone);
    const end = wallTimeToInstant(year, month0, day, endH, endM, timeZone);
    // A meeting still counts as "next" while it is running.
    if (end.getTime() <= now.getTime()) continue;

    meetings.push({
      date,
      startIso: isoWithOffset(start, timeZone),
      endIso: isoWithOffset(end, timeZone),
      longDate: `${rule.weekday} ${day} ${MONTH_NAMES[month0]} ${year}`,
      timeLabel,
    });
  }

  return meetings;
}

/** Human-readable statement of the rule itself, e.g. for prose and llms.txt. */
export function describeMeetingRule(rule: MeetingRule): string {
  const ordinals = ["", "first", "second", "third", "fourth", "fifth"];
  const ordinal = ordinals[rule.weekOfMonth] ?? `${rule.weekOfMonth}th`;
  const months = rule.exceptMonths;
  const except =
    months.length === 0
      ? "every month"
      : `every month except ${months.slice(0, -1).join(", ")}${
          months.length > 1 ? " and " : ""
        }${months[months.length - 1]}`;
  return (
    `The ${ordinal} ${rule.weekday} of ${except}, ` +
    `${formatClock(rule.doorsOpen)} for a ${formatClock(rule.startTime)} start, ` +
    `until ${formatClock(rule.endTime)}.`
  );
}

/**
 * schema.org `Schedule` for the standing rule. Unlike a list of dates this
 * never goes stale, which is why it is emitted alongside the concrete events
 * rather than instead of them.
 */
export function meetingSchedule(rule: MeetingRule, timeZone: string = MEETING_TIME_ZONE) {
  return {
    "@type": "Schedule",
    repeatFrequency: "P1M",
    byDay: `https://schema.org/${rule.weekday}`,
    byMonth: MONTH_NAMES.map((m, i) => (rule.exceptMonths.includes(m) ? 0 : i + 1)).filter(
      (m) => m !== 0,
    ),
    // `byMonthWeek`, not `weekOfMonth`: the latter reads naturally but is not
    // a schema.org property, so a consumer would drop it silently.
    byMonthWeek: rule.weekOfMonth,
    startTime: `${rule.startTime}:00`,
    endTime: `${rule.endTime}:00`,
    scheduleTimezone: timeZone,
  };
}
