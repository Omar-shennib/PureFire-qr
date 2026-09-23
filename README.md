# Pure Fire — QR menu

Static site (no build step). Deploy the whole folder to Cloudflare Pages
(Workers & Pages → Create → Pages → Upload assets, or connect a Git repo
with build command empty and output directory `/`).

- The bare domain (`https://your-project.pages.dev/`) opens the Pure Fire menu.
  `/pure-fire/` works too.
- Menu content, prices, photos, hours, phones and add-ons live in
  `cafes/pure-fire/menu-data.json`; the look lives in `cafes/pure-fire/theme.css`.
- Real photos are in `cafes/pure-fire/images/`; items still showing stand-in
  photos load them from images.unsplash.com.
- Local preview: `npx serve .` then open http://localhost:3000/
  (opening index.html straight from disk won't load the menu).
- QR code: set `BASE_URL` in `generate-qr.js`, then `npm install && node generate-qr.js`.
- Double-clicking `index.html` also works (no server needed): it reads the
  bundled copy `cafes/pure-fire/menu-data.js`. After editing
  `menu-data.json`, update that copy too (or just delete it — the live site
  always reads `menu-data.json`).
