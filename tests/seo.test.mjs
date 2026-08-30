// SEO and GEO invariants over the built site (#37).
//
// Reads dist/, so it runs after `pnpm build`. It pins structure and facts, not
// copy: titles, descriptions and prose live in Decap and are meant to be edited
// by non-developers, so asserting on wording would turn an ordinary content
// edit into a red build. What is asserted is the shape a crawler or an answer
// engine depends on, and the handful of facts that identify the council.
//
// Nothing else in tests/ touches title, description, canonical, OG, JSON-LD or
// robots. Lighthouse's SEO category is not a substitute: it scores 100 on a
// page with no structured data at all.

import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");

const SITE = "https://bbcc.scot";

// The share card is committed rather than built, so its dimensions are a fact
// about a file in the repo. 1200x630 is what Facebook, LinkedIn, WhatsApp and
// Slack all crop to; anything else gets letterboxed or cut.
const OG_IMAGE_PATH = "public/images/og-card.png";
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

// The X account belongs to the predecessor identity and is being disassociated
// (#37). `sameAs` is a positive assertion only and there is no markup meaning
// "not us", so the whole mechanism is to never emit it, and to ship no
// `twitter:site`. That is easy to undo by accident, hence the assertion.
const DISOWNED_PROFILE = "x.com/babccglasgow";

const ROUTES = [
  { url: "/", file: path.join(distDir, "index.html") },
  { url: "/holding/", file: path.join(distDir, "holding", "index.html") },
];

const siteFacts = JSON.parse(
  fs.readFileSync(path.resolve(rootDir, "src/content/site/index.json"), "utf-8"),
);

function readRoute(route) {
  assert.ok(
    fs.existsSync(route.file),
    `${route.file} not found - run 'pnpm build' first`,
  );
  return fs.readFileSync(route.file, "utf-8");
}

