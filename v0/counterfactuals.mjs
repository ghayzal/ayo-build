// Two counterfactuals:
//   1. Post-exit drift  - what did the token do AFTER you sold it?
//   2. Rotation compare - holding A vs the B you rotated into.
// Both ends of every comparison are read off the same OHLCV series, so we are
// never mixing execution price with index price. Missing candles stay null
// rather than being interpolated into a confident-looking lie.
import { readFileSync, writeFileSync } from 'node:fs';

const positions = JSON.parse(readFileSync('v0/data/positions.json', 'utf8'));
const prices = JSON.parse(readFileSync('v0/data/token-prices.json', 'utf8'));
const behavior = JSON.parse(readFileSync('v0/data/behavior.json', 'utf8'));

const HORIZONS = [
  ['1h', 3600], ['6h', 6 * 3600], ['24h', 86400], ['3d', 3 * 86400], ['7d', 7 * 86400],
];
const TOLERANCE = 2 * 3600; // a candle must be within 2h of the target time

const series = {};
for (const [token, v] of Object.entries(prices)) {
  series[token] = { symbol: v.symbol, map: new Map((v.candles || []).map(c => [c[0], c[4]])) };
}
const sym = t => series[t]?.symbol || t.slice(0, 6);

function priceAt(token, ts) {
  const s = series[token];
  if (!s || !s.map.size) return null;
  const hour = Math.floor(ts / 3600) * 3600;
  for (let d = 0; d <= TOLERANCE; d += 3600) {
    if (s.map.has(hour - d)) return s.map.get(hour - d);
    if (s.map.has(hour + d)) return s.map.get(hour + d);
  }
  return null;
}
const ret = (a, b) => (a == null || b == null || a === 0 ? null : ((b - a) / a) * 100);

// ---------- 1. post-exit drift ----------
const drift = [];
for (const p of positions) {
  if (!p.closed || !p.exitTime) continue;
  const base = priceAt(p.token, p.exitTime);
  if (base == null) { drift.push({ token: p.token, symbol: sym(p.token), exitIso: p.exitIso, missing: true }); continue; }
  const row = { token: p.token, symbol: sym(p.token), exitIso: p.exitIso, holdHours: p.holdHours,
                pnlPct: p.pnlPct, pnlUsd: p.pnlUsd, costUsd: p.costUsd, missing: false };
  for (const [label, secs] of HORIZONS) row[label] = ret(base, priceAt(p.token, p.exitTime + secs));
  drift.push(row);
}

// ---------- 2. rotation counterfactual ----------
const rots = [];
for (const r of behavior.rotations) {
  const aBase = priceAt(r.from, r.fromExitTime);
  const bBase = priceAt(r.to, r.toEntryTime);
  const row = {
    fromSym: sym(r.from), toSym: sym(r.to), gapMin: r.gapMin,
    exitIso: new Date(r.fromExitTime * 1000).toISOString(),
    capitalUsd: r.toCostUsd, missing: aBase == null || bBase == null,
  };
  for (const [label, secs] of HORIZONS) {
    const held = ret(aBase, priceAt(r.from, r.fromExitTime + secs));
    const got = ret(bBase, priceAt(r.to, r.toEntryTime + secs));
    row[`held_${label}`] = held;
    row[`got_${label}`] = got;
    row[`edge_${label}`] = held == null || got == null ? null : got - held;
  }
  rots.push(row);
}

writeFileSync('v0/data/counterfactuals.json', JSON.stringify({ drift, rotations: rots }, null, 2));

const f = n => (n == null ? '  n/a' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%');
const stats = (arr, key) => {
  const v = arr.map(x => x[key]).filter(x => x != null);
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return { n: v.length, median: s[Math.floor(s.length / 2)], mean: v.reduce((a, b) => a + b, 0) / v.length,
           up: v.filter(x => x > 0).length };
};

console.log('=== POST-EXIT DRIFT: what the token did after this trader sold ===');
console.log(`positions with usable price data: ${drift.filter(d => !d.missing).length}/${drift.length}\n`);
console.log('horizon   n   median   mean    kept rising');
for (const [label] of HORIZONS) {
  const s = stats(drift.filter(d => !d.missing), label);
  if (!s) { console.log(`${label.padEnd(9)} no data`); continue; }
  console.log(`${label.padEnd(9)} ${String(s.n).padStart(2)}  ${f(s.median).padStart(7)}  ${f(s.mean).padStart(7)}   ${s.up}/${s.n}`);
}

const winners = drift.filter(d => !d.missing && d.pnlUsd > 0);
const losers = drift.filter(d => !d.missing && d.pnlUsd <= 0);
console.log('\nsplit by how the trade ended:');
for (const [name, set] of [['winners sold', winners], ['losers sold', losers]]) {
  const s = stats(set, '24h');
  console.log(`  ${name.padEnd(14)} n=${set.length}  median 24h after exit: ${s ? f(s.median) : 'n/a'}`);
}

console.log('\n=== ROTATION COUNTERFACTUAL: holding A vs the B you bought ===');
const usable = rots.filter(r => !r.missing);
console.log(`rotations with usable price data: ${usable.length}/${rots.length}\n`);
console.log('horizon   n   median edge   times the NEW token beat holding');
for (const [label] of HORIZONS) {
  const s = stats(usable, `edge_${label}`);
  if (!s) { console.log(`${label.padEnd(9)} no data`); continue; }
  console.log(`${label.padEnd(9)} ${String(s.n).padStart(2)}  ${f(s.median).padStart(9)}     ${s.up}/${s.n}`);
}
