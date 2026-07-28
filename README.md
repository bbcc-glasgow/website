# bbcc-website

Public website of **Blythswood & Broomielaw Community Council** (BBCC), the statutory community
council for Glasgow's city centre between the M8 and Renfield Street.

Design: the settled **Vibrant Poppy** direction (concept v9), ported from
`website-concepts/v9-vibrant-poppy.html`. Stack and delivery mirror
[weebuilts](https://github.com/gkanitz/weebuilts), which served as the deployment rehearsal for
this site.

## Stack

- **Astro 5** — static output, no client-side framework; a small vanilla script drives the
  scroll-reveal, stat counters and scroll-spy (all disabled under `prefers-reduced-motion`).
- **Tailwind 4** (via `@tailwindcss/vite`) + **DaisyUI 5** for component classes.
- **Self-hosted fonts** (Fraunces + Inter variable, via Fontsource). No external requests at
  runtime; no analytics or tracking of any kind.
- **Cloudflare Workers static assets** (`wrangler.jsonc`), currently on workers.dev — custom
  domain to be added once BBCC settles one.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local dev server |
| `pnpm build` | Static build to `dist/` |
| `pnpm gate` | All four gates: build → link integrity → axe a11y (zero violations) → Lighthouse budgets (perf ≥95, a11y =100, bp ≥95, seo ≥95) |

## Release boundary

Merges to `main` do **not** publish. Deploys happen only on a `v*` tag or manual dispatch of the
deploy workflow (ADR-0005 release tap). Requires `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets.

## Verify before first release tag

The seed content is ported from the concept page. Items below are placeholders or unverified
claims deliberately left for the owner to confirm — **each should be resolved via an issue before
the first `v*` tag**:

- [ ] **Meeting card**: date, time and location are "To be announced" — fill in the real next
      meeting.
- [ ] **Stats strip**: "200,000+ daily visitors" and "~30 lanes & closes" need a source or
      revised wording; "1820s Blythswood grid" and "UNESCO City of Music" are on solid ground.
- [ ] **Survey card**: "Start survey" currently has no survey behind it — link a real survey or
      remove the card.
- [ ] **JAG cards**: "Visit council →" links are placeholders — add the neighbouring councils'
      real sites (or remove the link affordance).
- [ ] **Social media**: the concept's Instagram feed section and social icons were omitted from
      the port because no verified account URLs existed. Re-add when BBCC's real accounts are
      confirmed.
- [ ] **Newsletter**: currently an honest mailto to blythswoodbroomielawcc@gmail.com. Wire up a
      real list (e.g. MailChimp) if wanted — needs a privacy note if so.
- [ ] **Domain**: `astro.config.mjs` site URL, `wrangler.jsonc` routes,
      `lighthouserc.production.json` and the maintenance workflow's `PRODUCTION_URL` all carry a
      workers.dev placeholder; update together when the domain is settled, and enable the
      maintenance cron.
- [ ] **Privacy / accessibility statements**: the concept footer linked to Privacy Policy and
      Accessibility pages that don't exist yet; add them as pages, then link them.

## Image credits

All photos are Creative Commons; retained at reduced resolution in `public/images/`:

| File | Source |
| --- | --- |
| `central-aerial.jpg` | Wikimedia Commons — "Glasgow Central railway station - aerial - 2025-04-17" |
| `blythswood-square.jpg` | Wikimedia Commons — "Springtime in Blythswood Square, Glasgow" |
| `rooftops.jpg` | Wikimedia Commons — "Glasgow city centre rooftops panorama" |
| `squinty-bridge.jpg` | Wikimedia Commons — "The Squinty Bridge, River Clyde, Glasgow" (currently unused; kept for the future gallery/social sections) |
| `bagpiper.jpg`, `rainy-street.jpg`, `people-make-glasgow.jpg`, `clyde-bridge.jpg` | Flickr / pixael.com (CC), from the project's `creative commons immages` collection |

Check licence terms (most are CC BY or CC BY-SA — attribution required) and add a proper credits
page before the first release.
