# bbcc-website

Public website of **Blythswood & Broomielaw Community Council** (BBCC), the statutory community
council for Glasgow's city centre between the M8 and Renfield Street.

Design: the settled **Vibrant Poppy** direction (concept v9), ported from
`website-concepts/v9-vibrant-poppy.html`. Stack and delivery mirror
[weebuilts](https://github.com/gkanitz/weebuilts), which served as the deployment rehearsal for
this site.

### The share card

The concept covers the page. It does not cover what the site looks like when somebody pastes a
link into WhatsApp or Slack, so `public/images/og-card.png` extends the direction to a 1200x630
share card: a split composition with the council's full name on the left and a brand-pink panel
carrying the logo and `bbcc.scot` on the right (#37).

Two departures from the concept are deliberate:

- **The left half is a flat ink panel, not a photograph.** It is meant to hold the coned Duke of
  Wellington from Flickr user [mym](https://www.flickr.com/photos/mymuk). The source is portrait
  1067x1600, which fills the left half at full height without a crop. mym has granted permission
  on the condition that the page carries a credit linking to their profile, and the site owes
  them that credit wherever the photo appears. Two things still stand between the panel and the
  photo: the file is not in the repository, and a share card is the one place the condition
  cannot be met, because Slack and WhatsApp render the image away from the page that carries the
  credit. The hero use is settled; the card needs mym asked the narrower question. The panel is
  the right shape for the photo, so it drops in by replacing one function in
  `scripts/build-og-card.mjs` and nothing else changes.
- **The card is drawn in Georgia and Helvetica, not Fraunces and Inter.** `sharp` renders the SVG
  through librsvg, which resolves fonts against the system rather than against
  `node_modules`. Rather than ship a font-loading dance for one image, the card uses a serif and a
  sans that sit close to the pairing. A share card is seen at thumbnail size, away from the site,
  and pinning the output to a committed PNG is worth more than an exact type match.

Run `node scripts/build-og-card.mjs` to regenerate it. The PNG is committed rather than built, so
the URL is stable and unhashed and CI never has to reproduce font rendering.

## Stack

- **Astro 5** (+ Sharp via `astro:assets` for build-time image optimisation) — static output, no
  client-side framework; a small vanilla script drives the
  scroll-reveal, stat counters and scroll-spy (all disabled under `prefers-reduced-motion`).
- **Tailwind 4** (via `@tailwindcss/vite`) + **DaisyUI 5** for component classes.
- **Self-hosted fonts** (Fraunces + Inter variable, via Fontsource). No external requests at
  runtime; no analytics or tracking of any kind.
- **Cloudflare Workers static assets** (`wrangler.jsonc`), served at **https://bbcc.scot**
  (apex + www as Workers custom domains; the apex is canonical and `worker.js` 301s www to it).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local dev server |
| `pnpm build` | Static build to `dist/` |
| `pnpm gate` | Every step in `gate.d/`, in filename order: build → sitemap → link integrity → axe a11y (zero violations) → Lighthouse budgets (perf ≥95, a11y =100, bp ≥95, seo ≥95) → SEO/GEO invariants |

Adding a check to CI is one new `gate.d/NN-name.sh`; `gate.sh` and `.github/workflows/ci.yml`
need no edit.

## Release boundary

Every push to `main` (every merged PR, including Decap CMS publishes) deploys to production
automatically. Manually dispatching the deploy workflow redeploys current `main` as a
fallback/redeploy path. A concurrency group serialises back-to-back merges so the newest commit
is always the one live. Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository
secrets.

## Feed bot setup

The `instagram-feed` workflow fetches the six most recent posts from the council's
Instagram account every day at 06:00 UTC (and on manual dispatch from the Actions tab).
It downloads each post image into `src/assets/instagram/`, writes
`src/data/instagram/posts.json`, prunes images whose post is no longer in the latest
six, and commits the feed when it changed with message `chore(instagram): update feed
[skip ci]` (the `[skip ci]` avoids a redundant redeploy; deploy.yml publishes the commit
via the normal push-to-main trigger). After the commit step, the workflow refreshes the
long-lived token and writes the new value back to the `IG_ACCESS_TOKEN` secret, so the
token never needs manual rotation while the feed keeps running. Two repository secrets
are required:

| Secret | Purpose |
| --- | --- |
| `IG_ACCESS_TOKEN` | Long-lived Instagram Graph API token (read-only feed access) for `https://graph.facebook.com/v19.0/me/media`. To generate one, obtain a short-lived token from the Meta Graph API Explorer or your app's login flow, then exchange it at `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=ig_exchange_token&access_token=<short-lived token>` and store the returned `access_token` value. The long-lived token expires after roughly 60 days; the workflow auto-refreshes it after every successful fetch run. |
| `SECRETS_WRITE_PAT` | Fine-grained PAT scoped to this repository only, with `contents: write` (to push the feed commit) and `secrets: write` (to update `IG_ACCESS_TOKEN` after each refresh). The default `GITHUB_TOKEN` is read-only for schedule events and cannot push to `main` or write secrets. |

Feed commits are authored as `github-actions[bot]`. On forks or pull-request previews
where the secrets are absent, the fetch step logs "IG_ACCESS_TOKEN not set - skipping
feed fetch" and exits 0, so `pnpm build` still succeeds with whatever `posts.json` is
committed; the token-refresh step skips for the same reason.

### If the token-refresh step fails

A red `Refresh Instagram token` step logs `Token refresh failed - MANUAL INTERVENTION REQUIRED`
and fails the run (exit 1); the feed commit from the same run is not rolled back. To recover:

1. Generate a fresh short-lived token (Meta Graph API Explorer or your app's login flow).
2. Exchange it for a long-lived token at
   `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=ig_exchange_token&access_token=<short-lived token>`
   and copy the returned `access_token` value.
3. Update the `IG_ACCESS_TOKEN` secret in the repository (Settings > Secrets and
   variables > Actions) with the new value.
4. Re-run the workflow from the Actions tab (Workflow dispatch) and confirm it goes green.

## Site mode: holding page vs live site

A small Worker (`worker.js`, `run_worker_first`) gates the static assets on the `SITE_MODE`
variable in `wrangler.jsonc`:

- **`holding`** (current): every route serves `src/pages/holding.astro` — the branded holding
  page, which carries the council's facts as plain prose and the same structured data as the
  homepage. Nothing under development is publicly reachable (only hashed `/_astro/` assets,
  `/images/`, `/admin` and the crawler files pass through). `/` returns 200; all other paths
  return 503 so crawlers don't index half-built URLs.

  `/robots.txt`, `/sitemap-index.xml`, `/sitemap-0.xml` and `/llms.txt` are in the passthrough
  because a policy file behind a 503 is the same as no policy file, and holding mode is exactly
  when the site needs to be legible to crawlers. The `/holding/` URL itself is noindexed and kept
  out of the sitemap: the worker serves that content at `/`, so `/` is the URL that should be
  found, and nothing needs unwinding at launch.
- **`live`**: all requests pass straight through to the built site.

**To go live** (or to switch back): change `SITE_MODE` in `wrangler.jsonc` in a one-line PR, then
merge it (the merge deploys). **For an instant emergency maintenance switch**: edit the `SITE_MODE`
variable in the Cloudflare dashboard (Workers → bbcc-website → Settings → Variables) — takes
effect in seconds, but note the next deploy resets it to the wrangler.jsonc value, which is the
source of truth.

## Decap CMS / DecapBridge

Content editors log in at `/admin` and authenticate through DecapBridge (PKCE flow). The
DecapBridge dashboard holds the GitHub fine-grained PAT (contents + pull-requests scoped to
`bbcc-glasgow/website` only). **The PAT value is never stored in this repository or in any
repository secret**; only the site ID (`648cbae2-8402-4cde-ade9-014199b3e953`) appears in
`public/admin/config.yml`, which is not a secret.

## Editing the site (volunteers)

Volunteers do **not** need a GitHub account or GitHub collaborator access to edit the site.
Content is managed through Decap CMS (the login screen at `/admin`) and authenticated via
DecapBridge, which issues a PR behind the scenes.

### Step-by-step walkthrough

1. **Go to `/admin`** — open `https://bbcc.scot/admin` (or your local dev server at
   `http://localhost:4321/admin`). You see the Decap CMS login screen.

2. **Log in with your invite** — click "Login with DecapBridge". The screen offers **Password**
   (the one you set when you accepted the invite), **Google**, or **Microsoft**. Pick whichever
   method matches the email address the invite was sent to. No GitHub credentials are needed at any
   point.

3. **Find the entry you want to edit** — the sidebar lists the available collections. For example,
   click **"Site Settings"** to open `src/content/site/index.json`, then scroll to the **Statistics**
   section to update a date, a contact email, or a boundary description. (The exact fields vary by
   collection — see the full list below.)

4. **Save and let automation handle the rest** — click **"Save"**, then **"Publish"** (editorial
   workflow). DecapCMS opens a pull request on GitHub against `main` with your changes. The CI
   gates (link integrity, a11y, Lighthouse budgets) run automatically. A maintainer reviews the PR
   and merges it; the merge deploys to production automatically and your change goes live at
   https://bbcc.scot.

### Inviting a new volunteer

Send the volunteer an email invite from the DecapBridge dashboard:

1. Go to https://decapbridge.com and log in as a site owner.
2. Select the **bbcc-website** site.
3. Navigate to **Collaborators** → **Invite by email**.
4. Enter the volunteer's email address and click send.

The volunteer receives an email with a link to set a password (or to use Google/Microsoft
authentication). Once they accept, they can log in at `/admin` and start editing — no GitHub
account required.

### How the credentials are secured

The GitHub fine-grained PAT that DecapBridge uses to open PRs lives in the DecapBridge dashboard
(settings for the bbcc-website site), scoped to `bbcc-glasgow/website` only. **The token value is
never committed to this repository.** The repository stores only the site UUID in
`public/admin/config.yml`, which is an identifier, not a secret.

> **Screenshots** — detailed screenshots of the login flow, the editor interface, and the
> DecapBridge invite screen will be added after the first real volunteer login confirms the exact
> user-facing UI.

## Verify before first release

The seed content is ported from the concept page. Project cards draw their title, summary and
calls-to-action from `src/content/projects/*.json`; site-level data (stats, boundary description,
contact email) lives in `src/content/site/index.json`. Items below are placeholders or unverified
claims deliberately left for the owner to confirm — **each should be resolved via an issue before
the first release**:

- [x] **Meeting card**: resolved in #37. The rule (third Tuesday, except July, August and
      December) and the venue live in `src/content/site/index.json`; the dates are computed at
      build time by `src/lib/meetings.ts` and a weekly cron rebuilds so "next meeting" is never
      in the past. One-off cancellations go in `meetingExceptions` as `YYYY-MM-DD`.
- [ ] **Stats strip**: "200,000+ daily visitors" and "~30 lanes & closes" need a source or
      revised wording; "1820s Blythswood grid" and "UNESCO City of Music" are on solid ground.
      Values and wording are in `src/content/site/index.json` (same file holds the boundary
      description).
- [ ] **Survey card**: "Start survey" currently has no survey behind it — link a real survey or
      remove the card.
- [ ] **JAG cards**: "Visit council →" links are placeholders — add the neighbouring councils'
      real sites (or remove the link affordance).
- [ ] **Instagram feed activation**: the section is built (epic #47; the accounts are
      `instagram.com/bbccglasgow` and `facebook.com/glasgowbbcc` — the Facebook handle is *not*
      `bbccglasgow`, which is not a page, see #37) and renders the shell until real posts are
      committed. To activate: switch the Instagram account to Business/Creator, link the
      Facebook Page, create a Meta app with a long-lived Graph API token, and add the
      `IG_ACCESS_TOKEN` and `SECRETS_WRITE_PAT` repo secrets — the daily workflow then keeps
      the feed current and the token refreshed.
- [ ] **Footer social icons**: the concept's footer Instagram/Facebook icons were not ported
      with the section; add them now that the account URLs are confirmed.
- [ ] **Newsletter**: currently an honest mailto (contact email in `src/content/site/index.json`).
      Wire up a real list (e.g. MailChimp) if wanted — needs a privacy note if so.
- [ ] **Maintenance cron**: enable the schedule in `.github/workflows/maintenance.yml` after the
      first successful production deploy (domain configs already point at bbcc.scot).
- [ ] **Privacy / accessibility statements**: the concept footer linked to Privacy Policy and
      Accessibility pages that don't exist yet; add them as pages, then link them.

### Off-repo tasks from the SEO/GEO pass (#37)

The code side of #37 is done and gated. These are the parts no commit can carry, and the first
two are the difference between the work shipping and not shipping:

- [ ] **Turn off Cloudflare's managed robots.txt / AI Crawl Control.** Cloudflare serves a
      `robots.txt` at the edge, ahead of the Worker, so `public/robots.txt` is inert until that
      is switched off. The edge file currently does `Disallow: /` for GPTBot, ClaudeBot,
      Google-Extended, CCBot, Applebot-Extended, Bytespider, Amazonbot and meta-externalagent,
      with `ai-train=no` — the exact opposite of what this repo publishes. After the change,
      check that `https://bbcc.scot/robots.txt` serves the repo's file.
- [ ] **Point `babcc.wordpress.com` at this site.** It is live, carries an identical `<title>`,
      and still advertises the old Instagram, Facebook and X accounts plus
      `babccglasgow@gmail.com`. While it stands unedited it re-asserts the old identity more
      loudly than this site's silence denies it.
- [ ] **Confirm the office bearers.** `officeBearers` in `src/content/site/index.json` holds
      roles with no names, because the legacy list (Irene Loundon, Rowan Evenstar, Joy Laughlin)
      sits on a page that also says "this is our election year". Names render as ordinary prose
      and never enter the JSON-LD, so adding them is one JSON edit.
- [ ] **Supply the 2026/27 meeting exceptions**, if any beyond the standing July/August/December
      break. The published dates stop at January 2026.
- [ ] **Send the Duke of Wellington file.** mym has given permission, conditional on a credit on
      the page linking to `flickr.com/photos/mymuk`. The image itself is still not in the
      repository and no specific photo URL was ever recorded, only the profile. Drop the original
      into `src/assets/` and the hero swap and its credit line land together, in that order: a
      credit for a photo that is not on the page would be its own small untruth.
- [ ] **Ask mym the share-card question separately.** The grant is for a credit on the page, and a
      share thumbnail is seen in Slack and WhatsApp with no page attached, so the condition cannot
      travel with it. A higher-resolution or landscape original would help too: 1067px is under
      the 1200px platforms prefer. Until both are settled the card's left half stays a brand panel.
- [ ] **Add `bbcc.scot` as the website link** on the Instagram and Facebook profiles.
- [ ] **Decide the fate of `x.com/babccglasgow`** — delete, rename, or post a handover pointing
      here. The site claims neither the account nor a `twitter:site` tag, which is as far as
      markup can go; the rest is on the account.
- [ ] **Decide about `community-council.org.uk/blythswoodandbroomielaw`**, which has minutes
      indexed back to 2018: consolidate here, or leave it and accept the split.

## Image credits

All photos are Creative Commons. Sources live in `src/assets/` and are optimised at build time
by `astro:assets` (Sharp): responsive srcsets at 420–1400px widths, WebP at quality 60–65, lazy
loading everywhere except the hero. Only the logo stays in `public/images/` (it doubles as the
favicon).

| File | Source |
| --- | --- |
| `central-aerial.jpg` | Wikimedia Commons — "Glasgow Central railway station - aerial - 2025-04-17" |
| `blythswood-square.jpg` | Wikimedia Commons — "Springtime in Blythswood Square, Glasgow" |
| `squinty-bridge.jpg` | Wikimedia Commons — "The Squinty Bridge, River Clyde, Glasgow" (currently unused; kept for the future social section) |

Check licence terms (most are CC BY or CC BY-SA — attribution required) and add a proper credits
page before the first release.
