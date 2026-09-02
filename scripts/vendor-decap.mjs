// Copy the Decap CMS bundle out of node_modules into public/admin, so the CMS
// loads from our own origin and makes no external request at runtime.
//
// This used to be three `cp` commands in the prebuild script, naming the entry,
// its single lazy chunk ("373.decap-cms.js") and the stylesheet. 3.16.0 splits
// the same bundle across about a hundred chunks with different numbers and adds
// two .wasm files, so any list written by hand is wrong on the next upgrade —
// silently, because a missing lazy chunk only shows up when an editor opens the
// widget that needs it.
//
// So the rule is derived from the bundle instead: take the entry, every chunk
// webpack names after it (`<id>.decap-cms.js`, per the chunkFilename template in
// dist/decap-cms.js), the .wasm files those chunks load, and the stylesheet.
//
// Deliberately not copied: `cms.js` and its `<id>.cms.js` chunks, which are the
// same code under the bundle's other entry name, and every `.map`. Shipping
// either would roughly double what a static deploy carries for no gain.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules", "decap-cms", "dist");
const to = path.join(root, "public", "admin");

if (!fs.existsSync(from)) {
  throw new Error(`decap-cms is not installed: ${from} does not exist`);
}

const wanted = (name) =>
  name === "cms.css" ||
  name === "decap-cms.js" ||
  name.endsWith(".wasm") ||
  /^\d+\.decap-cms\.js$/.test(name);

const files = fs.readdirSync(from).filter(wanted);

// The entry is the one file the admin page names directly; without it nothing
// else matters, so fail loudly rather than deploying an empty CMS.
for (const required of ["decap-cms.js", "cms.css"]) {
  if (!files.includes(required)) {
    throw new Error(`decap-cms/dist is missing ${required}`);
  }
}

// Chunk numbers change between versions, so anything vendored by a previous
// install is stale. Clearing first keeps public/admin an exact mirror of the
// installed version instead of the union of every version ever built here.
for (const name of fs.readdirSync(to).filter(wanted)) {
  fs.rmSync(path.join(to, name));
}

fs.mkdirSync(to, { recursive: true });
for (const name of files) {
  fs.copyFileSync(path.join(from, name), path.join(to, name));
}

console.log(`vendored ${files.length} decap-cms files into public/admin/`);
