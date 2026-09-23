/* ============================================================
   QR Menu — renderer. Vanilla JS only.
   Supports: RTL, bilingual text ({ "ar": "…", "en": "…" } + a
   language toggle), per-cafe stylesheet + fonts, logo, live
   opening-hours pill, tagline, branches panel, social links,
   no-price items, per-cafe themeColor.
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

function cafeId() {
  const q = new URLSearchParams(location.search).get("cafe");
  if (q) return q;
  const seg = location.pathname.split("/").filter(Boolean)[0];
  if (seg && seg !== "index.html" && seg !== "cafes") return seg;
  // bare domain → the cafe named in <meta name="default-cafe"> (index.html)
  return document.querySelector('meta[name="default-cafe"]')?.content || "pure-fire";
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Opened straight from disk (file://) paths must be relative to index.html */
const ROOT = location.protocol === "file:" ? "" : "/";
const imgSrc = (src, id) =>
  /^https?:\/\//i.test(src) ? src : `${ROOT}cafes/${id}/${src}`;

/* ---------- State + language ---------- */

let DATA, ID, CUR, LANG, LANGS;
let active = 0;

const RTL_LANGS = ["ar", "fa", "he", "ur"];

/* Built-in UI strings; a cafe can override any of them with "ui": { "ar": {…}, "en": {…} } */
const UI = {
  ar: {
    search: "ابحث عن منتج…",
    results: "نتائج البحث",
    none: 'لا توجد نتائج لـ "{q}"',
    soon: "قريباً — ترقبوا المزيد",
    branches: "فروعنا",
    toggle: "AR",
  },
  en: {
    search: "Search the menu…",
    results: "Search results",
    none: 'No items match "{q}"',
    soon: "Coming soon",
    branches: "Visit us",
    toggle: "EN",
  },
};

/* Resolve a translatable value: {ar, en} objects pick the current language,
   plain strings pass through unchanged. */
const tx = (v) => (v && typeof v === "object" && !Array.isArray(v))
  ? (v[LANG] ?? v[LANGS[0]] ?? Object.values(v)[0] ?? "")
  : (v ?? "");

/* Every language's text joined — search matches in either language */
const allText = (v) => (v && typeof v === "object") ? Object.values(v).join(" ") : String(v ?? "");

function ui(key, lang = LANG) {
  const custom = DATA.ui && DATA.ui[lang] && DATA.ui[lang][key];
  return custom ?? (UI[lang] || UI.en)[key] ?? UI.en[key];
}

/* "Pure Fire" → <span class="w1">Pure</span> <span class="w2">Fire</span>
   so a theme can colour the words differently */
const twoTone = (text) => esc(text).split(/\s+/)
  .map((w, i) => `<span class="w${Math.min(i + 1, 2)}">${w}</span>`).join(" ");

/* Replace broken images: thumbs become an initial on a tinted tile,
   cover/banner photos drop out and their container switches to a
   plain accent style (the text on top stays visible). */
function hydrateImages(root) {
  root.querySelectorAll("img[data-thumb]:not([data-h])").forEach((img) => {
    img.dataset.h = "1";
    const swap = () => {
      const box = img.parentElement;
      if (!box) return;
      box.classList.add("thumb--ph");
      box.textContent = (img.alt || "?").trim().charAt(0).toUpperCase();
    };
    if (img.complete && img.naturalWidth === 0) swap();
    else img.addEventListener("error", swap, { once: true });
  });
  root.querySelectorAll("img[data-vanish]:not([data-h])").forEach((img) => {
    img.dataset.h = "1";
    const drop = () => {
      const host = img.closest("[data-plain]");
      if (host) host.classList.add(host.dataset.plain);
      img.remove();
    };
    if (img.complete && img.naturalWidth === 0) drop();
    else img.addEventListener("error", drop, { once: true });
  });
}

/* ---------- HTML builders ---------- */

/* CUR.symbol: currency string; CUR.after: true puts it after the amount ("5 د.ل") */
function priceHtml(prices) {
  if (!prices || !prices.length) return "";
  // filter rows that have a non-empty price value
  const rows = prices.filter((p) => p.price && String(p.price).trim());
  if (!rows.length) return "";
  const cur = CUR.symbol ? `<span class="cur">${esc(tx(CUR.symbol))}</span>` : "";
  return rows.map((p) => `
    <div class="price">
      ${p.label ? `<span class="plabel">${esc(tx(p.label))}</span>` : ""}
      ${CUR.after ? "" : cur}<span class="amount">${esc(p.price)}</span>${CUR.after ? cur : ""}
    </div>`).join("");
}

