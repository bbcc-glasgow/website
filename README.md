# bbcc-website

Public website of **Blythswood & Broomielaw Community Council** (BBCC), the statutory community
council for Glasgow's city centre between the M8 and Renfield Street.

Design: the settled **Vibrant Poppy** direction (concept v9), ported from
`website-concepts/v9-vibrant-poppy.html`. Stack and delivery mirror
[weebuilts](https://github.com/gkanitz/weebuilts), which served as the deployment rehearsal for
this site.

One thing has superseded the concept. The hero photograph is no longer the aerial of Central
station; it is the coned Duke of Wellington in Royal Exchange Square, just inside the eastern
boundary (#37). The aerial was a picture of Glasgow, and this is a picture of *this* Glasgow: the
landmark a resident would name, the street sign in shot, and a joke the city has kept up since
the Eighties. The split hero is unchanged, but the photo is portrait where the aerial was
landscape, so `object-position` in `src/styles/global.css` is now doing real work and the mobile
band is taller than the concept's. Both are commented where they sit.

### The share card

The concept covers the page. It does not cover what the site looks like when somebody pastes a
link into WhatsApp or Slack, so `public/images/og-card.png` extends the direction to a 1200x630
share card: the coned Duke of Wellington on the left, and a brand-pink panel on the right
carrying the council's full name, the logo and `bbcc.scot` (#37).

The split is at 420px rather than half way, because that is what the photograph is: 1067x1600
scaled to the card's full height comes to 420 wide, so the Duke runs top to bottom with
essentially nothing cropped. The proportions follow the picture instead of forcing it into a
shape it isn't.

One departure from the concept is deliberate:

- **The card is drawn in Georgia and Helvetica, not Fraunces and Inter.** `sharp` renders the SVG
  through librsvg, which resolves fonts against the system rather than against
  `node_modules`. Rather than ship a font-loading dance for one image, the card uses a serif and a
  sans that sit close to the pairing. A share card is seen at thumbnail size, away from the site,
  and pinning the output to a committed PNG is worth more than an exact type match.

Run `node scripts/build-og-card.mjs` to regenerate it. The PNG is committed rather than built, so
the URL is stable and unhashed and CI never has to reproduce font rendering. It is quantised to a
palette, which takes it from 715 kB to 170 kB with nothing visible lost at the size a share card
is ever seen.

The card carries no photo credit. Mark Ynys-Mon was asked about this use specifically rather than
it being read into the on-page permission, because a thumbnail in Slack or WhatsApp appears with
no page attached and therefore no way to carry one.

## Stack

- **Astro 5** (+ Sharp via `astro:assets` for build-time image optimisation) — static output, no
  client-side framework; a small vanilla script drives the
  scroll-reveal, stat counters and scroll-spy (all disabled under `prefers-reduced-motion`).
- **Tailwind 4** (via `@tailwindcss/vite`) + **DaisyUI 5** for component classes.
- **Self-hosted fonts** (Fraunces + Inter variable, via Fontsource). No external requests at
  runtime; no analytics or tracking of any kind.
- **Heroicons v2** (MIT) via `astro-icon`, inlined into the HTML at build time. The `include`
  list in `astro.config.mjs` names every icon the site uses, which keeps the 1,288-icon set out
  of the build and doubles as the inventory. Nothing hosts icons on a CDN: the artwork is
  already in the HTML, so a CDN could only add a DNS lookup and a connection to the critical
  path, and it would break the no-external-requests line above.

  Icons are referenced by name, never by pasted path data. Before this, the site was running
  deprecated Heroicons v1 mixed with Feather, including two different calendar glyphs on the
  same page and a location pin stored two different ways (#37).
- **Cloudflare Workers static assets** (`wrangler.jsonc`), served at **https://bbcc.scot**
  (apex + www as Workers custom domains; the apex is canonical and `worker.js` 301s www to it).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local dev server |
| `pnpm build` | Static build to `dist/` |
| `pnpm gate` | Every step in `gate.d/`, in filename order: build → sitemap → link integrity → axe a11y (zero violations) → Lighthouse budgets (perf ≥95, a11y =100, bp ≥95, seo ≥95) → SEO/GEO invariants → content, CMS config and component contracts |

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
  when the site needs to be legible to crawlers. `/meetings.ics` is in it for a different reason:
  the holding page offers the calendar, so a 503 there would be a broken promise on a page people
  are being asked to trust. The `/holding/` URL itself is noindexed and kept out of the sitemap:
  the worker serves that content at `/`, so `/` is the URL that should be found, and nothing needs
  unwinding at launch.
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

### The CMS on a preview deploy always edits `main`

`backend.branch` in `public/admin/config.yml` is `main`. That is what makes editing work at all —
an editor opens `/admin`, edits what is live, and DecapBridge opens a PR — but it means the
`/admin` on a PR's preview deploy is not previewing that PR. It serves the PR's `config.yml`
against `main`'s content.

For an ordinary content PR that is harmless. For a PR that changes the *shape* of a field, the
CMS will show errors on entries that have not been migrated yet, because on `main` they haven't:
a list that gained variable types reports "item has no 'type' property" against every entry
still in the old shape. Config and content land in the same merge commit, so it clears itself the
moment the PR merges; there is nothing to fix and nothing to work around.

To try a config change before merging it, edit the working tree instead of the repo:

```
pnpm cms     # decap-server, port 8081
pnpm dev     # in another terminal
```

then open `http://localhost:4321/admin/index.html`. The filename is not optional under `astro dev`:
Vite serves `public/` without directory-index resolution, so `/admin` and `/admin/` both 404 there.
`astro preview` and the deployed Worker do resolve them, which is why only dev needs the suffix.

`local_backend: true` in the config sends the CMS to that
proxy, which reads and writes the branch you have checked out, with no login. Decap only does this
when the page is served from localhost, so the line has no effect on the deployed site.

The proxy reports `publish_modes: ["simple"]`, so locally a save writes the file straight into the
working tree rather than opening a draft PR. Editorial workflow is a property of the real backend,
and is unaffected.

Pointing a preview deploy at its own branch instead would be a smaller change (the branch name is
in `github.head_ref`), but the CMS writes as well as reads: with `publish_mode: editorial_workflow`
a save opens a PR against whatever `branch` says, so a preview wired to a feature branch would
send an editor's work into a branch that gets deleted on merge. The preview URL is public. The
local proxy covers the same need without that.

Two things do need checking before merging a shape change: that no editorial-workflow draft is
open (`gh pr list` plus any `cms/*` branches), since a draft written in the old shape will not
load in the new CMS, and that the content in the PR is migrated in the same commit as the config.

## Editing the site (volunteers)

Volunteers do **not** need a GitHub account or GitHub collaborator access to edit the site.
Content is managed through Decap CMS (the login screen at `/admin`) and authenticated via
DecapBridge, which issues a PR behind the scenes.

### Step-by-step walkthrough

1. **Go to `/admin`** — open `https://bbcc.scot/admin`. You see the Decap CMS login screen.
   (Running it locally instead? See "The CMS on a preview deploy always edits `main`" above: the
   URL is `/admin/index.html` and there is no login.)

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

### Buttons

Every button on the site is edited the same way, through a **Call to Action Buttons** list. Add
one and the first thing it asks is what kind of destination it has:

- **Link** — an address you type. A `#section` jumps down the current page, `/page` goes to
  another page on the site, and a full `https://` address goes somewhere else entirely.
- **Document** — a file you upload. It lands in `public/documents/` and the button shows its type
  and size ("PDF, 240 KB") automatically, read off the file rather than typed.
- **Email us** — no address to fill in. It uses the contact address from **Site Settings**, with
  an optional subject line to prefill.
- **Social profile** — no address to fill in either. Pick Instagram or Facebook and it uses the
  profile from **Site Settings**.

The last two exist so the council's email address and profile URLs are written down once. Change
the address in Site Settings and every button that uses it follows.

Each button also has an **Open in a new tab** toggle. Leave it alone and it does the ordinary
thing: pages on this site stay in the same tab, documents and other people's sites open away.
Whichever way it ends up, a link that opens a new tab tells screen reader users so.

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

- [x] **Meeting card**: resolved in #37. **Meeting dates come from the council's Google Calendar
      ("BBCC Public Events"), and nothing else.** To add, move or cancel a meeting, change it in
      Google. There is no date anywhere in this repo, and no rule to keep in step with the
      calendar either: `src/lib/gcal.ts` reads the public iCal feed at build time, expands the
      recurrence with `ical.js`, and `src/lib/meetings.ts` derives the standing pattern from the
      occurrences it finds. So the sentence on the page — "The third Tuesday of every month
      except…, 7pm for a 7.30pm start, until 10pm" — is read off the calendar rather than typed
      next to it, and cannot drift from it. A daily cron rebuilds, which is the delay between a
      change in Google and the site showing it.

      Content keeps only what a calendar entry cannot hold, in `meetingDetails`: `doorsOpen`
      (Google has one start time per event; "doors at 7 for a 7.30 start" is two) and
      `attendanceNote`. The structured venue address stays in content too, because schema.org
      needs its parts and the calendar's `LOCATION` is prose — but the build refuses to publish
      an address whose postcode the calendar disagrees with, so the venue cannot move in one
      place only.

      **Failure is loud, deliberately.** A build that cannot reach the calendar, cannot parse it,
      finds no future meetings, or finds meetings that no longer fall on a consistent nth-weekday
      stops with an error naming the problem. The deployed site keeps serving the last good
      build, which still has real dates on it. The alternative — falling back to a hardcoded rule
      — would quietly publish dates nobody had agreed to and look exactly like working.

      That same read generates `/meetings.ics` (`src/pages/meetings.ics.ts`), so a subscriber and
      a reader can never be told different dates. It publishes `CALENDAR_HORIZON` meetings — 18,
      about two years — and the count quoted on the page is derived, not typed.

      Both pages offer that feed through an "Add to your calendar" disclosure built from
      `src/lib/calendar.ts`, not as a bare `.ics` link. A bare link is a download, and a download
      is a snapshot that never updates again; the calendar apps most people use each take a feed
      URL as a query parameter and subscribe on the reader's behalf, so they get handed that
      instead. Google (`calendar.google.com/calendar/r?cid=`), Outlook.com
      (`outlook.live.com/calendar/0/addfromweb?url=`) and anything registered for `webcal://`
      (Apple, iOS, Thunderbird) all track the feed, so the daily cron carries new and cancelled
      dates to them on its own. The download is offered last and labelled as the one-off it is.
      The URLs are built from `Astro.site`, so a preview deployment offers its own feed rather
      than pointing subscribers at production. Work and school Microsoft accounts use
      `outlook.office.com` instead; that is a fifth button for a minority of a community
      council's readers, so it is left out and they can paste the feed URL.

      Cancelled meetings are dropped from the feed rather than published as `STATUS:CANCELLED`.
      A subscribing client reconciles against the whole feed and removes what is no longer in it;
      an importing client would never see the update whatever we emitted.

      `tests/seo.test.mjs` derives its expectations from `dist/meetings.ics` rather than from
      content, and checks that the prose sentence, the JSON-LD `Schedule`, the concrete `Event`
      nodes and the feed all still agree. Asserting against a rule in content would be asserting
      against a fact nobody maintains any more.
- [ ] **Stats strip**: "200,000+ daily visitors" and "~30 lanes & closes" need a source or
      revised wording; "1820s Blythswood grid" and "UNESCO City of Music" are on solid ground.
      Values and wording are in `src/content/site/index.json` (same file holds the boundary
      description).
- [ ] **Survey card**: "Start survey" currently has no survey behind it — link a real survey or
      remove the card.
- [ ] **JAG cards**: "Visit council →" links are placeholders — add the neighbouring councils'
      real sites (or remove the link affordance).
- [ ] **Instagram feed activation**: the section is built (epic #47; the accounts are
      `instagram.com/glasgowbbcc` and `facebook.com/glasgowbbcc` — both handles are the same;
      `bbccglasgow` is the Instagram account's former handle and was never a Facebook page,
      though the repo linked it as one, see #37) and renders the shell until real posts are
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
- [ ] **Ask Mark Ynys-Mon for a full-resolution original** of the Duke of Wellington photo. The
      copy in `src/assets/` is 1067x1600, which caps the hero srcset at 1067 and leaves nothing
      spare on a large display. His Flickr profile restricts automatic access to larger versions
      and asks that requests go to `photographs@druidic.org` or through Flickr. Permission for the
      site and the share card is already given; this is only about resolution.
- [ ] **Add `bbcc.scot` as the website link** on the Instagram and Facebook profiles.
- [ ] **Decide the fate of `x.com/babccglasgow`** — delete, rename, or post a handover pointing
      here. The site claims neither the account nor a `twitter:site` tag, which is as far as
      markup can go; the rest is on the account.
- [ ] **Decide about `community-council.org.uk/blythswoodandbroomielaw`**, which has minutes
      indexed back to 2018: consolidate here, or leave it and accept the split.

## Image credits

Sources live in `src/assets/` and are optimised at build time by `astro:assets` (Sharp):
responsive srcsets at 420–1400px widths, WebP at quality 60–65, lazy loading everywhere except
the hero. Only the logo stays in `public/images/` (it doubles as the favicon).

The hero photograph is the one asset that is not Creative Commons. It is used by permission, and
that permission has a condition attached: a credit on the page linking to the photographer's
profile. The footer of `src/pages/index.astro` carries it. If the photo is ever removed, remove
the credit in the same commit; if it is ever used somewhere new, the credit goes with it.

| File | Source |
| --- | --- |
| `duke_of_wellington_mym.jpeg` | Mark Ynys-Mon, [flickr.com/photos/mymuk](https://www.flickr.com/photos/mymuk) — used with permission (hero and share card), not under a CC licence. His profile asks that requests for full-resolution originals and any commercial use go through email or Flickr message. |
| `central-aerial.jpg` | Wikimedia Commons — "Glasgow Central railway station - aerial - 2025-04-17" (currently unused; replaced as the hero by the photo above) |
| `blythswood-square.jpg` | Wikimedia Commons — "Springtime in Blythswood Square, Glasgow" |
| `squinty-bridge.jpg` | Wikimedia Commons — "The Squinty Bridge, River Clyde, Glasgow" (currently unused; kept for the future social section) |

Check licence terms (most are CC BY or CC BY-SA — attribution required) and add a proper credits
page before the first release.
