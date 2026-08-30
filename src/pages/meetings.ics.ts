// /meetings.ics — the meeting calendar, as a file a calendar app understands.
//
// Generated from the same rule as the page and the JSON-LD, so a subscriber and
// a reader can never be told different dates. Two ways to use it, and they
// behave differently in a way worth knowing about:
//
//   Subscribe (webcal://bbcc.scot/meetings.ics)
//       The client re-fetches on its own schedule and tracks the feed. Because
//       the weekly cron in .github/workflows/deploy.yml rebuilds the site, dates
//       added or cancelled later reach a subscriber without them doing anything.
//   Download and import (https://bbcc.scot/meetings.ics)
//       A snapshot. It never updates again, which is a property of importing,
//       not of this file. The page says so rather than letting people find out.
//
// That difference is also why no cancelled meeting is published as
// STATUS:CANCELLED: a subscribing client reconciles against the whole feed and
// drops what is no longer in it, and an importing client would never see the
// update whatever we emitted.

import type { APIRoute } from "astro";
import { getEntry } from "astro:content";
import { CALENDAR_HORIZON, MEETING_TIME_ZONE, nextMeetings } from "../lib/meetings";

/** RFC 5545 wants UTC as yyyymmddThhmmssZ, with the punctuation stripped. */
function icsStamp(value: string | Date): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escaping for TEXT values. Order matters: backslashes first. */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to 75 octets per line, continuations prefixed with a space.
 *
 * Octets rather than characters, and iterating code points rather than UTF-16
 * units, because a fold that lands inside a multi-byte character corrupts it.
 * The venue line and the attendance note are both long enough to reach this.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines spend one of their 75 octets on the leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts[0] + parts.slice(1).map((part) => `\r\n ${part}`).join("");
}

export const GET: APIRoute = async ({ site }) => {
  const base = site!.href.replace(/\/$/, "");
  const facts = (await getEntry("site", "index")).data;
  const meetings = nextMeetings(facts.meetingRule, facts.meetingExceptions, CALENDAR_HORIZON);

  const venueLine = [
    facts.venue.name,
    facts.venue.streetAddress,
    `${facts.venue.addressLocality} ${facts.venue.postalCode}`,
  ].join(", ");

  // The event runs from the start time, not from doors, because that is what
  // the JSON-LD says and the two must not disagree. The doors time still
  // matters to somebody deciding when to leave the house, so it goes in the
  // description rather than being lost.
  const description = [
    meetings[0] ? `${meetings[0].timeLabel}.` : "",
    facts.meetingRule.attendanceNote,
    facts.venue.accessNote,
    `Details and any changes: ${base}/#meetings`,
  ]
    .filter(Boolean)
    .join(" ");

  const stamp = icsStamp(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${facts.legalName}//bbcc.scot//EN`,
    "CALSCALE:GREGORIAN",
    // NAME and REFRESH-INTERVAL are RFC 7986; the X-WR- pair is what most
    // clients actually read. Both cost a line.
    `NAME:${esc(facts.legalName)}`,
    `X-WR-CALNAME:${esc(facts.legalName)}`,
    `X-WR-CALDESC:${esc(`Public meetings of the ${facts.legalName}.`)}`,
    `X-WR-TIMEZONE:${MEETING_TIME_ZONE}`,
    // Matches the weekly cron that regenerates this file. Asking clients to
    // poll harder than the source changes would be rude.
    "REFRESH-INTERVAL;VALUE=DURATION:P1W",
    "X-PUBLISHED-TTL:P1W",
  ];

  for (const meeting of meetings) {
    lines.push(
      "BEGIN:VEVENT",
      // Stable and derived from the date, so re-importing updates the event a
      // subscriber already has rather than duplicating it.
      `UID:meeting-${meeting.date}@bbcc.scot`,
      `DTSTAMP:${stamp}`,
      // UTC instants. The offset for each date is worked out in meetings.ts,
      // which is the one place that knows about British Summer Time.
      `DTSTART:${icsStamp(meeting.startIso)}`,
      `DTEND:${icsStamp(meeting.endIso)}`,
      `SUMMARY:${esc(`${facts.legalName} public meeting`)}`,
      `LOCATION:${esc(venueLine)}`,
      `DESCRIPTION:${esc(description)}`,
      `URL:${base}/#meetings`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  // CRLF throughout, and a trailing one: RFC 5545 is specific about this and
  // some clients are strict about it.
  const body = `${lines.map(fold).join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="bbcc-meetings.ics"',
    },
  });
};
