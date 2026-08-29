# bbcc-website — Claude instructions

This repo is a **vehicle**: a product repo built by a Collaudo delivery org. The org (`bbcc-org`) drives this repo through `collaudo-orchestrator-core`, which is a separate product with its own repo, its own delivery loop and its own release process.

## Core defects go to the core repo

When something goes wrong and the cause turns out to be in the orchestrator rather than in this product, **file an issue at `gkanitz/collaudo-orchestrator-core`. Do not fix it yourself.**

This holds even when the fix is small and obvious, and even when a core checkout happens to be readable at `/Users/gkanitz/Claude/collaudo-orchestrator-core`. Core is delivered by its own Collaudo loop: triage, slicing, gates, changelog fragments, a tagged release. A fix applied by hand from a session in this repo skips all of it and leaves the release trail wrong.

How to tell the difference: if the defect would still exist for a vehicle that shared none of this product's code, it belongs to core.

What to do instead:

1. Diagnose it properly. Prototype the fix locally if that is what it takes to confirm the root cause, then revert it.
2. Open the issue with the live evidence, the confirmed root cause, every affected call site, a suggested patch and a Definition of Done, so the core loop can pick it up without re-deriving anything.
3. Say in the issue that a prototype was run and reverted, and keep the diff somewhere retrievable in case it is wanted.

Recent examples of the shape to aim for: core#731, #732, #733.

## Scope

Changes in this repo are changes to the product. Orchestration, triage behaviour, personas, gates plumbing and model routing are core's territory, not this repo's.