/* cat: the item's category (for its tag + card variant);
   inSearch: show which category a search hit came from */
function itemHtml(item, cat, inSearch) {
  const prices = item.prices || (item.price ? [{ price: item.price }] : []);
  const hasPriceValues = prices.some((p) => p.price && String(p.price).trim());
  const name = tx(item.name);
  const tag = cat.itemTag ? tx(cat.itemTag) : (inSearch ? tx(cat.name) : "");

  const thumbHtml = item.image
    ? `<div class="thumb">
        <img data-thumb loading="lazy" decoding="async"
          src="${esc(imgSrc(item.image, ID))}" alt="${esc(name)}">
      </div>`
    : "";
  // no-thumb: text-only card when the item has no photo
  const cls = (item.image ? "" : " no-thumb") + (cat.variant ? ` item--${esc(cat.variant)}` : "");

  return `
    <li class="item${cls}">
      ${thumbHtml}
      <div class="ibody">
        ${tag ? `<span class="cat-tag">${esc(tag)}</span>` : ""}
        <h3>${esc(name)}</h3>
        ${item.description ? `<p class="desc">${esc(tx(item.description))}</p>` : ""}
        ${item.allergens ? `<p class="allerg">${esc(tx(item.allergens))}</p>` : ""}
        ${hasPriceValues ? `<div class="prices">${priceHtml(prices)}</div>` : ""}
      </div>
    </li>`;
}

const listHtml = (inner) =>
  `<ul class="items${DATA.layout === "rows" ? " items--rows" : ""}">${inner}</ul>`;

const menuNoteHtml = () =>
  DATA.menuNote ? `<p class="menu-note">${esc(tx(DATA.menuNote))}</p>` : "";

function showItems(html, variant = "") {
  const menu = $("#menu");
  menu.dataset.variant = variant;
  menu.innerHTML = html;
  hydrateImages(menu);
  // stagger the entrance animation of the cards (capped so long lists stay snappy)
  menu.querySelectorAll(".item").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 8)));
}

function renderCategory(cat) {
  const img = cat.bannerImage
    ? `<img data-vanish src="${esc(imgSrc(cat.bannerImage, ID))}" alt=""
         ${cat.bannerPosition ? `style="object-position:${esc(cat.bannerPosition)}"` : ""}>`
    : "";
  const hero = `
    <div class="cat-hero${img ? "" : " cat-hero--plain"}" data-plain="cat-hero--plain">
      ${img}
      <div class="cat-hero-text">
        ${cat.caption ? `<span class="cat-caption">${esc(tx(cat.caption))}</span>` : ""}
        <h2>${twoTone(tx(cat.name))}</h2>
        ${cat.description ? `<p>${esc(tx(cat.description))}</p>` : ""}
      </div>
    </div>`;
  const body = (cat.items && cat.items.length)
    ? listHtml(cat.items.map((it) => itemHtml(it, cat)).join("")) + (addonsCat() ? "" : menuNoteHtml())
    : `<p class="empty">${esc(ui("soon"))}</p>`;
  showItems(hero + body, cat.variant || "");
}

/* "addons": { "title": …, "items": [...] } — a small tile grid that stays
   under every category (drinks, sides…), not a tab of its own */
const addonsCat = () => DATA.addons && (DATA.addons.items || []).length
  ? { name: DATA.addons.title, items: DATA.addons.items, variant: "addons" }
  : null;

function renderAddons() {
  document.querySelectorAll(".addons").forEach((el) => el.remove());
  const cat = addonsCat();
  if (!cat) return;
  $("#menu").insertAdjacentHTML("afterend", `
    <section class="addons">
      <h2 class="addons-title">${twoTone(tx(cat.name))}</h2>
      <ul class="items items--tiles">${cat.items.map((it) => itemHtml(it, cat)).join("")}</ul>
      ${menuNoteHtml()}
    </section>`);
  hydrateImages($(".addons"));
}

