// One source for the council's social profiles (#37).
//
// `socialProfiles` in the site content is the list of accounts the council
// currently runs. It drives the visible follow buttons, the JSON-LD `sameAs`
// and llms.txt, so a link cannot go stale in one place while staying right in
// another - which is exactly how the homepage ended up pointing at a Facebook
// page that does not exist.
//
// Absence matters here too. An account the council has handed over is left out
// of the list on purpose: `sameAs` can only assert that a profile *is* ours,
// there is no markup for disowning one, so the only way to stop binding the
// domain to an old handle is to publish nothing about it.

/** Return the first profile URL served by `host`, or undefined. */
export function socialProfileUrl(profiles: string[], host: string): string | undefined {
  return profiles.find((url) => {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      return hostname === host || hostname.endsWith(`.${host}`);
    } catch {
      return false;
    }
  });
}

export const INSTAGRAM_HOST = "instagram.com";
export const FACEBOOK_HOST = "facebook.com";
