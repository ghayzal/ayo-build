// Put a dollar figure on each behaviour, using the capital actually at risk.
import { readFileSync } from 'node:fs';
const cf = JSON.parse(readFileSync('v0/data/counterfactuals.json', 'utf8'));
const positions = JSON.parse(readFileSync('v0/data/positions.json', 'utf8'));
const prices = JSON.parse(readFileSync('v0/data/token-prices.json', 'utf8'));
const sum = a => a.reduce((x, y) => x + y, 0);
const median = a => { if (!a.length) return null; const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };

console.log('=== DOLLAR COST OF ROTATING (vs holding what they sold) ===');
for (const h of ['6h', '24h', '3d']) {
  const rows = cf.rotations.filter(r => r[`edge_${h}`] != null && r.capitalUsd);
  if (!rows.length) continue;
  const cost = sum(rows.map(r => r.capitalUsd * (r[`edge_${h}`] / 100)));
  console.log(`${h.padEnd(4)} n=${String(rows.length).padStart(2)}  capital $${sum(rows.map(r=>r.capitalUsd)).toFixed(0).padStart(5)}  net effect of rotating: $${cost.toFixed(2)}`);
}

console.log('\n=== THE FOUR OVERSIZED POSITIONS ===');
const closed = positions.filter(p => p.closed && p.pnlUsd != null);
const sizes = closed.map(p => p.costUsd).sort((a,b)=>a-b);
const p75 = sizes[Math.floor(sizes.length*0.75)];
const big = closed.filter(p => p.costUsd > p75*1.5).sort((a,b)=>a.pnlUsd-b.pnlUsd);
console.log(`size threshold: $${(p75*1.5).toFixed(0)}  |  median position: $${median(sizes).toFixed(0)}`);
for (const p of big) {
  const s = prices[p.token]?.symbol || p.token.slice(0,6);
  console.log(`  ${s.padEnd(12)} $${String(p.costUsd).padStart(6)} in  ->  P&L $${String(p.pnlUsd).padStart(8)}  (${p.pnlPct}%)  held ${p.holdHours}h  ${p.numBuys} buys / ${p.numSells} sells`);
}
console.log(`  ${''.padEnd(12)} ${'-'.repeat(46)}`);
console.log(`  ${'TOTAL'.padEnd(12)} $${sum(big.map(p=>p.costUsd)).toFixed(0).padStart(6)} in  ->  P&L $${sum(big.map(p=>p.pnlUsd)).toFixed(2).padStart(8)}`);
console.log(`  all other trades: $${sum(closed.filter(p=>!big.includes(p)).map(p=>p.costUsd)).toFixed(0)} in -> P&L $${sum(closed.filter(p=>!big.includes(p)).map(p=>p.pnlUsd)).toFixed(2)}`);

console.log('\n=== BIGGEST SINGLE LOSS ===');
const worst = closed.sort((a,b)=>a.pnlUsd-b.pnlUsd)[0];
const ws = prices[worst.token]?.symbol || worst.token.slice(0,6);
console.log(`${ws}: $${worst.costUsd} in, $${worst.proceedsUsd} out, P&L $${worst.pnlUsd} (${worst.pnlPct}%)`);
console.log(`entered ${worst.entryIso}, exited ${worst.exitIso}, held ${worst.holdHours}h`);
console.log(`${worst.numBuys} buys, ${worst.numSells} sells`);
const rec = prices[worst.token];
if (rec?.candles?.length) {
  const map = new Map(rec.candles.map(c=>[c[0],c[4]]));
  const at = ts => map.get(Math.floor(ts/3600)*3600);
  const entry = at(worst.entryTime);
  let peak = 0, peakT = null;
  for (const [t,v] of map) if (t>=worst.entryTime && t<=worst.exitTime && v>peak) { peak=v; peakT=t; }
  if (entry && peak) {
    console.log(`price at entry: ${entry.toExponential(3)}`);
    console.log(`peak while held: ${peak.toExponential(3)} (+${(((peak-entry)/entry)*100).toFixed(0)}%) at ${new Date(peakT*1000).toISOString()}`);
    console.log(`that peak came ${(((peakT-worst.entryTime)/3600)).toFixed(1)}h after entry, and they held ${worst.holdHours}h total`);
    const ex = at(worst.exitTime);
    if (ex) console.log(`price at exit: ${ex.toExponential(3)} (${(((ex-peak)/peak)*100).toFixed(0)}% off the peak they saw)`);
  }
}