/** Astro escapes `&` in attribute values; compare on the decoded text. */
function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html, key, attr = "name") {
  const pattern = new RegExp(
    `<meta[^>]*\\b${attr}=["']${key}["'][^>]*\\bcontent=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(pattern);
  return match ? decodeEntities(match[1]) : undefined;
}

function titleOf(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]).trim() : undefined;
}

function canonicalOf(html) {
  const match = html.match(
    /<link[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']*)["']/i,
  );
  return match ? decodeEntities(match[1]) : undefined;
}

function jsonLdOf(html) {
  const match = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  assert.ok(match, "Expected a JSON-LD script block");
  return JSON.parse(match[1]);
}

/** PNG dimensions live in the IHDR chunk, at a fixed offset. No dependency. */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(
    buf.subarray(1, 4).toString("ascii"),
    "PNG",
    `${file} is not a PNG`,
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Workers' ASSETS binding takes a Request or a URL; the worker uses both. Two
// suites drive the worker - routing, and whether the calendar survives holding
// mode - so this sits at module scope rather than inside either of them.
const fakeAssets = {
  fetch: async (input) =>
    new Response("asset", {
      status: 200,
      headers: { "x-url": new URL(input.url ?? input).pathname },
    }),
};

async function call(url, mode) {
  const { default: worker } = await import("../worker.js");
  return worker.fetch(new Request(url), { SITE_MODE: mode, ASSETS: fakeAssets });
}

/** "20260915T183000Z" -> Date. iCalendar drops the punctuation ISO 8601 keeps. */
function icsToDate(value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  assert.ok(m, `not a UTC iCalendar timestamp: ${value}`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

// ── Per-route head tags ────────────────────────────────────────────────

describe("SEO - head tags on every built route", () => {
  for (const route of ROUTES) {
    it(`${route.url} has a non-empty title, description and canonical`, () => {
      const html = readRoute(route);

      assert.ok(titleOf(html), `${route.url} has no <title>`);
      assert.ok(
        metaContent(html, "description"),
        `${route.url} has no meta description`,
      );
      assert.equal(
        canonicalOf(html),
        `${SITE}${route.url}`,
        `${route.url} canonical should be its own absolute URL`,
      );
    });

    it(`${route.url} has the Open Graph set with an absolute image`, () => {
      const html = readRoute(route);

      for (const property of [
        "og:type",
        "og:site_name",
        "og:title",
        "og:description",
        "og:url",
        "og:image",
        "og:image:alt",
      ]) {
        assert.ok(
          metaContent(html, property, "property"),
          `${route.url} is missing ${property}`,
        );
      }

      const image = metaContent(html, "og:image", "property");
      assert.ok(
        image.startsWith("https://"),
        `og:image must be absolute, got ${image}`,
      );
      assert.equal(metaContent(html, "og:image:width", "property"), String(OG_IMAGE_WIDTH));
      assert.equal(metaContent(html, "og:image:height", "property"), String(OG_IMAGE_HEIGHT));
      assert.equal(metaContent(html, "og:url", "property"), `${SITE}${route.url}`);
    });

    it(`${route.url} has a large Twitter card and no twitter:site`, () => {
      const html = readRoute(route);

      assert.equal(metaContent(html, "twitter:card"), "summary_large_image");
      assert.ok(metaContent(html, "twitter:title"));
      assert.ok(metaContent(html, "twitter:description"));
      assert.ok(metaContent(html, "twitter:image"));
      assert.equal(
        metaContent(html, "twitter:site"),
        undefined,
        `twitter:site would bind the domain to ${DISOWNED_PROFILE}`,
      );
    });
  }

  it("gives each route a distinct title and description", () => {
    const titles = ROUTES.map((route) => titleOf(readRoute(route)));
    const descriptions = ROUTES.map((route) =>
      metaContent(readRoute(route), "description"),
    );

    assert.equal(new Set(titles).size, titles.length, `Duplicate titles: ${titles.join(" | ")}`);
    assert.equal(
      new Set(descriptions).size,
      descriptions.length,
      "Two routes share a meta description",
    );
  });

  it("noindexes /holding/ but not /", () => {
    const home = readRoute(ROUTES[0]);
    const holding = readRoute(ROUTES[1]);

    assert.match(
      metaContent(holding, "robots") ?? "",
      /noindex/,
      "/holding/ must be noindexed - the worker serves this content at / instead",
    );
    assert.ok(
      !/noindex/.test(metaContent(home, "robots") ?? ""),
      "/ must stay indexable",
    );
  });
});

// ── The share card ─────────────────────────────────────────────────────

describe("SEO - share card", () => {
  it("is committed at the size the platforms crop to", () => {
    const file = path.resolve(rootDir, OG_IMAGE_PATH);
    assert.ok(fs.existsSync(file), `${OG_IMAGE_PATH} is not committed`);
    assert.deepEqual(pngSize(file), {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    });
  });

  it("is the file every route's og:image points at", () => {
    for (const route of ROUTES) {
      const image = metaContent(readRoute(route), "og:image", "property");
      const built = path.join(distDir, new URL(image).pathname);
      assert.ok(fs.existsSync(built), `${image} does not resolve to ${built}`);
    }
  });
});

// ── The licensed photograph ────────────────────────────────────────────
//
// The hero photo is the one image on the site that is not Creative Commons.
// Mark Ynys-Mon gave permission on the condition that the page credits him with
// a link to his profile, so the photo and the credit have to ship together.
// This is the only assertion here that exists for a licence rather than for a
// crawler, and it is the reason it is worth failing a build over: dropping the
// credit while keeping the photo would put the site in breach.

describe("Licensing - the hero photograph carries its credit", () => {
  const homepage = readRoute(ROUTES[0]);

  it("credits the photographer with a link to the profile", () => {
    assert.match(homepage, /Mark Ynys-Mon/);
    assert.match(homepage, /href="https:\/\/www\.flickr\.com\/photos\/mymuk"/);
  });

  it("names the photographer inside the link, not merely near it", () => {
    // A credit that sits beside an unrelated link is not attribution. The
    // anchor's own text has to be the name a reader would click.
    const anchor = homepage.match(
      /<a[^>]+href="https:\/\/www\.flickr\.com\/photos\/mymuk"[^>]*>([\s\S]*?)<\/a>/,
    );
    assert.ok(anchor, "no anchor points at the photographer's profile");
    assert.match(anchor[1], /Mark Ynys-Mon/);
  });

  it("does not use the photo anywhere the credit cannot follow", () => {
    // Permission covers the page and the share card, and the share card was
    // asked about specifically. Any third use needs asking about too, so pin
    // the two that were agreed rather than letting a new one pass silently.
    const source = fs.readFileSync(
      path.resolve(rootDir, "src/pages/index.astro"),
      "utf-8",
    );
    assert.match(source, /duke_of_wellington_mym/);

    const otherPages = fs
      .readdirSync(path.resolve(rootDir, "src/pages"))
      .filter((f) => f !== "index.astro" && /\.(astro|ts)$/.test(f));
    for (const file of otherPages) {
      const body = fs.readFileSync(
        path.resolve(rootDir, "src/pages", file),
        "utf-8",
      );
      assert.doesNotMatch(
        body,
        /duke_of_wellington_mym/,
        `${file} uses the licensed photo but carries no credit`,
      );
    }
  });
});

// ── Structured data ────────────────────────────────────────────────────

describe("GEO - JSON-LD", () => {
  for (const route of ROUTES) {
    it(`${route.url} carries a parseable @graph naming the council`, () => {
      const graph = jsonLdOf(readRoute(route));
      assert.ok(Array.isArray(graph["@graph"]), "Expected an @graph array");

      const org = graph["@graph"].find((node) =>
        String(node["@type"]).includes("Organization"),
      );
      assert.ok(org, "No Organization node in the @graph");

      assert.equal(org["@type"], "GovernmentOrganization");
      assert.equal(org.name, siteFacts.legalName);
      assert.equal(org.url, `${SITE}/`);
      // Google's Organization example writes this as a mailto: URI; schema.org
      // itself shows a bare address. Either is fine, an empty one is not.
      assert.equal(String(org.email).replace(/^mailto:/, ""), siteFacts.contactEmail);
      assert.ok(org.address, "Organization has no postal address");
      assert.equal(org.address.postalCode, siteFacts.venue.postalCode);
      assert.ok(org.areaServed, "Organization has no areaServed");
      assert.ok(Array.isArray(org.sameAs) && org.sameAs.length > 0);
    });

    it(`${route.url} claims the current profiles and not the predecessor's`, () => {
      const graph = jsonLdOf(readRoute(route));
      const org = graph["@graph"].find((node) =>
        String(node["@type"]).includes("Organization"),
      );

      assert.deepEqual(
        [...org.sameAs].sort(),
        [...siteFacts.socialProfiles].sort(),
        "sameAs must be exactly the profiles in the content collection",
      );
      assert.ok(
        !org.sameAs.some((url) => url.includes(DISOWNED_PROFILE)),
        `sameAs must not claim ${DISOWNED_PROFILE}`,
      );
    });

    it(`${route.url} names no individual, only roles`, () => {
      // Decision 6: the machine-readable layer describes the institution,
      // which is durable. A stale office bearer stays a small visible error
      // rather than a wrong fact asserted in schema.org markup.
      const serialised = JSON.stringify(jsonLdOf(readRoute(route)));
      for (const bearer of siteFacts.officeBearers) {
        if (!bearer.name) continue;
        assert.ok(
          !serialised.includes(bearer.name),
          `${bearer.name} should not appear in JSON-LD`,
        );
      }
    });
  }

  it("describes the meeting rule as a Schedule that cannot go stale", () => {
    const graph = jsonLdOf(readRoute(ROUTES[0]));
    const series = graph["@graph"].find((node) => node["@type"] === "EventSeries");
    assert.ok(series, "No EventSeries in the @graph");

    const schedule = series.eventSchedule;
    assert.ok(schedule, "EventSeries has no eventSchedule");
    assert.equal(schedule.byDay, `https://schema.org/${siteFacts.meetingRule.weekday}`);
    assert.equal(
      schedule.byMonthWeek,
      siteFacts.meetingRule.weekOfMonth,
      "The nth-weekday rule must be published as byMonthWeek, a real schema.org property",
    );

    const months = {
      January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
      July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
    };
    for (const month of siteFacts.meetingRule.exceptMonths) {
      assert.ok(
        !schedule.byMonth.includes(months[month]),
        `${month} is an exception month but appears in byMonth`,
      );
    }
  });
});

