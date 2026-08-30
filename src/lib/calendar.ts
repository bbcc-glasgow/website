// Where "add this to my calendar" actually has to go, per calendar app.
//
// A bare .ics link is the lowest common denominator and the worst outcome for
// most people: on a phone it may open a preview it cannot save from, and on a
// desktop it lands in Downloads as a one-off snapshot that never updates again.
// The web apps most people actually use each take a feed URL as a query
// parameter and do the subscribing themselves, so we hand them that instead of
// handing the reader a file and wishing them luck.
//
// Every one of these is the same feed. What differs is whether the result keeps
// itself up to date:
//
//   subscribe  Google, Outlook, Apple. The client re-fetches on its own
//              schedule, so dates added or cancelled later arrive on their own.
//              Google polls roughly daily, which is well inside the weekly
//              rebuild in .github/workflows/deploy.yml.
//   download   The .ics file. A snapshot, frozen at the moment of download.
//              Offered last, and labelled as what it is.
//
// The feed URL is passed to the providers unencoded, which is what their own
// documentation shows and is legal in a query string: RFC 3986 allows ":" and
// "/" there. Nothing here is user-supplied, so there is no injection surface.

export interface CalendarLink {
  /** Button label. The app's name, because that is what the reader is looking for. */
  label: string;
  href: string;
  /** True when the result tracks the feed rather than freezing a copy of it. */
  subscribes: boolean;
}

/**
 * Build the add-to-calendar links for a site.
 *
 * Takes the site URL rather than hardcoding bbcc.scot so a preview deployment
 * offers its own feed rather than pointing subscribers at production.
 */
export function calendarLinks(site: URL | string): CalendarLink[] {
  const base = new URL(site).href.replace(/\/$/, "");
  const https = `${base}/meetings.ics`;
  // webcal:// is not a real protocol, it is a hint. Calendar apps register for
  // it and fetch over https; browsers hand it to the registered app rather than
  // rendering it. That handoff is the whole point: it is how a phone opens the
  // calendar app instead of downloading a file.
  const webcal = https.replace(/^https?:/, "webcal:");

  return [
    {
      label: "Google Calendar",
      href: `https://calendar.google.com/calendar/r?cid=${webcal}`,
      subscribes: true,
    },
    {
      // Personal Microsoft accounts. Work and school accounts live on
      // outlook.office.com, but this is a community council: outlook.com is the
      // likelier account, and anyone on a work tenant can paste the feed URL.
      label: "Outlook.com",
      href: `https://outlook.live.com/calendar/0/addfromweb?url=${webcal}`,
      subscribes: true,
    },
    {
      // Also Thunderbird, iOS, and anything else that registered for webcal://.
      label: "Apple Calendar",
      href: webcal,
      subscribes: true,
    },
    {
      label: "Download .ics file",
      href: "/meetings.ics",
      subscribes: false,
    },
  ];
}
