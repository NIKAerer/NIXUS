// Captures d'écran du mode démo pour le README.
// Usage : npm run build && npx vite preview --port 4173 & node scripts/screenshots.cjs
const { chromium } = require("playwright");
const { mkdir } = require("node:fs/promises");

const BASE = process.env.NIXUS_URL ?? "http://localhost:4173";
const OUT = process.env.NIXUS_SHOTS ?? "docs/screenshots";
const SCALE = Number(process.env.NIXUS_SCALE ?? 1);

(async () => {
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: SCALE, reducedMotion: "reduce" });
const settle = async (ms = 1500) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
};
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name);
};
const nav = (label) => page.locator("nav, header").getByText(label, { exact: true }).first().click();

// Accueil
await page.goto(BASE);
await settle(4000);
await shot("home");

// Grind, Profil, Collection
for (const [label, name] of [["Grind", "grind"], ["Profil", "profile"], ["Collection", "collection"]]) {
  await nav(label);
  await settle(2500);
  await shot(name);
}

// Détail d'une partie (première carte de « Dernières parties »)
await nav("Accueil");
await settle(1500);
const card = page.locator(".tiles > *").first();
if (await card.count()) {
  await card.click();
  await settle(2500);
  await shot("match-detail");
  await page.keyboard.press("Escape");
  await settle(800);
}

// Draft : recherche → acceptation → sélection des champions
await page.getByRole("button", { name: /Trouver une partie/ }).first().click();
await page.getByRole("button", { name: /Accepter/ }).first().click({ timeout: 20000 });
await page.waitForTimeout(10000); // fin de la phase de déclaration, début des bans
await settle(1500);
await shot("draft-ban");
await page.waitForTimeout(31000); // phase de choix
await page.getByRole("button", { name: /Lee Sin/ }).first().click().catch(() => {});
await settle(2500);
await shot("draft-pick");

// Fin de partie
await page.goto(`${BASE}/?eog`);
await settle(4000);
await shot("end-of-game");

await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