// ── Derived meeting dates ──────────────────────────────────────────────

describe("GEO - the next meeting is a real future meeting", () => {
  // A crawler will not run JS to work the date out, so the dates have to be in
  // the static HTML. That means a stale build publishes a meeting in the past.
  // The weekly cron in deploy.yml is what prevents it; this is the check that
  // notices if the cron ever stops working.
  it("is a future date matching the stored rule", () => {
    const graph = jsonLdOf(readRoute(ROUTES[0]));
    const events = graph["@graph"].filter((node) => node["@type"] === "Event");
    assert.ok(events.length > 0, "No concrete Event in the @graph");

    const { weekOfMonth, weekday, exceptMonths } = siteFacts.meetingRule;
    const weekdayNames = [
      "Sunday", "Monday", "Tuesday", "Wednesday",
      "Thursday", "Friday", "Saturday",
    ];
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    for (const event of events) {
      const start = new Date(event.startDate);
      assert.ok(!Number.isNaN(start.valueOf()), `Unparseable startDate ${event.startDate}`);

      // Read the wall-clock parts back out of the ISO string rather than the
      // Date, so the assertion is about the published local date and not about
      // the timezone this test happens to run in.
      const [year, month, day] = event.startDate.slice(0, 10).split("-").map(Number);
      const local = new Date(Date.UTC(year, month - 1, day));

      assert.equal(
        weekdayNames[local.getUTCDay()],
        weekday,
        `${event.startDate} is not a ${weekday}`,
      );
      assert.equal(
        Math.floor((day - 1) / 7) + 1,
        weekOfMonth,
        `${event.startDate} is not the ${weekOfMonth}th ${weekday} of the month`,
      );
      assert.ok(
        !exceptMonths.includes(monthNames[month - 1]),
        `${event.startDate} falls in ${monthNames[month - 1]}, an exception month`,
      );
      assert.ok(
        !(siteFacts.meetingExceptions ?? []).includes(event.startDate.slice(0, 10)),
        `${event.startDate} is listed as cancelled`,
      );
    }

    const soonest = events
      .map((event) => new Date(event.startDate))
      .sort((a, b) => a - b)[0];
    assert.ok(
      soonest.valueOf() > Date.now(),
      `The next published meeting, ${soonest.toISOString()}, is in the past - rebuild the site`,
    );
  });
});

