export const GUIDE_CSS = `
@page { size: 210mm 297mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #111;
  font-variant-numeric: tabular-nums;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@media screen {
  html, body { background: #e9e9e9; }
  .page { margin: 8mm auto; box-shadow: 0 1mm 6mm rgba(0, 0, 0, 0.18); }
}
.page { position: relative; width: 210mm; height: 297mm; overflow: hidden; background: #fff; break-after: page; }
.page:last-child { break-after: auto; }
.abs { position: absolute; }
img { display: block; }
svg { display: block; overflow: visible; }

.footer { position: absolute; left: 12mm; right: 12mm; bottom: 7mm; height: 10mm; display: flex; align-items: flex-end; gap: 4mm; }
.footer .title { font-size: 7.5pt; color: #8a8a8a; letter-spacing: 0.02em; }
.footer .folio { font-size: 16pt; font-weight: 800; line-height: 1; margin-left: auto; }
.page.even .footer { flex-direction: row-reverse; }
.page.even .footer .folio { margin-left: 0; margin-right: auto; }

.cover .name { position: absolute; left: 12mm; top: 14mm; right: 12mm; font-size: 58pt; font-weight: 800; line-height: 0.92; letter-spacing: -0.015em; text-transform: uppercase; overflow-wrap: anywhere; }
.cover .kicker { position: absolute; left: 12.5mm; top: 7.5mm; font-size: 8.5pt; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6b6b6b; }
.cover .hero { position: absolute; left: 10mm; right: 10mm; top: 52mm; bottom: 50mm; display: flex; align-items: center; justify-content: center; }
.cover .hero img { max-width: 100%; max-height: 100%; }
.facts { position: absolute; left: 12mm; bottom: 16mm; display: flex; gap: 9mm; }
.fact .v { font-size: 19pt; font-weight: 750; line-height: 1.05; }
.fact .v small { font-size: 9pt; font-weight: 500; color: #6b6b6b; margin-left: 0.8mm; }
.fact .k { font-size: 8pt; color: #6b6b6b; margin-top: 1mm; }
.brand { position: absolute; right: 12mm; bottom: 16mm; display: flex; align-items: center; gap: 2.2mm; font-size: 10.5pt; font-weight: 650; }
.brand svg { width: 6.5mm; height: 6.5mm; }
.date { position: absolute; right: 12mm; bottom: 10.5mm; font-size: 7.5pt; color: #8a8a8a; }

.h { font-size: 22pt; font-weight: 800; letter-spacing: -0.01em; line-height: 1; }
.h2 { font-size: 11pt; font-weight: 700; margin: 0 0 3.5mm; display: flex; align-items: baseline; gap: 2.5mm; }
.h2 span { font-size: 8.5pt; font-weight: 500; color: #6b6b6b; }
.sheet { position: absolute; left: 12mm; top: 14mm; width: 186mm; }

.tag { display: inline-flex; align-items: center; justify-content: center; min-width: 5.6mm; height: 4.6mm; padding: 0 1.3mm; border-radius: 1.2mm; background: #111; color: #fff; font-size: 7.5pt; font-weight: 700; line-height: 1; }
.tag.light { background: #fff; color: #111; box-shadow: inset 0 0 0 0.3mm #111; }
.qty { font-weight: 800; }

.tips { margin-top: 9mm; display: flex; flex-direction: column; gap: 4mm; }
.tip { display: flex; align-items: center; gap: 6mm; }
.tip-art { width: 30mm; height: 30mm; flex: none; border-radius: 4mm; background: #f2f3f4; display: flex; align-items: center; justify-content: center; padding: 4mm; }
.tip-art > svg { width: 100%; height: 100%; }
.tip-title { font-size: 12.5pt; font-weight: 700; line-height: 1.2; }
.tip-note { font-size: 9.5pt; color: #6b6b6b; margin-top: 1.2mm; line-height: 1.35; }
.collage { width: 100%; height: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 1mm; }
.collage > div { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 0; }
.collage img { max-width: 100%; max-height: 100%; }
.tools-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin-top: 4mm; }
.tool-card { border-radius: 4mm; background: #f2f3f4; height: 40mm; padding: 3mm 3mm 3.5mm; display: flex; flex-direction: column; align-items: center; }
.tool-card svg { width: 24mm; height: 24mm; margin: 1mm 0 auto; }
.tool-card div { font-size: 8.5pt; font-weight: 600; text-align: center; line-height: 1.25; }

.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; }
.card { position: relative; height: 48mm; border-radius: 3mm; background: #f4f5f6; padding: 2.6mm; display: flex; flex-direction: column; }
.card .img { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 1mm 0; }
.card .img img { max-width: 100%; max-height: 100%; }
.card .row { display: flex; align-items: center; gap: 1.6mm; }
.card .row .qty { font-size: 12pt; margin-left: auto; }
.card .name { font-size: 7.3pt; line-height: 1.25; color: #333; margin-top: 1mm; height: 2.5em; overflow: hidden; }

.ruler { margin: 1mm 0 5mm; }
.hw { display: flex; align-items: center; gap: 5mm; padding: 2.2mm 0; border-bottom: 0.25mm solid #e6e6e6; }
.hw:last-child { border-bottom: 0; }
.hw .actual { width: 62mm; flex: none; display: flex; align-items: center; }
.hw .qty { font-size: 13pt; width: 12mm; text-align: right; flex: none; }
.hw .name { font-size: 9pt; font-weight: 600; }
.hw .name span { display: block; font-size: 7.5pt; font-weight: 500; color: #6b6b6b; margin-top: 0.6mm; }

.frame { position: absolute; left: 10mm; top: 10mm; width: 190mm; height: 269mm; border-radius: 5mm; background: #eef5fb; box-shadow: inset 0 0 0 0.35mm #bcd6ea; }
.frame-title { position: absolute; left: 16mm; top: 14.5mm; display: flex; align-items: center; gap: 2.5mm; font-size: 12pt; font-weight: 750; }
.times { display: inline-flex; align-items: center; height: 6mm; padding: 0 2mm; border-radius: 3mm; background: #111; color: #fff; font-size: 10pt; font-weight: 800; }

.num { position: absolute; font-size: 30pt; font-weight: 800; line-height: 0.9; letter-spacing: -0.02em; }
.callout { position: absolute; background: #dfecf6; border-radius: 3mm; padding: 2mm 2.4mm; display: flex; flex-wrap: wrap; gap: 1.4mm 2.6mm; align-content: flex-start; }
.frame-page .callout { background: #fff; }
.ci { width: 18mm; height: 19mm; display: flex; flex-direction: column; align-items: center; }
.ci .thumb { width: 18mm; height: 13mm; display: flex; align-items: center; justify-content: center; }
.ci .thumb img { max-width: 100%; max-height: 100%; }
.ci .meta { display: flex; align-items: center; gap: 1mm; margin-top: 0.8mm; }
.ci .qty { font-size: 9.5pt; }
.ci .tag { height: 3.8mm; min-width: 4.6mm; font-size: 6.5pt; padding: 0 1mm; }
.ci.module { width: 30mm; height: 25mm; }
.ci.module .thumb { width: 30mm; height: 19mm; }
.ci.module .meta { font-size: 7pt; font-weight: 650; }
.tool { position: absolute; width: 13mm; height: 13mm; border-radius: 50%; background: #fff; box-shadow: inset 0 0 0 0.4mm #111; padding: 1.6mm; }
.tool span { position: absolute; left: -2mm; right: -2mm; top: 14mm; text-align: center; font-size: 7pt; font-weight: 700; white-space: nowrap; }
.art { position: absolute; }
.art > img, .art > svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.turn { position: absolute; width: 11mm; height: 11mm; }
.detail { position: absolute; border-radius: 50%; overflow: hidden; background: #fff; box-shadow: inset 0 0 0 0.6mm #111, 0 0 0 1.2mm #fff; }
.detail .art { position: absolute; }
.mirror-note { position: absolute; display: flex; align-items: center; gap: 2.5mm; font-size: 9pt; font-weight: 600; color: #333; }
.mirror-note svg { width: 9mm; height: 9mm; }
.done { position: absolute; left: 12mm; right: 12mm; top: 26mm; bottom: 40mm; display: flex; align-items: center; justify-content: center; }
.done img { max-width: 100%; max-height: 100%; }
.done-mark { position: absolute; left: 12mm; top: 14mm; width: 16mm; height: 16mm; }
`;
