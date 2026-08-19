// Turn a stream of swaps into round-trip positions: the unit a trader
// actually thinks in ("I was in DOGA for two hours"), not raw transactions.
import { readFileSync, writeFileSync } from 'node:fs';

const swaps = JSON.parse(readFileSync('v0/data/swaps.json', 'utf8'));
const solPx = JSON.parse(readFileSync('v0/data/sol-prices.json', 'utf8'));
const DUST_FRACTION = 0.01; // <1% of peak size left over counts as flat

function solUsd(ts) {
  const hour = Math.floor(ts / 3600) * 3600;
  for (let h = hour, i = 0; i < 48; h -= 3600, i++) if (solPx[h] != null) return solPx[h];
  return null;
}
function usdOf(s) {
  if (s.quoteSym === 'USDC' || s.quoteSym === 'USDT') return s.quoteAmt;
  if (s.quoteSym === 'SOL') { const p = solUsd(s.time); return p == null ? null : s.quoteAmt * p; }
  return null;
}

const byToken = new Map();
for (const s of swaps) {
  if (s.kind === 'direct_swap') continue;
  if (!byToken.has(s.token)) byToken.set(s.token, []);
  byToken.get(s.token).push(s);
}

const positions = [], orphanSells = [];

for (const [token, list] of byToken) {
  list.sort((a, b) => a.time - b.time);
  let cur = null;
  const openPos = s => ({
    token, entryTime: s.time, exitTime: null, buys: [], sells: [],
    tokensHeld: 0, peakTokens: 0, costUsd: 0, proceedsUsd: 0, feeSol: 0, venues: new Set(),
  });

  for (const s of list) {
    const usd = usdOf(s);
    if (s.kind === 'buy') {
      if (!cur) cur = openPos(s);
      cur.buys.push({ time: s.time, tokens: s.tokenAmt, usd, quote: s.quoteSym, sig: s.sig });
      cur.tokensHeld += s.tokenAmt;
      cur.peakTokens = Math.max(cur.peakTokens, cur.tokensHeld);
      if (usd != null) cur.costUsd += usd;
      cur.feeSol += s.fee; cur.venues.add(s.venue);
    } else if (s.kind === 'sell') {
      if (!cur) { orphanSells.push({ token, sig: s.sig, iso: s.iso, usd }); continue; }
      cur.sells.push({ time: s.time, tokens: s.tokenAmt, usd, quote: s.quoteSym, sig: s.sig });
      cur.tokensHeld -= s.tokenAmt;
      if (usd != null) cur.proceedsUsd += usd;
      cur.feeSol += s.fee; cur.venues.add(s.venue);
      cur.exitTime = s.time;
      if (cur.tokensHeld <= cur.peakTokens * DUST_FRACTION) { cur.closed = true; positions.push(cur); cur = null; }
    }
  }
  if (cur) { cur.closed = false; positions.push(cur); }
}

positions.sort((a, b) => a.entryTime - b.entryTime);

const out = positions.map(p => {
  const holdSec = (p.closed ? p.exitTime : Math.floor(Date.now() / 1000)) - p.entryTime;
  const pnlUsd = p.closed ? p.proceedsUsd - p.costUsd : null;
  return {
    token: p.token,
    entryTime: p.entryTime, entryIso: new Date(p.entryTime * 1000).toISOString(),
    exitTime: p.exitTime, exitIso: p.exitTime ? new Date(p.exitTime * 1000).toISOString() : null,
    closed: p.closed, holdSec, holdHours: +(holdSec / 3600).toFixed(2),
    numBuys: p.buys.length, numSells: p.sells.length,
    costUsd: +p.costUsd.toFixed(2), proceedsUsd: +p.proceedsUsd.toFixed(2),
    pnlUsd: pnlUsd == null ? null : +pnlUsd.toFixed(2),
    pnlPct: pnlUsd == null || p.costUsd === 0 ? null : +((pnlUsd / p.costUsd) * 100).toFixed(2),
    feeSol: +p.feeSol.toFixed(5), venues: [...p.venues],
    buys: p.buys, sells: p.sells,
  };
});

writeFileSync('v0/data/positions.json', JSON.stringify(out, null, 2));

const closed = out.filter(p => p.closed && p.pnlUsd != null);
const wins = closed.filter(p => p.pnlUsd > 0), losses = closed.filter(p => p.pnlUsd <= 0);
const sum = a => a.reduce((x, y) => x + y, 0);
const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

console.log(`positions:      ${out.length}  (closed ${closed.length}, open ${out.length - closed.length})`);
console.log(`partial exits:  ${closed.filter(p => p.numSells > 1).length} positions sold in more than one clip`);
console.log(`scaled in:      ${closed.filter(p => p.numBuys > 1).length} positions bought in more than one clip`);
console.log(`\nwin rate:       ${((wins.length / closed.length) * 100).toFixed(1)}%  (${wins.length}W / ${losses.length}L)`);
console.log(`total invested: $${sum(closed.map(p => p.costUsd)).toFixed(2)}`);
console.log(`net realised:   $${sum(closed.map(p => p.pnlUsd)).toFixed(2)}`);
console.log(`avg win:        $${wins.length ? (sum(wins.map(p => p.pnlUsd)) / wins.length).toFixed(2) : 0}`);
console.log(`avg loss:       $${losses.length ? (sum(losses.map(p => p.pnlUsd)) / losses.length).toFixed(2) : 0}`);
console.log(`\nmedian hold (winners): ${med(wins.map(p => p.holdHours)).toFixed(2)}h`);
console.log(`median hold (losers):  ${med(losses.map(p => p.holdHours)).toFixed(2)}h`);
console.log(`median position size:  $${med(closed.map(p => p.costUsd)).toFixed(2)}`);
if (orphanSells.length) console.log(`\nsells with no matching buy (airdrops/pre-window): ${orphanSells.length}`);
