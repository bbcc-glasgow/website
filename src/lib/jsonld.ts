// The site-wide JSON-LD graph (#37).
//
// One `@graph` rather than per-section blocks: this is a single-page site, so
// the organisation, its meeting venue, its meeting series and the site itself
// are all facets of one thing and reference each other by `@id`.
//
// Everything here comes from the site content collection. Nothing is written
// into this file, because a fact asserted in markup that disagrees with the
// visible page is worse than no markup at all.
//
// Deliberately absent: personal names. `contactPoint` describes the council by
// role and points every role at the shared inbox, so an election that changes
// who holds a post cannot leave a wrong claim about a real person in the
// structured data. Names appear as ordinary page text instead.

import { meetingSchedule, type MeetingDetails, type MeetingRule, type Meeting } from "./meetings";

export interface SiteFacts {
  legalName: string;
  description: string;
  boundaryDescription: string;
  contactEmail: string;
  venue: {
    name: string;
    streetAddress: string;
    addressLocality: string;
    postalCode: string;
    addressCountry: string;
    accessNote: string;
  };
  meetingCalendar: { icsUrl: string };
  meetingDetails: MeetingDetails;
  areaPartnership: { name: string; parentBody: string };
  officeBearers: { role: string; name?: string }[];
  socialProfiles: string[];
}

/**
 * Build the graph for a site rooted at `siteUrl`.
 *
 * `meetings` and `rule` are passed in rather than fetched here: the calendar is
 * read once per build, and a page and its own markup must not be able to
 * disagree about which meeting is next. It also lets tests pin a date.
 */
export function buildGraph(
  facts: SiteFacts,
  siteUrl: string,
  meetings: Meeting[],
  rule: MeetingRule,
) {
  const base = siteUrl.replace(/\/$/, "");
  const orgId = `${base}/#organization`;
  const venueId = `${base}/#venue`;
  const seriesId = `${base}/#meetings`;

  const postalAddress = {
    "@type": "PostalAddress",
    streetAddress: facts.venue.streetAddress,
    addressLocality: facts.venue.addressLocality,
    postalCode: facts.venue.postalCode,
    addressCountry: facts.venue.addressCountry,
  };

  const organization = {
    "@type": "GovernmentOrganization",
    "@id": orgId,
    name: facts.legalName,
    alternateName: "BBCC",
    url: `${base}/`,
    description: facts.description,
    email: `mailto:${facts.contactEmail}`,
    logo: `${base}/images/bbcc-logo.png`,
    image: `${base}/images/og-card.png`,
    address: postalAddress,
    areaServed: {
      "@type": "Place",
      name: "Blythswood and Broomielaw, Glasgow city centre",
      description: facts.boundaryDescription,
    },
    memberOf: {
      "@type": "Organization",
      name: facts.areaPartnership.name,
      parentOrganization: { "@type": "Organization", name: facts.areaPartnership.parentBody },
    },
    contactPoint: facts.officeBearers.map((bearer) => ({
      "@type": "ContactPoint",
      contactType: bearer.role,
      email: facts.contactEmail,
      areaServed: "GB",
      availableLanguage: "English",
    })),
    sameAs: facts.socialProfiles,
  };

  const venue = {
    "@type": "Place",
    "@id": venueId,
    name: facts.venue.name,
    address: postalAddress,
    publicAccess: true,
    // The access note verbatim, rather than a `LocationFeatureSpecification`
    // asserting step-free access as a boolean. The boolean would be a fact this
    // file invented: the content collection holds a sentence, and if an editor
    // ever changes what that sentence says the markup has to change with it.
    description: facts.venue.accessNote,
  };

  const eventDefaults = {
    organizer: { "@id": orgId },
    location: { "@id": venueId },
    isAccessibleForFree: true,
    // Hybrid: the meetings run in the room and on Zoom at the same time.
    eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode",
  };

  const series = {
    "@type": "EventSeries",
    "@id": seriesId,
    name: `${facts.legalName} public meetings`,
    description: `${facts.meetingDetails.attendanceNote} ${facts.venue.accessNote}`,
    url: `${base}/#meetings`,
    eventSchedule: meetingSchedule(rule),
    ...eventDefaults,
  };

  // The schedule above never goes stale; the concrete events below are what an
  // answer engine can quote when asked for the next date. Both, not either.
  const events = meetings.map((meeting) => ({
    "@type": "Event",
    "@id": `${base}/#meeting-${meeting.date}`,
    name: `${facts.legalName} public meeting`,
    startDate: meeting.startIso,
    endDate: meeting.endIso,
    superEvent: { "@id": seriesId },
    ...eventDefaults,
  }));

  const website = {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: `${base}/`,
    name: facts.legalName,
    inLanguage: "en-GB",
    publisher: { "@id": orgId },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, venue, series, ...events, website],
  };
}
