// Meeting dates come from the council's Google Calendar, at build time (#37).
//
// The calendar is the single source. Nothing in this repo stores a meeting date
// or a meeting time, and the prose sentence on the page ("The third Tuesday of
// every month except...") is derived from what the feed actually contains
// rather than typed alongside it. That is deliberate: a hand-written sentence
// next to a machine-read feed is two sources of the same fact, and the pair
// drifts the first time someone changes one of them.
//
// What content still owns, because the calendar cannot carry it:
//   doorsOpen       Google has one start time per event; "doors at 7 for a 7.30
//                   start" is a second one, and it matters to anyone deciding
//                   when to leave.
//   venue           The structured address that schema.org wants. The calendar
//                   has a LOCATION string, which is prose, not an address. The
//                   two are checked against each other in tests/seo.test.mjs.
//   attendanceNote  Editorial.
//
// Failure is loud, by instruction. A build that cannot reach the calendar, gets
// something it cannot parse, or finds no future meetings, stops. The deployed
// site keeps serving the last good build, which still has real dates on it. The
// alternative was falling back to a hardcoded rule, which would quietly publish
// dates nobody had agreed to, and be indistinguishable from working.

import ICAL from "ical.js";
import {
  CALENDAR_HORIZON,
  MEETING_TIME_ZONE,
  type Meeting,
  type MeetingDetails,
  type MeetingInstance,
  type MeetingRule,
  deriveMeetingRule,
  isoWithOffset,
  toMeetings,
} from "./meetings";

function fail(message: string): never {
  throw new Error(
    `Meeting calendar: ${message}\n` +
      `The site cannot be built without the meeting dates. Check that the calendar ` +
      `is still shared publicly and that its iCal address in ` +
      `src/content/site/index.json is current.`,
  );
}

/**
 * Fetch and expand the calendar into the next `limit` occurrences.
 *
 * Expansion is ical.js's, not ours. Google publishes a monthly meeting as one
 * VEVENT carrying an RRULE plus EXDATEs for the months off, and a second VEVENT
 * with a RECURRENCE-ID for any single occurrence that was edited on its own.
 * Reconstructing dates from that by hand means reimplementing RFC 5545
 * recurrence, and getting it subtly wrong would show up as a wrong date on a
 * public body's website rather than as an error.
 */
