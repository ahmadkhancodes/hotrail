import { chromium } from "@playwright/test";
import fs from "node:fs";
const [,, out, w, ...names] = process.argv; const d = "docs/qa/design";
const cols = Number(process.env.COLS ?? 3), cw = Number(process.env.CW ?? 480);
const html = `<body style="margin:0;display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:4px;background:#888">${names.map(n => `<div style="position:relative;height:${Number(process.env.H ?? cw*0.75)}px;overflow:hidden;background:#fff"><img style="width:${cw}px;display:block" src="data:image/png;base64,${fs.readFileSync(`${d}/${n}-${w}.png`).toString("base64")}"><b style="position:absolute;top:0;right:0;background:#f0f;color:#fff;font:14px sans-serif">${n}</b></div>`).join("")}</body>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: cols*cw+8, height: 400 } }); await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close();
