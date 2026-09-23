#!/usr/bin/env node
/* ============================================================
   QR generator — one PNG per cafe folder, print-ready.
   Usage:
     npm install        (once, installs the "qrcode" package)
     node generate-qr.js           # skips cafes that already have one
     node generate-qr.js --force   # regenerate everything
   ============================================================ */

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

/* ---- EDIT THIS ONCE when your domain is known ---- */
const BASE_URL = "https://yoursite.pages.dev";
/* -------------------------------------------------- */

const CAFES_DIR = path.join(__dirname, "cafes");
const FORCE = process.argv.includes("--force");

(async () => {
  if (!fs.existsSync(CAFES_DIR)) {
    console.error(`No "${CAFES_DIR}" directory found — run this from the repo root.`);
    process.exit(1);
  }

  const cafes = fs
    .readdirSync(CAFES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (!cafes.length) {
    console.log("No cafe folders found in /cafes — nothing to do.");
    return;
  }

  let made = 0, skipped = 0, failed = 0;

  for (const id of cafes) {
    const out = path.join(CAFES_DIR, id, "qr-code.png");
    if (fs.existsSync(out) && !FORCE) {
      console.log(`skip   ${id}  (qr-code.png exists — use --force to rebuild)`);
      skipped++;
      continue;
    }
    const url = `${BASE_URL.replace(/\/$/, "")}/${id}/`;
    try {
      await QRCode.toFile(out, url, {
        errorCorrectionLevel: "H",          // survives print wear / logo overlay
        width: 1000,                        // 1000x1000 px — clean at any print size
        margin: 2,
        color: { dark: "#1a1a1a", light: "#ffffff" },
      });
      console.log(`ok     ${id}  →  ${out}\n       ${url}`);
      made++;
    } catch (err) {
      console.error(`fail   ${id}  (${err.message})`);
      failed++;
    }
  }

  console.log(
    `\nDone. ${made} generated, ${skipped} skipped, ${failed} failed — ${cafes.length} cafe(s) total.` +
    (BASE_URL.includes("yoursite") ? "\n⚠  BASE_URL is still the placeholder — edit it at the top of this file." : "")
  );
  if (failed) process.exit(1);
})();
