/**
 * The one call-to-action model, shared by every button on the site.
 *
 * Before this, each section invented its own: `{label,url}` here, a bare
 * `ctaLabel` with the address hardcoded in the template there, and the same
 * Instagram link rendered with `target="_blank"` in one component and without
 * it in another. Nothing was wrong in isolation; the inconsistency was only
 * visible by reading all eleven render sites at once.
 *
 * A CTA has a label and a destination. The destination is one of four kinds,
 * and the kind is what decides whether the CMS shows a URL box, a file picker
 * or nothing at all. Two of the kinds hold no address: they name a fact that
 * already exists in the site content, so the contact address and the social
 * profiles stay in exactly one place each.
 *
 * The schema is a factory rather than a value because Zod reaches this file by
 * two routes. Astro passes the `z` from `astro:content`; the tests pass the one
 * they resolve through Astro's own module path. They are the same module, so
 * the schema is defined once and both callers get it.
 */

// Extension included, unlike the rest of src/lib, because the tests import this
// file directly under Node's type stripping and Node does not guess extensions.
// That import is the point of the factory below, so the specifier bends to it.
import { FACEBOOK_HOST, INSTAGRAM_HOST, socialProfileUrl } from "./social.ts";

/** Icons an editor may attach to a CTA. Artwork lives in CtaLink.astro. */
export const CTA_ICONS = [
  "arrow-right",
  "external",
  "mail",
  "calendar",
  "map-pin",
  "download",
  "document",
] as const;
export type CtaIcon = (typeof CTA_ICONS)[number];

/** Profiles a `social` CTA can point at, matched against site.socialProfiles. */
export const SOCIAL_PLATFORMS = ["instagram", "facebook"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/**
 * Which host each platform lives on. The lookup itself is social.ts's job,
 * which already handles www prefixes and subdomains and is what the JSON-LD
 * and llms.txt go through.
 */
const SOCIAL_HOSTS: Record<SocialPlatform, string> = {
  instagram: INSTAGRAM_HOST,
  facebook: FACEBOOK_HOST,
};

export const CTA_TYPES = ["link", "document", "contact", "social"] as const;
export type CtaType = (typeof CTA_TYPES)[number];

/**
 * Build the CTA schema against a Zod instance.
 *
 * `newTab` is optional everywhere rather than defaulted here, so that "the
 * editor said nothing" stays distinguishable from "the editor said no" and the
 * per-kind default in `opensInNewTab` can apply.
 */
export function ctaSchema(z: any) {
  const common = {
    label: z.string().min(1),
    icon: z.enum(CTA_ICONS).optional(),
    newTab: z.boolean().optional(),
  };

  // Strict, so a field belonging to another kind is an error rather than
  // silently dropped. Changing a button's kind by hand and leaving the old
  // address behind should fail the build, not produce a link that ignores it.
  return z.discriminatedUnion("type", [
    // Anything addressable: an in-page anchor, another page, a mailto, or an
    // external site. Free text, because those four cannot share a pattern.
    z.object({ ...common, type: z.literal("link"), url: z.string().min(1) }).strict(),

    // A file uploaded through the CMS into public/documents. Stored as the
    // public path (/documents/x.pdf), which is what the browser asks for.
    z.object({ ...common, type: z.literal("document"), file: z.string().min(1) }).strict(),

    // No address: resolves to site.contactEmail. An optional subject prefills
    // the mail client, which is the only reason the newsletter button differed
    // from the four project buttons that pointed at the same inbox.
    z
      .object({ ...common, type: z.literal("contact"), subject: z.string().optional() })
      .strict(),

    // No address: resolves against site.socialProfiles, so the profile URLs
    // stay a single fact rather than being retyped per button.
    z
      .object({ ...common, type: z.literal("social"), platform: z.enum(SOCIAL_PLATFORMS) })
      .strict(),
  ]);
}

export type Cta =
  | { type: "link"; label: string; url: string; icon?: CtaIcon; newTab?: boolean }
  | { type: "document"; label: string; file: string; icon?: CtaIcon; newTab?: boolean }
  | { type: "contact"; label: string; subject?: string; icon?: CtaIcon; newTab?: boolean }
  | {
      type: "social";
      label: string;
      platform: SocialPlatform;
      icon?: CtaIcon;
      newTab?: boolean;
    };

/** The facts a CTA may point at without holding an address of its own. */
export interface CtaSiteFacts {
  contactEmail: string;
  socialProfiles: string[];
}

export interface ResolvedCta {
  href: string;
  label: string;
  newTab: boolean;
  icon?: CtaIcon;
  /** Set only for documents: the public path, for reading size off disk. */
  documentPath?: string;
}

/** True when a URL leaves this site. */
export function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Whether a CTA opens in a new tab.
 *
 * The editor's choice wins. The default when they have not made one is the
 * conventional behaviour for that kind of destination: staying put for
 * anything on this site or in a mail client, opening away for a document or
 * somebody else's site. An editor who never finds the toggle still gets links
 * that behave the way readers expect.
 */
export function opensInNewTab(cta: Cta): boolean {
  if (typeof cta.newTab === "boolean") return cta.newTab;
  switch (cta.type) {
    case "document":
    case "social":
      return true;
    case "contact":
      return false;
    case "link":
      return isExternal(cta.url);
  }
}

/**
 * Turn a CTA into the values a link needs, or null when its destination does
 * not exist.
 *
 * Null is not an error. A social button whose profile the council does not
 * have is dropped rather than rendered pointing nowhere, which is the rule
 * already applied to the Follow Us buttons and the JAG neighbour cards.
 */
export function resolveCta(cta: Cta, facts: CtaSiteFacts): ResolvedCta | null {
  const shared = { label: cta.label, icon: cta.icon, newTab: opensInNewTab(cta) };

  switch (cta.type) {
    case "link":
      return { ...shared, href: cta.url };

    case "document":
      return { ...shared, href: cta.file, documentPath: cta.file };

    case "contact": {
      const query = cta.subject ? `?subject=${encodeURIComponent(cta.subject)}` : "";
      return { ...shared, href: `mailto:${facts.contactEmail}${query}` };
    }

    case "social": {
      const url = socialProfileUrl(facts.socialProfiles, SOCIAL_HOSTS[cta.platform]);
      return url ? { ...shared, href: url } : null;
    }
  }
}

/**
 * Wrap an address the code already holds as a CTA.
 *
 * The calendar buttons are generated in src/lib/calendar.ts rather than edited,
 * so they never travel through the schema, but they are links to Google and
 * Outlook and need the same new-tab and noopener handling as any other outbound
 * button. Without this they were the last bare anchors on the page.
 */
export function linkCta(href: string, label: string, icon?: CtaIcon): ResolvedCta {
  return { href, label, icon, newTab: isExternal(href) };
}

/** Resolve a list of CTAs, dropping the ones with no destination. */
export function resolveCtas(ctas: Cta[] | undefined, facts: CtaSiteFacts): ResolvedCta[] {
  return (ctas ?? [])
    .map((cta) => resolveCta(cta, facts))
    .filter((cta): cta is ResolvedCta => cta !== null);
}
