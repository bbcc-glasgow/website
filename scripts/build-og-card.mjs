// Generates the 1200x630 share card at public/images/og-card.png (#37).
//
// Run by hand (`node scripts/build-og-card.mjs`), not during the build. The PNG
// is committed so it has a stable, unhashed absolute URL that Facebook, X,
// LinkedIn, WhatsApp and Slack can all fetch, and so CI never has to reproduce
// font rendering. This script exists so the card can be regenerated from source
// rather than re-drawn by hand.
//
// Composition is the split agreed in the #37 grill: the coned Duke of
// Wellington on the left at full height, brand-pink panel on the right carrying
// the council's full name and the logo. The photograph is by Flickr user mym,
// used with permission that covers share cards specifically; no credit is drawn
// on the card because a thumbnail has nowhere to put one, and mym was asked
// about this use directly rather than it being assumed.
//
// The source is 1067x1600, which at 630px tall is 420px wide, so the photo runs
// the full height of the card with essentially nothing cropped. That is why the
// panel starts at 420 and not at the half-way mark: the split follows the
// photograph's own proportions rather than forcing it into a shape it isn't.
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
const PHOTO_W = 420; // 1067x1600 scaled to full card height
const SEAM_W = 6; // teal rule between photo and panel, as on the site
const PANEL_X = PHOTO_W + SEAM_W;
const TEXT_X = PANEL_X + 60;

const INK = "#1a1a2e";
const PINK = "#dc1a84";
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
  // Ink under where the photograph is composited. It should never be visible;
  // it is here so a missing or unreadable source degrades to a brand panel
  // rather than to transparency.
  return `
    <rect x="0" y="0" width="${PANEL_X}" height="${HEIGHT}" fill="${INK}"/>
    <rect x="${PHOTO_W}" y="0" width="${SEAM_W}" height="${HEIGHT}" fill="${TEAL}"/>
  `;
}

function buildRightPanel() {
  return `
    <rect x="${PANEL_X}" y="0" width="${WIDTH - PANEL_X}" height="${HEIGHT}" fill="${PINK}"/>
    <text x="${TEXT_X}" y="205" font-family="${SERIF}" font-size="72" font-weight="700" fill="#ffffff">${xml(NAME_LINES[0])}</text>
    <text x="${TEXT_X}" y="287" font-family="${SERIF}" font-size="72" font-weight="700" fill="#ffffff">${xml(NAME_LINES[1])}</text>
    <text x="${TEXT_X}" y="359" font-family="${SERIF}" font-size="52" font-weight="700" fill="#ffffff" opacity="0.92">${xml(NAME_LINES[2])}</text>
    <text x="${TEXT_X}" y="413" font-family="${SANS}" font-size="24" fill="#ffffff" opacity="0.8">${xml(STRAPLINE)}</text>
    <rect x="${TEXT_X}" y="462" width="116" height="116" rx="24" fill="#ffffff"/>
    <text x="${TEXT_X + 142}" y="533" font-family="${SANS}" font-size="34" font-weight="700"
          fill="#ffffff" letter-spacing="1">${xml(DOMAIN)}</text>
  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${buildLeftPanel()}
  ${buildRightPanel()}
</svg>`;

const photo = await sharp(readFileSync(resolve(repoRoot, "src/assets/duke_of_wellington_mym.jpeg")))
  // `cover` at the photo's own aspect ratio, so this trims a pixel rather than
  // choosing a crop. `top` decides which pixel, and losing it from the plinth
  // costs nothing.
  .resize(PHOTO_W, HEIGHT, { fit: "cover", position: "top" })
  .toBuffer();

const logo = await sharp(readFileSync(resolve(repoRoot, "public/images/bbcc-logo.png")))
  .resize(88, 88, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .toBuffer();

const png = await sharp(Buffer.from(svg))
  .composite([
    { input: photo, left: 0, top: 0 },
    { input: logo, left: TEXT_X + 14, top: 476 },
  ])
  // Quantised to a palette: 170 kB rather than 715 kB, with no difference
  // anyone can see at the size a share card is actually looked at. The format
  // stays PNG because the URL is committed and referenced as one.
  .png({ compressionLevel: 9, palette: true, effort: 10 })
  .toBuffer();

const out = resolve(repoRoot, "public/images/og-card.png");
writeFileSync(out, png);

const { width, height } = await sharp(png).metadata();
console.log(`wrote ${out} (${width}x${height}, ${(png.length / 1024).toFixed(1)} kB)`);
