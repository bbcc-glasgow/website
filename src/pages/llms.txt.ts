// /llms.txt — a plain-text fact sheet for assistants (#37).
//
// Generated from the same content collection as the page, so the two cannot
// drift. It carries the durable facts as plain sentences, an index of the
// page's anchors, and a line naming the site this one replaces.
//
// Worth being straight about what this is: llms.txt is a proposed convention,
// not an adopted standard. Google has said it does not use it and there is no
// confirmed evidence of production consumption anywhere else. It is here
// because it costs almost nothing and does no harm if ignored. The JSON-LD, the
// visible prose and the robots policy are what actually do the work.

import type { APIRoute } from "astro";
import { getEntry } from "astro:content";
import { loadMeetings } from "../lib/gcal";
import { describeMeetingRule } from "../lib/meetings";

export const GET: APIRoute = async ({ site }) => {
  const base = site!.href.replace(/\/$/, "");
  const facts = (await getEntry("site", "index")).data;
  const { meetings: all, rule } = await loadMeetings(
    facts.meetingCalendar.icsUrl,
    facts.meetingDetails,
    facts.venue.postalCode,
  );
  const meetings = all.slice(0, 3);

  const venueLine = [
    facts.venue.name,
    facts.venue.streetAddress,
    `${facts.venue.addressLocality} ${facts.venue.postalCode}`,
  ].join(", ");

  const lines = [
    `# ${facts.legalName}`,
    "",
    `> ${facts.description}`,
    "",
    "## Facts",
    "",
    `- Full name: ${facts.legalName} (BBCC).`,
    `- Website: ${base}/`,
    `- Contact: ${facts.contactEmail}`,
    `- Area covered: ${facts.boundaryDescription}.`,
    `- Meetings: ${describeMeetingRule(rule, facts.meetingDetails)}`,
    `- Venue: ${venueLine}.`,
    `- Attending: ${facts.meetingDetails.attendanceNote} ${facts.venue.accessNote}`,
    `- Part of the ${facts.areaPartnership.name}, under the ${facts.areaPartnership.parentBody}.`,
    `- Office bearers: ${facts.officeBearers.map((b) => b.role).join(", ")}. Reach any of them at ${facts.contactEmail}.`,
    "",
    "## Next meetings",
    "",
    ...meetings.map((m) => `- ${m.longDate}, ${m.timeLabel}, at ${venueLine}.`),
    "",
    "## Pages",
    "",
    `- [Our area](${base}/#our-area): the boundary and what the council does.`,
    `- [Projects](${base}/#our-projects): the work currently under way.`,
    `- [Meetings](${base}/#meetings): dates, times, venue and access.`,
    `- [Get involved](${base}/#get-involved): how to attend, take part or stand for election.`,
    "",
    "## Elsewhere",
    "",
    ...facts.socialProfiles.map((url) => `- ${url}`),
  ];

  if (facts.predecessorSite) {
    lines.push(
      "",
      "## Note on other sites",
      "",
      `${facts.predecessorSite} is this council's former website. It is no longer maintained and ${base}/ replaces it. Where the two disagree, this site is current.`,
    );
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