function renderSearch(q) {
  const needle = q.toLowerCase();
  const hits = [...DATA.categories, addonsCat()].filter(Boolean).flatMap((c) =>
    (c.items || [])
      .filter((it) => [it.name, it.description, it.allergens].map(allText).join(" ")
        .toLowerCase().includes(needle))
      .map((it) => ({ it, cat: c })));
  const body = hits.length
    ? listHtml(hits.map(({ it, cat }) => itemHtml(it, cat, true)).join(""))
    : `<p class="empty">${esc(ui("none")).replace("{q}", esc(q))}</p>`;
  showItems(
    `<div class="results-head"><h2>${esc(ui("results"))}</h2><span>${hits.length}</span></div>` + body
  );
}

function showError(detail) {
  ["#cover", "#identity", "#tabsbar", "#menu", "#foot"].forEach((s) => ($(s).hidden = true));
  $("#error-detail").textContent = detail;
  $("#error").hidden = false;
  document.title = "Menu unavailable";
}

/* ---------- Header: cover, brand, hours, tagline ---------- */

/* Current hour (0–23) in the cafe's time zone, falling back to the device's */
function hourNow(tz) {
  try {
    return Number(new Intl.DateTimeFormat("en-GB",
      { hour: "numeric", hourCycle: "h23", timeZone: tz || undefined }).format(new Date()));
  } catch {
    return new Date().getHours();
  }
}

/* "hours": { "open": 13, "close": 2, "openText": …, "closedText": … } — close may pass midnight */
function hoursHtml() {
  const h = DATA.hours;
  if (!h) return "";
  const now = hourNow(DATA.timeZone);
  const isOpen = h.open < h.close
    ? now >= h.open && now < h.close
    : now >= h.open || now < h.close;
  return `<span class="hours-pill ${isOpen ? "is-open" : "is-closed"}">
      <span class="hours-dot" aria-hidden="true"></span>${esc(tx(isOpen ? h.openText : h.closedText))}
    </span>`;
}

function langToggleHtml() {
  if (LANGS.length < 2) return "";
  const next = LANGS[(LANGS.indexOf(LANG) + 1) % LANGS.length];
  return `<button class="lang-btn" type="button" data-lang="${esc(next)}" lang="${esc(next)}">${esc(ui("toggle", next))}</button>`;
}

function renderHeader() {
  const name = tx(DATA.cafeName) || "Menu";
  const brand = DATA.hideIdentity ? "" : `
    ${DATA.logo ? `<img class="brand-logo" src="${esc(imgSrc(DATA.logo, ID))}" alt="${esc(name)}">` : ""}
    <h1 class="cafe-name">${twoTone(name)}</h1>
    ${DATA.subtitle ? `<p class="cafe-subtitle">${esc(tx(DATA.subtitle))}</p>` : ""}
    ${hoursHtml()}`;
  const cover = $("#cover");
  const identity = $("#identity");

  if (DATA.coverImage) {
    /* Cover — photo with the identity laid over its bottom edge.
       The photo is created once so a language switch doesn't reload it. */
    if (!cover.querySelector(":scope > img")) {
      cover.innerHTML = `<img data-vanish src="${esc(imgSrc(DATA.coverImage, ID))}"
        alt="" fetchpriority="high"
        ${DATA.coverPosition ? `style="object-position:${esc(DATA.coverPosition)}"` : ""}>`;
    }
    cover.querySelectorAll(".cover-brand, .lang-btn").forEach((el) => el.remove());
    cover.insertAdjacentHTML("beforeend",
      langToggleHtml() + (brand ? `<div class="cover-brand">${brand}</div>` : ""));
    cover.hidden = false;
    identity.hidden = true;
  } else {
    identity.innerHTML = langToggleHtml() + brand;
    identity.hidden = !identity.innerHTML.trim();
  }

  /* Warning badge + tagline — right under the cover (or identity) */
  document.querySelectorAll(".extras").forEach((el) => el.remove());
  const extras =
    (DATA.badge ? `<p class="cafe-badge"><span>${esc(tx(DATA.badge))}</span></p>` : "") +
    (DATA.tagline ? `<p class="cafe-tagline">${esc(tx(DATA.tagline))}</p>` : "");
  if (extras) {
    (DATA.coverImage ? cover : identity)
      .insertAdjacentHTML("afterend", `<div class="extras">${extras}</div>`);
  }
}

/* ---------- Location + Social HTML ---------- */

function locationsSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/>
    <circle cx="12" cy="10" r="3"/></svg>`;
}
function phoneSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.09 6.09l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z"/>
  </svg>`;
}

/* A location's "phone" can be one number (round call button) or a list
   (each number becomes its own tap-to-call pill). */
function buildLocations(locations) {
  if (!locations || !locations.length) return "";
  const title = tx(DATA.visitTitle) || ui("branches");
  return `<h2 class="visit-title">${esc(title)}</h2>
    <ul class="locations">` +
    locations.map((loc) => {
      const city = tx(loc.city);
      const phones = [].concat(loc.phone || []);
      const single = phones.length === 1 ? phones[0] : "";
      return `
      <li class="location">
        <div class="location-body">
          <div class="location-city">${esc(city)}</div>
          ${loc.address ? `<div class="location-addr">${esc(tx(loc.address))}</div>` : ""}
          ${loc.hours ? `<div class="location-addr location-hours">${esc(tx(loc.hours))}</div>` : ""}
          ${single ? `<div class="location-num">${esc(single)}</div>` : ""}
          ${phones.length > 1 ? `<div class="location-phones">${phones.map((p) => `
            <a class="location-phone" href="tel:${esc(p)}">${phoneSvg()}<span>${esc(p)}</span></a>`).join("")}
          </div>` : ""}
        </div>
        <div class="location-actions">
          ${loc.map ? `<a class="location-map" href="${esc(loc.map)}" target="_blank" rel="noopener"
              aria-label="${esc(city)} — Google Maps" title="Google Maps">${locationsSvg()}</a>` : ""}
          ${single ? `<a class="location-call" href="tel:${esc(single)}"
              aria-label="${esc(city)} ${esc(single)}">${phoneSvg()}</a>` : ""}
        </div>
      </li>`;
    }).join("") + `</ul>`;
}

/* Social icons (outline style, 24×24) — shown in this order */
const SOCIAL = {
  instagram: {
    label: "Instagram",
    svg: `<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.5"/><path d="M16.5 7.5v.01"/>`,
  },
  tiktok: {
    label: "TikTok",
    svg: `<path d="M21 7.9v4a10 10 0 0 1-5-1.9v4.5a6.5 6.5 0 1 1-8-6.3v4.3a2.5 2.5 0 1 0 4 2V3h4.1A6 6 0 0 0 21 7.9Z"/>`,
  },
  whatsapp: {
    label: "WhatsApp",
    svg: `<path d="m3 21 1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>`,
    // JSON may hold a phone number (any format) or a full link
    href: (v) => /^https?:/i.test(v) ? v : `https://wa.me/${String(v).replace(/\D/g, "")}`,
  },
  facebook: {
    label: "Facebook",
    svg: `<path d="M7 10v4h3v7h4v-7h3l1-4h-4V8a1 1 0 0 1 1-1h3V3h-3a5 5 0 0 0-5 5v2H7"/>`,
  },
};

function buildSocial(social) {
  if (!social) return "";
  const links = Object.entries(SOCIAL)
    .filter(([key]) => social[key])
    .map(([key, s]) => `
      <a class="social-link" href="${esc(s.href ? s.href(social[key]) : social[key])}"
        target="_blank" rel="noopener" aria-label="${s.label}" title="${s.label}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${s.svg}</svg>
      </a>`);
  return links.length ? `<div class="social-row">${links.join("")}</div>` : "";
}

/* Branches + social — at the bottom, above the footer */
function renderVisit() {
  document.querySelectorAll(".visit").forEach((el) => el.remove());
  const html = buildLocations(DATA.locations) + buildSocial(DATA.social);
  if (html) $("#foot").insertAdjacentHTML("beforebegin", `<section class="visit">${html}</section>`);
}

function renderFooter() {
  const text = tx(DATA.footerText) || tx(DATA.cafeName) || "";
  $("#foot-text").textContent = text.replace("{year}", new Date().getFullYear());
  $("#foot").hidden = false;
}

/* ---------- Tabs, search, language ---------- */

function renderTabs() {
  $("#tabs").innerHTML = DATA.categories
    .map((c, i) =>
      `<button class="tab" role="tab" aria-selected="${i === active}" data-i="${i}">${esc(tx(c.name))}</button>`)
    .join("");
  $("#tabsbar").hidden = false;
}

