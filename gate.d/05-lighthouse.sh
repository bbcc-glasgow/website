#!/usr/bin/env bash
# Two SEO audits are skipped in lighthouserc.json, and gate.d/06-seo.sh asserts
# what they were there for (#37):
#
#   robots-txt   Lighthouse rejects the `Content-Signal:` line as an unknown
#                directive. The directive is deliberate - it is how the council
#                opts in to AI search, input and training - and the robots.txt
#                spec requires crawlers to ignore directives they do not know,
#                so this is Lighthouse's parser being out of date rather than a
#                fault in the file. tests/seo.test.mjs asserts its contents.
#   is-crawlable /holding/ is noindexed on purpose: the worker serves that
#                content at `/`, which is the URL that should be found. The
#                audit is right about what it sees and wrong about what it
#                means. tests/seo.test.mjs asserts that `/holding/` is
#                noindexed and that `/` is not, which is the real invariant.
#
# Skipping an audit removes it from the category's weighted average, so the
# remaining SEO score still has to clear 0.95. lighthouserc.production.json
# keeps is-crawlable: a noindex reaching bbcc.scot itself is worth an alarm.
set -e
pnpm test:lighthouse