export async function fetchMeetingInstances(
  icsUrl: string,
  limit: number,
  now: Date = new Date(),
): Promise<MeetingInstance[]> {
  let body: string;
  try {
    const res = await fetch(icsUrl, {
      headers: { Accept: "text/calendar" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) fail(`${icsUrl} returned HTTP ${res.status}`);
    body = await res.text();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Meeting calendar:")) throw error;
    fail(`could not be fetched from ${icsUrl} (${(error as Error).message})`);
  }

  let calendar: ICAL.Component;
  try {
    calendar = new ICAL.Component(ICAL.parse(body));
  } catch (error) {
    fail(`did not parse as iCalendar (${(error as Error).message})`);
  }

  // Google ships the VTIMEZONE definition it used. Registering it means the
  // expansion resolves TZID=Europe/London the way Google meant it, rather than
  // falling back to whatever the build machine thinks that zone is.
  for (const vtimezone of calendar.getAllSubcomponents("vtimezone")) {
    const zone = new ICAL.Timezone(vtimezone);
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone);
  }

  const events = calendar.getAllSubcomponents("vevent").map((c) => new ICAL.Event(c));
  if (events.length === 0) fail("contains no events");

  // Attach edited single occurrences to the series they belong to, so the
  // series yields the edited version rather than both versions.
  const exceptions = events.filter((e) => e.isRecurrenceException());
  const series = events.filter((e) => !e.isRecurrenceException());
  for (const parent of series) {
    for (const exception of exceptions) {
      if (exception.uid === parent.uid) parent.relateException(exception.component);
    }
  }

  const cutoff = now.getTime();
  const instances: MeetingInstance[] = [];

  for (const event of series) {
    if (!event.isRecurring()) {
      const one = describe(event, event.startDate, event.endDate);
      if (Date.parse(one.endIso) > cutoff) instances.push(one);
      continue;
    }

    const iterator = event.iterator();
    // A monthly RRULE with no UNTIL is infinite. The cap is what stops this
    // being a loop with no exit; it is generous enough that a meeting pattern
    // with most of the year off still fills the horizon.
    for (let step = 0; step < 400 && instances.length < limit * 3; step++) {
      const next = iterator.next();
      if (!next) break;
      const occurrence = event.getOccurrenceDetails(next);
      const one = describe(event, occurrence.startDate, occurrence.endDate);
      if (Date.parse(one.endIso) <= cutoff) continue;
      instances.push(one);
    }
  }

  // A meeting still counts as "next" while it is running, hence end vs start.
  instances.sort((a, b) => a.startIso.localeCompare(b.startIso));
  const upcoming = instances.slice(0, limit);

  if (upcoming.length === 0) {
    fail(
      "has no meetings in the future. Either the recurring event has ended or " +
        "every remaining occurrence has been cancelled.",
    );
  }
  return upcoming;
}

/** Everything the pages, the JSON-LD and /meetings.ics need about meetings. */
export interface MeetingData {
  /** The next CALENDAR_HORIZON meetings, dressed for display. */
  meetings: Meeting[];
  /** The standing pattern, derived from those meetings. */
  rule: MeetingRule;
  /** The raw occurrences, for anything that needs the calendar's own strings. */
  instances: MeetingInstance[];
}

// Four routes want the same meetings, and Astro renders them in one process.
// Without this the build fetches the same calendar four times and, worse, could
// get four different answers if someone edits the calendar mid-build.
let cached: Promise<MeetingData> | undefined;

export function loadMeetings(
  icsUrl: string,
  details: MeetingDetails,
  venuePostcode: string,
  limit: number = CALENDAR_HORIZON,
): Promise<MeetingData> {
  cached ??= fetchMeetingInstances(icsUrl, limit).then((instances) => {
    assertVenueAgrees(instances, venuePostcode);
    return {
      instances,
      meetings: toMeetings(instances, details),
      rule: deriveMeetingRule(instances),
    };
  });
  return cached;
}

/**
 * The calendar carries a LOCATION string; content carries the structured
 * address that schema.org needs, and that is the one the site prints. Two
 * places holding the venue means the venue can move in one of them, so the
 * build refuses to publish an address the calendar disagrees with.
 *
 * Matched on postcode alone: everything else about how an address is written is
 * a matter of taste ("181 Pitt St" against "181 Pitt Street") and would fail on
 * differences nobody cares about.
 */
function assertVenueAgrees(instances: MeetingInstance[], venuePostcode: string): void {
  const wanted = venuePostcode.replace(/\s+/g, "").toUpperCase();
  const disagrees = instances.filter(
    (i) => i.location && !i.location.replace(/\s+/g, "").toUpperCase().includes(wanted),
  );
  if (disagrees.length === 0) return;

  fail(
    `says a meeting is somewhere other than ${venuePostcode}, which is the venue in ` +
      `src/content/site/index.json:\n` +
      disagrees.map((i) => `  ${i.date}: ${i.location}`).join("\n") +
      `\nIf the venue has moved, change it in content too: the calendar's location is ` +
      `prose, and the site needs the structured address.`,
  );
}

function describe(event: ICAL.Event, start: ICAL.Time, end: ICAL.Time): MeetingInstance {
  const zone = ICAL.TimezoneService.get(MEETING_TIME_ZONE);
  const localStart = zone ? start.convertToZone(zone) : start;
  const localEnd = zone ? end.convertToZone(zone) : end;
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    date: `${localStart.year}-${pad(localStart.month)}-${pad(localStart.day)}`,
    startIso: isoWithOffset(start.toJSDate(), MEETING_TIME_ZONE),
    endIso: isoWithOffset(end.toJSDate(), MEETING_TIME_ZONE),
    startTime: `${pad(localStart.hour)}:${pad(localStart.minute)}`,
    endTime: `${pad(localEnd.hour)}:${pad(localEnd.minute)}`,
    summary: event.summary ?? "",
    location: event.location ?? "",
  };
}
