// Generates the 1200x630 share card at public/images/og-card.png (#37).
//
// Run by hand (`node scripts/build-og-card.mjs`), not during the build. The PNG
// is committed so it has a stable, unhashed absolute URL that Facebook, X,
// LinkedIn, WhatsApp and Slack can all fetch, and so CI never has to reproduce
// font rendering. This script exists so the card can be regenerated from source
// rather than re-drawn by hand.
//
// Composition is the split agreed in the #37 grill: image on the left at full
// height, brand-pink panel on the right carrying the logo and the council's
// full name. The left half is currently a flat brand panel because the intended
// photograph (the coned Duke of Wellington, from Flickr user mym) is not in the
// repository yet and its permission has not been confirmed to cover cropped
// derivatives and redistribution as a share thumbnail. When that lands, replace
// buildLeftPanel() with the image composite; nothing else needs to change.
//
// Fonts: librsvg resolves these against the system, and Fraunces is not
// installed on a stock machine, so the card is drawn in a serif and a sans that
// sit close to the site's Fraunces/Inter pairing rather than matching them
// exactly. That trade is deliberate. A share card is seen at thumbnail size,
// away from the site, and pinning the output to a committed PNG is worth more
// than an exact type match. See the "Share card" section of the README.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const WIDTH = 1200;
const HEIGHT = 630;
const PANEL_X = 720; // right panel starts here; left half is 720px wide

const INK = "#1a1a2e";
const PINK = "#dc1a84";
const PINK_ON_DARK = "#ff7ab8";
const TEAL = "#00a896";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Helvetica, Arial, sans-serif";

const NAME_LINES = ["Blythswood &", "Broomielaw", "Community Council"];
const STRAPLINE = "The community council for Glasgow's city centre";
const DOMAIN = "bbcc.scot";

/** The council's name contains an ampersand, which is not valid raw in XML. */
function xml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

function buildLeftPanel() {
  // Placeholder for the photograph: brand ink with the teal/pink accent rules
  // that run through the site, so the card reads as BBCC even without it.
  return `
    <rect x="0" y="0" width="${PANEL_X}" height="${HEIGHT}" fill="${INK}"/>
    <rect x="0" y="0" width="14" height="${HEIGHT}" fill="${TEAL}"/>
    <g opacity="0.10">
      ${Array.from({ length: 9 }, (_, i) => {
        const x = 90 + i * 78;
        return `<rect x="${x}" y="0" width="2" height="${HEIGHT}" fill="#ffffff"/>`;
      }).join("\n      ")}
      ${Array.from({ length: 6 }, (_, i) => {
        const y = 70 + i * 100;
        return `<rect x="0" y="${y}" width="${PANEL_X}" height="2" fill="#ffffff"/>`;
      }).join("\n      ")}
    </g>
    <text x="72" y="232" font-family="${SERIF}" font-size="78" font-weight="700" fill="#ffffff">${xml(NAME_LINES[0])}</text>
    <text x="72" y="322" font-family="${SERIF}" font-size="78" font-weight="700" fill="#ffffff">${xml(NAME_LINES[1])}</text>
    <text x="72" y="398" font-family="${SERIF}" font-size="58" font-weight="700" fill="${PINK_ON_DARK}">${xml(NAME_LINES[2])}</text>
    <text x="72" y="470" font-family="${SANS}" font-size="26" fill="#ffffff" opacity="0.75">${xml(STRAPLINE)}</text>
  `;
}

function buildRightPanel() {
  return `
    <rect x="${PANEL_X}" y="0" width="${WIDTH - PANEL_X}" height="${HEIGHT}" fill="${PINK}"/>
    <rect x="${PANEL_X + 88}" y="176" width="304" height="304" rx="36" fill="#ffffff"/>
    <text x="${PANEL_X + 240}" y="546" font-family="${SANS}" font-size="34" font-weight="700"
          fill="#ffffff" text-anchor="middle" letter-spacing="1">${xml(DOMAIN)}</text>
  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${buildLeftPanel()}
  ${buildRightPanel()}
</svg>`;

const logo = await sharp(readFileSync(resolve(repoRoot, "public/images/bbcc-logo.png")))
  .resize(248, 248, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .toBuffer();

const png = await sharp(Buffer.from(svg))
  .composite([{ input: logo, left: PANEL_X + 116, top: 204 }])
  .png({ compressionLevel: 9 })
  .toBuffer();

const out = resolve(repoRoot, "public/images/og-card.png");
writeFileSync(out, png);

const { width, height } = await sharp(png).metadata();
console.log(`wrote ${out} (${width}x${height}, ${(png.length / 1024).toFixed(1)} kB)`);