// ── Crawler-facing files ───────────────────────────────────────────────

describe("GEO - robots.txt", () => {
  const robotsPath = path.join(distDir, "robots.txt");

  it("ships with a Sitemap line and the agreed Content-Signal", () => {
    assert.ok(fs.existsSync(robotsPath), "dist/robots.txt not found");
    const robots = fs.readFileSync(robotsPath, "utf-8");

    assert.match(robots, /^Sitemap:\s*https:\/\/bbcc\.scot\/sitemap-index\.xml$/m);

    // Decision 3: this is public-interest information published by a statutory
    // body, and training inclusion is the only mechanism by which an assistant
    // knows BBCC exists without being handed the URL.
    assert.match(robots, /^Content-Signal:\s*search=yes,\s*ai-input=yes,\s*ai-train=yes$/m);
    assert.ok(
      !/^Disallow:\s*\/\s*$/m.test(robots),
      "robots.txt must not disallow the whole site",
    );
  });
});

// ── The calendar feed ──────────────────────────────────────────────────
//
// A calendar is the one artefact here that keeps being consulted after the
// person stops looking at the site, which makes a silent fault in it worse
// than a silent fault anywhere else: a subscriber turns up on the wrong day
// and never learns why. So this checks the file parses, that the dates are
// the same ones the page is publishing, and that the offsets are right for
// British Summer Time rather than fixed at Greenwich.

