// Same control applied to ENTRIES, plus the FOMO test from the brief:
// how far had the token already run before this trader bought it?
import { readFileSync } from 'node:fs';

const positions = JSON.parse(readFileSync('v0/data/positions.json', 'utf8'));
const prices = JSON.parse(readFileSync('v0/data/token-prices.json', 'utf8'));
const H = 24 * 3600;
const MIN_CANDLES = 48;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const rows = [];
for (const p of positions) {
  const rec = prices[p.token];
  if (!rec?.candles?.length || rec.candles.length < MIN_CANDLES) continue;
  const map = new Map(rec.candles.map(c => [c[0], c[4]]));
  const hours = rec.candles.map(c => c[0]).sort((a, b) => a - b);
  const at = ts => map.get(Math.floor(ts / 3600) * 3600);
  const fwd = ts => { const a = at(ts), b = at(ts + H); return a == null || b == null || a === 0 ? null : ((b - a) / a) * 100; };

  const all = hours.map(fwd).filter(x => x != null);
  const atEntry = fwd(p.entryTime);
  if (atEntry == null || all.length < MIN_CANDLES) continue;

  // run-up before entry: 6h and 24h prior
  const e = at(p.entryTime);
  const p6 = at(p.entryTime - 6 * 3600), p24 = at(p.entryTime - H);
  const runup6 = e == null || p6 == null || p6 === 0 ? null : ((e - p6) / p6) * 100;
  const runup24 = e == null || p24 == null || p24 === 0 ? null : ((e - p24) / p24) * 100;

  rows.push({
    symbol: rec.symbol, atEntry: +atEntry.toFixed(1), base: +median(all).toFixed(1),
    rank: +(all.filter(x => x < atEntry).length / all.length).toFixed(2),
    runup6: runup6 == null ? null : +runup6.toFixed(1),
    runup24: runup24 == null ? null : +runup24.toFixed(1),
    pnlUsd: p.pnlUsd, costUsd: p.costUsd, holdHours: p.holdHours,
  });
}

console.log(`positions with enough history: ${rows.length}\n`);
console.log('=== ENTRY TIMING ===');
console.log(`median 24h forward return AT THE ENTRY HOUR: ${median(rows.map(r => r.atEntry))?.toFixed(1)}%`);
console.log(`median 24h forward return AT A RANDOM HOUR:  ${median(rows.map(r => r.base))?.toFixed(1)}%`);
console.log(`median percentile rank of entry timing:      ${median(rows.map(r => r.rank))?.toFixed(2)}`);
console.log(`(0.50 = no better than a random moment; >0.50 = bought before better-than-usual moves)`);
console.log(`entries that beat that token's typical hour: ${rows.filter(r => r.atEntry > r.base).length}/${rows.length}`);

const r6 = rows.map(r => r.runup6).filter(x => x != null);
const r24 = rows.map(r => r.runup24).filter(x => x != null);
console.log(`\n=== FOMO TEST: how far had it already run when they bought? ===`);
console.log(`median run-up in the 6h before entry:  ${median(r6)?.toFixed(1)}%   (n=${r6.length})`);
console.log(`median run-up in the 24h before entry: ${median(r24)?.toFixed(1)}%   (n=${r24.length})`);
console.log(`entries after a >50% 24h run-up: ${r24.filter(x => x > 50).length}/${r24.length}`);
console.log(`entries after a >20% 6h run-up:  ${r6.filter(x => x > 20).length}/${r6.length}`);

const hot = rows.filter(r => r.runup24 != null && r.runup24 > 50);
const cold = rows.filter(r => r.runup24 != null && r.runup24 <= 50);
const sum = a => a.reduce((x, y) => x + y, 0);
console.log(`\n=== DID CHASING A RUN-UP PAY? ===`);
for (const [name, set] of [['bought after >50% run-up', hot], ['bought otherwise', cold]]) {
  if (!set.length) continue;
  const pnl = set.map(r => r.pnlUsd).filter(x => x != null);
  console.log(`${name.padEnd(26)} n=${String(set.length).padStart(2)}  net $${sum(pnl).toFixed(2).padStart(8)}  win rate ${((pnl.filter(x => x > 0).length / pnl.length) * 100).toFixed(0)}%  median entry pctile ${median(set.map(r => r.rank))?.toFixed(2)}`);
}

console.log(`\nsymbol         runup24h   fwd24h@entry   token median   pctile     P&L`);
for (const r of rows.sort((a, b) => (b.runup24 ?? -999) - (a.runup24 ?? -999)))
  console.log(`${(r.symbol || '?').padEnd(14)} ${String(r.runup24 ?? 'n/a').padStart(8)}  ${String(r.atEntry).padStart(11)}%  ${String(r.base).padStart(11)}%  ${String(r.rank).padStart(6)}  ${String(r.pnlUsd ?? 'open').padStart(7)}`);
