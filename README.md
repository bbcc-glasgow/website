# bbcc-website

Public website of **Blythswood & Broomielaw Community Council** (BBCC), the statutory community
council for Glasgow's city centre between the M8 and Renfield Street.

Design: the settled **Vibrant Poppy** direction (concept v9), ported from
`website-concepts/v9-vibrant-poppy.html`. Stack and delivery mirror
[weebuilts](https://github.com/gkanitz/weebuilts), which served as the deployment rehearsal for
this site.

## Stack

- **Astro 5** (+ Sharp via `astro:assets` for build-time image optimisation) — static output, no
  client-side framework; a small vanilla script drives the
  scroll-reveal, stat counters and scroll-spy (all disabled under `prefers-reduced-motion`).
- **Tailwind 4** (via `@tailwindcss/vite`) + **DaisyUI 5** for component classes.
- **Self-hosted fonts** (Fraunces + Inter variable, via Fontsource). No external requests at
  runtime; no analytics or tracking of any kind.
- **Cloudflare Workers static assets** (`wrangler.jsonc`), served at **https://bbcc.scot**
  (apex + www as Workers custom domains; canonical is the apex).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local dev server |
| `pnpm build` | Static build to `dist/` |
| `pnpm gate` | All four gates: build → link integrity → axe a11y (zero violations) → Lighthouse budgets (perf ≥95, a11y =100, bp ≥95, seo ≥95) |

## Release boundary

Every push to `main` (every merged PR, including Decap CMS publishes) deploys to production
automatically. Manually dispatching the deploy workflow redeploys current `main` as a
fallback/redeploy path. A concurrency group serialises back-to-back merges so the newest commit
is always the one live. Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository
secrets.

## Site mode: holding page vs live site

A small Worker (`worker.js`, `run_worker_first`) gates the static assets on the `SITE_MODE`
variable in `wrangler.jsonc`:

- **`holding`** (current): every route serves `src/pages/holding.astro` — the branded holding
  page with the contact email. Nothing under development is publicly reachable (only hashed
  `/_astro/` assets and `/images/` pass through). `/` returns 200; all other paths return 503 so
  crawlers don't index half-built URLs.
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
   click **"Site Facts"** to open `src/content/site/index.json`, then scroll to the **Statistics**
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
details from `src/content/projects/*.json`; site-level data (stats, boundary description, contact
email) lives in `src/content/site/index.json`. Items below are placeholders or unverified claims
deliberately left for the owner to confirm — **each should be resolved via an issue before the
first release**:

- [ ] **Meeting card**: date, time and location are "To be announced" — fill in the real next
      meeting.
- [ ] **Stats strip**: "200,000+ daily visitors" and "~30 lanes & closes" need a source or
      revised wording; "1820s Blythswood grid" and "UNESCO City of Music" are on solid ground.
      Values and wording are in `src/content/site/index.json` (same file holds the boundary
      description).
- [ ] **Survey card**: "Start survey" currently has no survey behind it — link a real survey or
      remove the card.
- [ ] **JAG cards**: "Visit council →" links are placeholders — add the neighbouring councils'
      real sites (or remove the link affordance).
- [ ] **Social media**: the concept's Instagram feed section and social icons were omitted from
      the port because no verified account URLs existed. Re-add when BBCC's real accounts are
      confirmed.
- [ ] **Newsletter**: currently an honest mailto (contact email in `src/content/site/index.json`).
      Wire up a real list (e.g. MailChimp) if wanted — needs a privacy note if so.
- [ ] **Maintenance cron**: enable the schedule in `.github/workflows/maintenance.yml` after the
      first successful production deploy (domain configs already point at bbcc.scot).
- [ ] **Privacy / accessibility statements**: the concept footer linked to Privacy Policy and
      Accessibility pages that don't exist yet; add them as pages, then link them.

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