describe("Meetings - the calendar feed", () => {
  const icsPath = path.join(distDir, "meetings.ics");
  const ics = () => fs.readFileSync(icsPath, "utf-8");

  /** Unfold first: RFC 5545 continuations start with a space. */
  const unfolded = () => ics().replace(/\r\n[ \t]/g, "");
  const valuesOf = (key) =>
    unfolded()
      .split("\r\n")
      .filter((line) => line.startsWith(`${key}:`))
      .map((line) => line.slice(key.length + 1));

  it("is generated and well formed", () => {
    assert.ok(fs.existsSync(icsPath), "dist/meetings.ics not found");
    const raw = ics();

    assert.match(raw, /^BEGIN:VCALENDAR\r\n/);
    assert.match(raw, /\r\nEND:VCALENDAR\r\n$/);
    // Every line CRLF-terminated, and none over the 75-octet limit. Both are
    // things strict clients reject outright.
    const lines = raw.split("\r\n").slice(0, -1);
    assert.ok(!raw.split("\r\n").some((l) => l.includes("\n")), "a bare LF slipped in");
    for (const line of lines) {
      assert.ok(
        new TextEncoder().encode(line).length <= 75,
        `line exceeds 75 octets: ${line.slice(0, 40)}...`,
      );
    }
    assert.equal(
      valuesOf("BEGIN").filter((v) => v === "VEVENT").length,
      valuesOf("END").filter((v) => v === "VEVENT").length,
      "unbalanced VEVENT blocks",
    );
  });

  it("publishes the venue, the contact page and a stable id per meeting", () => {
    const raw = unfolded();
    assert.ok(raw.includes(siteFacts.venue.postalCode), "the venue postcode is missing");
    assert.match(raw, /^X-WR-CALNAME:/m);
    // Without stable UIDs a re-import duplicates every event instead of
    // updating it, which is how a subscriber ends up with two of everything.
    const uids = valuesOf("UID");
    assert.ok(uids.length > 0, "no events");
    assert.equal(new Set(uids).size, uids.length, "duplicate UIDs");
    for (const uid of uids) assert.match(uid, /^meeting-\d{4}-\d{2}-\d{2}@bbcc\.scot$/);
  });

  it("starts with the same meeting the homepage is advertising", () => {
    const pageDate = readRoute(ROUTES[0]).match(/<time datetime="(\d{4}-\d{2}-\d{2})"/);
    assert.ok(pageDate, "the homepage names no next meeting");
    assert.match(valuesOf("UID")[0], new RegExp(`^meeting-${pageDate[1]}@`));
  });

  it("puts every meeting in the future, in order, on the rule's weekday", () => {
    const starts = valuesOf("DTSTART").map(icsToDate);
    assert.ok(starts.length >= 2, "a calendar worth subscribing to needs more than one date");
    assert.ok(starts[0] > new Date(), "the first event has already happened");

    for (let i = 1; i < starts.length; i++) {
      assert.ok(starts[i] > starts[i - 1], "events are not in chronological order");
    }
    for (const start of starts) {
      const weekday = new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        timeZone: "Europe/London",
      }).format(start);
      assert.equal(weekday, siteFacts.meetingRule.weekday);
    }
  });

  it("keeps the wall-clock time across the DST boundary", () => {
    // The whole reason DTSTART is in UTC: a fixed offset would move the
    // meeting by an hour every spring. Read each start back in London and
    // it must be the same clock time all year.
    const expected = siteFacts.meetingRule.startTime;
    for (const start of valuesOf("DTSTART").map(icsToDate)) {
      const local = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "Europe/London",
      }).format(start);
      assert.equal(local, expected, `${start.toISOString()} is not ${expected} in London`);
    }

    // And the file has to actually span a clock change, or the assertion
    // above proves nothing.
    const offsets = new Set(
      valuesOf("DTSTART").map((v) => icsToDate(v).getUTCHours()),
    );
    assert.ok(offsets.size > 1, "the horizon does not cross a DST boundary");
  });

  it("excludes the months the council does not meet", () => {
    const skipped = new Set(siteFacts.meetingRule.exceptMonths);
    for (const start of valuesOf("DTSTART").map(icsToDate)) {
      const month = new Intl.DateTimeFormat("en-GB", {
        month: "long",
        timeZone: "Europe/London",
      }).format(start);
      assert.ok(!skipped.has(month), `${month} is an excepted month but has a meeting`);
    }
  });

  it("is offered on both pages, and survives holding mode", async () => {
    for (const route of ROUTES) {
      const html = readRoute(route);
      assert.match(html, /href="\/meetings\.ics"/, `${route.url} does not offer the calendar`);
      assert.match(
        html,
        /href="webcal:\/\/bbcc\.scot\/meetings\.ics"/,
        `${route.url} offers no way to subscribe`,
      );
    }
    // The holding page advertises it, so the worker has to serve it while the
    // site is still in holding mode or the link 503s.
    const res = await call("https://bbcc.scot/meetings.ics", "holding");
    assert.equal(res.status, 200);
  });
});