function select(i, scroll = true) {
  active = i;
  const tabsEl = $("#tabs");
  tabsEl.querySelectorAll(".tab").forEach((t, j) =>
    t.setAttribute("aria-selected", String(i === j)));
  closeSearch(true);
  renderCategory(DATA.categories[i]);
  tabsEl.children[i].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  if (scroll) $("#menu").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeSearch(silent) {
  $("#search-input").value = "";
  $("#searchbox").hidden = true;
  $("#search-btn").setAttribute("aria-expanded", "false");
  if (!silent) select(active, false);
}

function applyLanguage() {
  const root = document.documentElement;
  root.lang = LANG;
  root.dir = RTL_LANGS.includes(LANG) ? "rtl" : "ltr";
  $("#search-input").placeholder = ui("search");
  document.title = `${tx(DATA.cafeName)} — Menu`;
}

function renderAll() {
  applyLanguage();
  renderHeader();
  renderTabs();
  renderAddons();
  renderVisit();
  renderFooter();
  hydrateImages(document);
  select(active, false);
}

function setLanguage(lang) {
  LANG = lang;
  try { localStorage.setItem(`menu-lang:${ID}`, lang); } catch { /* storage blocked — fine */ }
  renderAll();
}

function addStylesheet(href) {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = link.onerror = resolve;
    document.head.append(link);
    setTimeout(resolve, 1500); // never block the menu on a slow stylesheet
  });
}

/* ---------- Boot ---------- */

(async function load() {
  ID = cafeId();
  try {
    try {
      const res = await fetch(`${ROOT}cafes/${encodeURIComponent(ID)}/menu-data.json`);
      if (!res.ok) throw new Error(`No menu found for "${ID}" (HTTP ${res.status}).`);
      DATA = await res.json();
    } catch (err) {
      // file:// blocks fetch — fall back to a bundled copy (menu-data.js), if present
      if (!window.MENU_DATA) throw err;
      DATA = window.MENU_DATA;
    }
    if (!DATA || !Array.isArray(DATA.categories))
      throw new Error("menu-data.json is missing a categories array.");
  } catch (err) {
    showError(err.message);
    return;
  }

  CUR = { symbol: DATA.currency ?? "€", after: DATA.currencyPosition === "after" };

  /* Languages: "languages": ["ar", "en"] enables the toggle; older single-language
     menus just set "rtl": true for Arabic. Choice order: ?lang= → last used → default. */
  LANGS = DATA.languages || [DATA.rtl ? "ar" : "en"];
  let saved = null;
  try { saved = localStorage.getItem(`menu-lang:${ID}`); } catch { /* ignore */ }
  const wanted = new URLSearchParams(location.search).get("lang") || saved || DATA.defaultLanguage;
  LANG = LANGS.includes(wanted) ? wanted : LANGS[0];

  /* Theme */
  const root = document.documentElement;
  root.dataset.cafe = ID;
  if (DATA.themeColor) {
    root.style.setProperty("--accent", DATA.themeColor);
    $("#meta-theme").setAttribute("content", DATA.themeColor);
  }
  if (DATA.bgColor)   root.style.setProperty("--bg",   DATA.bgColor);
  if (DATA.cardColor) root.style.setProperty("--card", DATA.cardColor);
  if (DATA.inkColor)  root.style.setProperty("--ink",  DATA.inkColor);

  /* Optional per-cafe fonts + stylesheet (e.g. "fonts": "<Google Fonts URL>",
     "stylesheet": "theme.css" inside the cafe folder) */
  if (DATA.fonts) addStylesheet(DATA.fonts);
  if (DATA.stylesheet) await addStylesheet(imgSrc(DATA.stylesheet, ID));

  /* Listeners — attached once; renderAll() can run again on a language switch */
  $("#tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (t) select(Number(t.dataset.i));
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".lang-btn");
    if (b) setLanguage(b.dataset.lang);
  });

  const box = $("#searchbox"), input = $("#search-input"), btn = $("#search-btn");
  btn.addEventListener("click", () => {
    box.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    input.focus();
  });
  $("#search-close").addEventListener("click", () => closeSearch(false));
  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (q) renderSearch(q);
    else renderCategory(DATA.categories[active]);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSearch(false); });

  /* First paint */
  renderAll();
})();
