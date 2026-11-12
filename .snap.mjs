import { chromium } from "@playwright/test";
const [,, route, name, ...opts] = process.argv;
const full = opts.includes("full");
const b = await chromium.launch();
for (const w of [1440, 375]) {
  const p = await b.newPage({ viewport: { width: w, height: w === 375 ? 812 : 900 } });
  await p.goto("http://localhost:3000" + route, { waitUntil: "networkidle", timeout: 120000 });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(1200);
  const of = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (of > 0) console.log("OVERFLOW", w, of);
  await p.screenshot({ path: `/tmp/aud/${name}-${w}.png`, fullPage: full });
  await p.close();
}
await b.close();