describe("GEO - llms.txt", () => {
  const llmsPath = path.join(distDir, "llms.txt");

  it("is generated with the council's name and durable facts", () => {
    assert.ok(fs.existsSync(llmsPath), "dist/llms.txt not found");
    const llms = fs.readFileSync(llmsPath, "utf-8");

    assert.match(llms, new RegExp(`^# ${siteFacts.legalName.replace(/&/g, "&")}$`, "m"));
    assert.ok(llms.includes(siteFacts.contactEmail));
    assert.ok(llms.includes(siteFacts.venue.postalCode));
    assert.ok(llms.includes(siteFacts.areaPartnership.name));
  });

  it("names the predecessor site as superseded", () => {
    const llms = fs.readFileSync(llmsPath, "utf-8");
    if (!siteFacts.predecessorSite) return;
    assert.ok(
      llms.includes(siteFacts.predecessorSite),
      "llms.txt should say which site this one replaces",
    );
  });

  it("has no dead link", () => {
    const llms = fs.readFileSync(llmsPath, "utf-8");
    const urls = [...new Set(llms.match(/https?:\/\/[^\s)\]]+/g) ?? [])];
    assert.ok(urls.length > 0, "llms.txt lists no URLs at all");

    // Normalised through URL so a missing trailing slash in the content file
    // is not read as a different site.
    const known = new Set(
      [...siteFacts.socialProfiles, siteFacts.predecessorSite]
        .filter(Boolean)
        .map((url) => new URL(url).href),
    );
    const home = readRoute(ROUTES[0]);

    for (const raw of urls) {
      const url = new URL(raw.replace(/[.,]$/, ""));

      if (url.origin !== SITE) {
        // Off-site links are pinned against the content collection instead of
        // fetched, so the gate stays offline and deterministic.
        assert.ok(known.has(url.href), `llms.txt links to an unexpected site: ${url.href}`);
        continue;
      }

      const target =
        url.pathname === "/"
          ? path.join(distDir, "index.html")
          : path.join(distDir, url.pathname, "index.html");
      assert.ok(fs.existsSync(target), `llms.txt links to ${url.pathname}, which is not built`);

      if (url.hash) {
        const id = url.hash.slice(1);
        assert.match(
          home,
          new RegExp(`id=["']${id}["']`),
          `llms.txt links to #${id}, which is not an anchor on the page`,
        );
      }
    }
  });
});

describe("GEO - sitemap", () => {
  it("offers one URL per page, excluding /admin and /holding/", () => {
    const xml = fs.readFileSync(path.join(distDir, "sitemap-0.xml"), "utf-8");
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

    assert.ok(locs.includes(`${SITE}/`), "The homepage is missing from the sitemap");
    assert.ok(
      !locs.some((loc) => loc.includes("/admin")),
      "The CMS should not be in the sitemap",
    );
    assert.ok(
      !locs.some((loc) => loc.includes("/holding")),
      "/holding/ is served at / by the worker; listing both offers two URLs for one page",
    );
    assert.equal(new Set(locs).size, locs.length, "The sitemap lists a URL twice");
  });
});

// ── The worker in front of the assets ──────────────────────────────────

describe("SEO - worker routing", () => {
  // Both of these are invisible from dist/ and easy to undo without noticing.

  it("301s www to the apex, preserving the path and query", async () => {
    const response = await call("https://www.bbcc.scot/some/page?ref=x", "live");
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://bbcc.scot/some/page?ref=x");
  });

  it("leaves the apex alone", async () => {
    const response = await call("https://bbcc.scot/", "live");
    assert.equal(response.status, 200);
  });

  it("serves the crawler files in holding mode", async () => {
    // A robots.txt behind a 503 is the same as no robots.txt, and holding mode
    // is exactly when the site most needs to be legible to crawlers.
    for (const path of ["/robots.txt", "/sitemap-index.xml", "/sitemap-0.xml", "/llms.txt"]) {
      const response = await call(`https://bbcc.scot${path}`, "holding");
      assert.equal(response.status, 200, `${path} should pass through in holding mode`);
      assert.equal(response.headers.get("x-url"), path);
    }
  });

  it("still 503s an ordinary path in holding mode", async () => {
    const response = await call("https://bbcc.scot/projects", "holding");
    assert.equal(response.status, 503);
  });
});

// ── The live social accounts ───────────────────────────────────────────

describe("SEO - social profiles", () => {
  // tests/instagram-feed.test.ts deliberately uses fixture URLs, so this is
  // the only place the URLs the live site publishes are pinned. The repo used
  // to link facebook.com/bbccglasgow, which is not a page (#37).
  it("are the accounts in the entity map, rendered on the homepage", () => {
    const home = readRoute(ROUTES[0]);

    assert.deepEqual(siteFacts.socialProfiles.slice().sort(), [
      "https://www.facebook.com/glasgowbbcc",
      "https://www.instagram.com/bbccglasgow",
    ]);

    for (const url of siteFacts.socialProfiles) {
      assert.ok(home.includes(url), `${url} is not linked from the homepage`);
    }
    assert.ok(
      !home.includes("facebook.com/bbccglasgow"),
      "facebook.com/bbccglasgow does not exist",
    );
    assert.ok(!home.includes(DISOWNED_PROFILE), `The site should not link ${DISOWNED_PROFILE}`);
  });
});
