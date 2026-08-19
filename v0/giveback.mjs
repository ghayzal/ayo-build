// How much of the peak paper gain does this trader actually keep?
// Tests the brief's "profit cutting" hypothesis directly - and its opposite.
import { readFileSync } from 'node:fs';
const positions = JSON.parse(readFileSync('v0/data/positions.json', 'utf8'));
const prices = JSON.parse(readFileSync('v0/data/token-prices.json', 'utf8'));
const median = a => { if (!a.length) return null; const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
const sum = a => a.reduce((x,y)=>x+y,0);

const rows = [];
for (const p of positions) {
  if (!p.closed || p.pnlPct == null) continue;
  const rec = prices[p.token];
  if (!rec?.candles?.length) continue;
  const map = new Map(rec.candles.map(c=>[c[0],c[4]]));
  const at = ts => map.get(Math.floor(ts/3600)*3600);
  const entry = at(p.entryTime);
  if (!entry) continue;
  let peak = entry, peakT = p.entryTime;
  for (const [t,v] of map) if (t >= p.entryTime && t <= p.exitTime && v > peak) { peak = v; peakT = t; }
  const peakGainPct = ((peak - entry) / entry) * 100;
  if (peakGainPct < 1) continue; // never went meaningfully green
  const kept = p.pnlPct / peakGainPct;
  rows.push({
    symbol: rec.symbol || p.token.slice(0,6),
    costUsd: p.costUsd, pnlUsd: p.pnlUsd, pnlPct: p.pnlPct,
    peakGainPct: +peakGainPct.toFixed(1),
    peakAtHours: +(((peakT - p.entryTime)/3600)).toFixed(1),
    holdHours: p.holdHours,
    keptFraction: +kept.toFixed(2),
    unrealisedAtPeakUsd: +(p.costUsd * peakGainPct/100).toFixed(2),
  });
}

rows.sort((a,b)=>b.unrealisedAtPeakUsd - a.unrealisedAtPeakUsd);
console.log(`positions that were meaningfully green at some point: ${rows.length}\n`);
console.log(`median peak paper gain:        +${median(rows.map(r=>r.peakGainPct))?.toFixed(1)}%`);
console.log(`median realised result:        ${median(rows.map(r=>r.pnlPct))?.toFixed(1)}%`);
console.log(`median fraction of peak kept:  ${median(rows.map(r=>r.keptFraction))?.toFixed(2)}`);
console.log(`median hours to peak:          ${median(rows.map(r=>r.peakAtHours))?.toFixed(1)}h`);
console.log(`median total hold:             ${median(rows.map(r=>r.holdHours))?.toFixed(1)}h`);
console.log(`\npositions that peaked >25% up and still closed red: ${rows.filter(r=>r.peakGainPct>25 && r.pnlUsd<0).length}/${rows.filter(r=>r.peakGainPct>25).length}`);
const giveback = rows.filter(r=>r.peakGainPct>25 && r.pnlUsd<0);
console.log(`dollars handed back by those:  $${sum(giveback.map(r=>r.unrealisedAtPeakUsd - r.pnlUsd)).toFixed(2)}`);

console.log(`\nsymbol         size   peak gain   peak@   held    kept    P&L`);
for (const r of rows.slice(0,15))
  console.log(`${r.symbol.padEnd(14)} $${String(r.costUsd).padStart(5)}  ${('+'+r.peakGainPct+'%').padStart(9)}  ${String(r.peakAtHours+'h').padStart(6)}  ${String(r.holdHours+'h').padStart(7)}  ${String(r.keptFraction).padStart(6)}  ${String(r.pnlUsd).padStart(7)}`);
