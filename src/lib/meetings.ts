// Turning calendar occurrences into the things the site says about them (#37).
//
// The dates themselves come from the council's Google Calendar and are fetched
// and expanded in ./gcal.ts. This module does the other half: given the
// occurrences, it works out what the standing pattern is, so the sentence "The
// third Tuesday of every month except August, 7pm for a 7.30pm start, until
// 10pm" is read off the calendar rather than typed next to it.
//
// Deriving that sentence is the point. A hand-written one is a second copy of a
// fact the calendar already holds, and the copy is wrong from the moment
// somebody changes the meeting in Google and does not think to edit the repo.
//
// A crawler will not run JavaScript to work any of this out, so it all happens
// during the build and lands in the static HTML.

export const MEETING_TIME_ZONE = "Europe/London";

/**
 * How many occurrences to pull from the calendar and publish in /meetings.ics.
 * Eighteen is about two years of a monthly meeting with a month or two off:
 * long enough that a subscription stays useful if the rebuild ever stops, short
 * enough that we are not publishing dates nobody has committed to. Also the
 * window the standing pattern is derived from, which needs a clear year in it.
 */
export const CALENDAR_HORIZON = 18;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

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

/** One expanded occurrence, as the calendar has it. Produced by ./gcal.ts. */
export interface MeetingInstance {
  /** Calendar date as yyyy-mm-dd, in the meeting's own time zone. */
  date: string;
  /** ISO 8601 start instant with the correct UTC offset for that date. */
  startIso: string;
  endIso: string;
  /** Wall-clock "HH:MM" in Europe/London, which is what the prose quotes. */
  startTime: string;
  endTime: string;
  summary: string;
  location: string;
}

/**
 * The facts about the meetings that the calendar cannot carry, so content does.
 * Deliberately small: anything Google knows is read from Google.
 */
export interface MeetingDetails {
  /** Google has one start time per event. "Doors at 7 for a 7.30 start" is two. */
  doorsOpen: string;
  attendanceNote: string;
}

/** The standing pattern, read back off the occurrences rather than declared. */
export interface MeetingRule {
  weekOfMonth: number;
  weekday: string;
  exceptMonths: string[];
  startTime: string;
  endTime: string;
}

export interface Meeting {
  date: string;
  startIso: string;
  endIso: string;
  /** "Tuesday 15 September 2026" */
  longDate: string;
  /** "7pm for a 7.30pm start, until 10pm" */
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

/** Format an instant as ISO 8601 with the wall time and offset of `timeZone`. */
export function isoWithOffset(instant: Date, timeZone: string = MEETING_TIME_ZONE): string {
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

/** "19:30" -> "7.30pm", "19:00" -> "7pm". */
export function formatClock(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour12}.${String(m).padStart(2, "0")}${suffix}` : `${hour12}${suffix}`;
}

/** The value that appears most often, first past the post on ties. */
function modal(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Read the standing pattern off the occurrences.
 *
 * Fails loudly rather than describing the meetings wrongly. If the calendar
 * stops being "the nth <weekday> of the month" the sentence this produces would
 * be false, and a false sentence about when a public body meets is worse than a
 * build that stops and says so.
 *
 * Times are the modal ones rather than required to be identical, because a
 * single meeting that runs late is a normal thing to record in Google and is no
 * reason to refuse to describe the pattern. Each meeting still carries its own
 * times; only this summary sentence uses the typical ones.
 */
export function deriveMeetingRule(instances: MeetingInstance[]): MeetingRule {
  if (instances.length === 0) {
    throw new Error("Meeting calendar: cannot describe a pattern with no meetings in it.");
  }

  const weekdays = new Set<number>();
  const weeksOfMonth = new Set<number>();
  for (const instance of instances) {
    const [year, month, day] = instance.date.split("-").map(Number);
    weekdays.add(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
    // Which occurrence of that weekday within its month: days 1-7 are the
    // first, 8-14 the second, and so on.
    weeksOfMonth.add(Math.ceil(day / 7));
  }

  if (weekdays.size !== 1 || weeksOfMonth.size !== 1) {
    throw new Error(
      "Meeting calendar: the meetings no longer fall on the same weekday of the same " +
        "week each month, so the standing rule quoted on the site cannot be derived " +
        "from them. Dates seen: " +
        instances.map((i) => i.date).join(", ") +
        ". Either restore the pattern in Google Calendar, or the site needs to stop " +
        "claiming there is one.",
    );
  }

  return {
    weekday: WEEKDAY_NAMES[[...weekdays][0]],
    weekOfMonth: [...weeksOfMonth][0],
    exceptMonths: monthsWithoutMeetings(instances),
    startTime: modal(instances.map((i) => i.startTime)),
    endTime: modal(instances.map((i) => i.endTime)),
  };
}

/**
 * Month names in the first full year of the horizon that hold no meeting.
 *
 * A full year, because "except August" is a claim about a year and cannot be
 * read off a shorter window. If the horizon does not span twelve months the
 * honest answer is that we cannot tell, and an empty list means the sentence
 * says "every month" rather than naming months off on thin evidence.
 */
function monthsWithoutMeetings(instances: MeetingInstance[]): string[] {
  const [firstYear, firstMonth] = instances[0].date.split("-").map(Number);
  const [lastYear, lastMonth] = instances[instances.length - 1].date.split("-").map(Number);
  const monthsSpanned = (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1;
  if (monthsSpanned < 12) return [];

  const occupied = new Set(instances.map((i) => i.date.slice(0, 7)));
  const missing: string[] = [];
  for (let step = 0; step < 12; step++) {
    const month0 = firstMonth - 1 + step;
    const year = firstYear + Math.floor(month0 / 12);
    const key = `${year}-${String((month0 % 12) + 1).padStart(2, "0")}`;
    if (!occupied.has(key)) missing.push(MONTH_NAMES[month0 % 12]);
  }
  // Calendar order reads better than horizon order: "July, August and December"
  // rather than "December, July and August" when the horizon starts in autumn.
  return missing.sort((a, b) => MONTH_NAMES.indexOf(a) - MONTH_NAMES.indexOf(b));
}

/** Dress the raw occurrences up for display. */
export function toMeetings(instances: MeetingInstance[], details: MeetingDetails): Meeting[] {
  return instances.map((instance) => {
    const [year, month, day] = instance.date.split("-").map(Number);
    const weekday = WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return {
      date: instance.date,
      startIso: instance.startIso,
      endIso: instance.endIso,
      longDate: `${weekday} ${day} ${MONTH_NAMES[month - 1]} ${year}`,
      timeLabel: timeLabel(instance.startTime, instance.endTime, details.doorsOpen),
    };
  });
}

function timeLabel(startTime: string, endTime: string, doorsOpen: string): string {
  const start = formatClock(startTime);
  const opening =
    doorsOpen && doorsOpen !== startTime
      ? `${formatClock(doorsOpen)} for a ${start} start`
      : `${start} start`;
  return `${opening}, until ${formatClock(endTime)}`;
}

/** Human-readable statement of the pattern itself, for prose and llms.txt. */
export function describeMeetingRule(rule: MeetingRule, details: MeetingDetails): string {
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
    `${timeLabel(rule.startTime, rule.endTime, details.doorsOpen)}.`
  );
}

/**
 * schema.org `Schedule` for the standing pattern. Unlike a list of dates this
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
