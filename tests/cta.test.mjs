import { describe, it } from "node:test";
import assert from "node:assert";
import {
  CTA_ICONS,
  isExternal,
  linkCta,
  opensInNewTab,
  resolveCta,
  resolveCtas,
} from "../src/lib/cta.ts";

// The two facts a CTA may name instead of holding. Deliberately not read from
// src/content/site/index.json: what these tests check is the resolution rule,
// and reading the real file would make them fail when the council changes its
// address rather than when the rule breaks.
const facts = {
  contactEmail: "info@example.org",
  socialProfiles: [
    "https://www.instagram.com/glasgowbbcc",
    "https://www.facebook.com/glasgowbbcc",
  ],
};

describe("CTA destinations", () => {
  it("should keep a link's url as written", () => {
    const cta = resolveCta({ type: "link", label: "Our Area", url: "#our-area" }, facts);
    assert.strictEqual(cta.href, "#our-area");
  });

  it("should point a document at its public path", () => {
    const cta = resolveCta(
      { type: "document", label: "Read the plan", file: "/documents/plan.pdf" },
      facts,
    );
    assert.strictEqual(cta.href, "/documents/plan.pdf");
    assert.strictEqual(cta.documentPath, "/documents/plan.pdf");
  });

  it("should build a contact href from the site address", () => {
    const cta = resolveCta({ type: "contact", label: "Email us" }, facts);
    assert.strictEqual(cta.href, "mailto:info@example.org");
  });

  it("should append an encoded subject when one is given", () => {
    const cta = resolveCta(
      { type: "contact", label: "Subscribe", subject: "Subscribe to BBCC updates" },
      facts,
    );
    assert.strictEqual(
      cta.href,
      "mailto:info@example.org?subject=Subscribe%20to%20BBCC%20updates",
    );
  });

  it("should find each social platform in the site's profile list", () => {
    const ig = resolveCta({ type: "social", label: "Instagram", platform: "instagram" }, facts);
    const fb = resolveCta({ type: "social", label: "Facebook", platform: "facebook" }, facts);
    assert.strictEqual(ig.href, "https://www.instagram.com/glasgowbbcc");
    assert.strictEqual(fb.href, "https://www.facebook.com/glasgowbbcc");
  });

  // A button pointing at a profile the council does not have is worse than no
  // button. This is the same rule the JAG cards follow for unconfirmed URLs.
  it("should resolve to nothing when the platform is not in the profile list", () => {
    const cta = resolveCta(
      { type: "social", label: "Facebook", platform: "facebook" },
      { ...facts, socialProfiles: ["https://www.instagram.com/glasgowbbcc"] },
    );
    assert.strictEqual(cta, null);
  });

  it("should drop unresolvable ctas from a list rather than the whole list", () => {
    const resolved = resolveCtas(
      [
        { type: "social", label: "Instagram", platform: "instagram" },
        { type: "social", label: "Facebook", platform: "facebook" },
      ],
      { ...facts, socialProfiles: ["https://www.instagram.com/glasgowbbcc"] },
    );
    assert.strictEqual(resolved.length, 1);
    assert.strictEqual(resolved[0].label, "Instagram");
  });

  it("should treat a missing list as an empty one", () => {
    assert.deepStrictEqual(resolveCtas(undefined, facts), []);
  });

  it("should carry the label and icon through untouched", () => {
    const cta = resolveCta({ type: "contact", label: "Email us", icon: "mail" }, facts);
    assert.strictEqual(cta.label, "Email us");
    assert.strictEqual(cta.icon, "mail");
    assert.ok(CTA_ICONS.includes(cta.icon));
  });
});

describe("CTA new-tab behaviour", () => {
  it("should keep in-site links in the same tab", () => {
    assert.strictEqual(opensInNewTab({ type: "link", label: "x", url: "#meetings" }), false);
    assert.strictEqual(opensInNewTab({ type: "link", label: "x", url: "/holding" }), false);
  });

  it("should send links to other sites to a new tab", () => {
    assert.strictEqual(
      opensInNewTab({ type: "link", label: "x", url: "https://glasgow.gov.uk/" }),
      true,
    );
  });

  it("should default documents and social profiles to a new tab", () => {
    assert.strictEqual(
      opensInNewTab({ type: "document", label: "x", file: "/documents/a.pdf" }),
      true,
    );
    assert.strictEqual(
      opensInNewTab({ type: "social", label: "x", platform: "instagram" }),
      true,
    );
  });

  // A mailto hands off to the mail client; a blank tab left behind is litter.
  it("should keep contact ctas in the same tab", () => {
    assert.strictEqual(opensInNewTab({ type: "contact", label: "x" }), false);
  });

  it("should let the editor override the default in both directions", () => {
    assert.strictEqual(
      opensInNewTab({ type: "link", label: "x", url: "#meetings", newTab: true }),
      true,
    );
    assert.strictEqual(
      opensInNewTab({ type: "document", label: "x", file: "/a.pdf", newTab: false }),
      false,
    );
  });

  it("should recognise only http and https as leaving the site", () => {
    assert.ok(isExternal("https://example.org"));
    assert.ok(isExternal("HTTP://example.org"));
    assert.ok(!isExternal("mailto:info@example.org"));
    assert.ok(!isExternal("/documents/a.pdf"));
    assert.ok(!isExternal("#meetings"));
  });
});

describe("CTAs built in code", () => {
  // The calendar buttons never travel through the schema, so this is the only
  // thing standing between them and the bare anchors they used to be.
  it("should give a generated outbound link the same new-tab handling", () => {
    const cta = linkCta("https://calendar.google.com/render", "Google Calendar");
    assert.strictEqual(cta.newTab, true);
    assert.strictEqual(cta.label, "Google Calendar");
  });

  it("should leave a generated in-site link in the same tab", () => {
    assert.strictEqual(linkCta("/meetings.ics", "Download .ics").newTab, false);
  });
});
