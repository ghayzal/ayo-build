// Is "the token fell after you sold" evidence of exit skill, or just the base
// rate for memecoins? Compare the forward return from the exit hour against the
// forward return from EVERY hour of that same token's life. If exits look like
// a random hour, there is no skill in the timing and the drift number is noise.
import { readFileSync } from 'node:fs';

const positions = JSON.parse(readFileSync('v0/data/positions.json', 'utf8'));
const prices = JSON.parse(readFileSync('v0/data/token-prices.json', 'utf8'));
const H = 24 * 3600;
const MIN_CANDLES = 48;

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const exitRets = [], baseRets = [], perToken = [];

for (const p of positions) {
  if (!p.closed || !p.exitTime) continue;
  const rec = prices[p.token];
  if (!rec?.candles?.length || rec.candles.length < MIN_CANDLES) continue;
  const map = new Map(rec.candles.map(c => [c[0], c[4]]));
  const hours = rec.candles.map(c => c[0]).sort((a, b) => a - b);

  const fwd = ts => {
    const a = map.get(Math.floor(ts / 3600) * 3600), b = map.get(Math.floor((ts + H) / 3600) * 3600);
    return a == null || b == null || a === 0 ? null : ((b - a) / a) * 100;
  };

  const all = hours.map(fwd).filter(x => x != null);
  if (all.length < MIN_CANDLES) continue;
  const atExit = fwd(p.exitTime);
  if (atExit == null) continue;

  // percentile rank of the exit hour among all hours of this token
  const rank = all.filter(x => x < atExit).length / all.length;
  exitRets.push(atExit);
  baseRets.push(median(all));
  perToken.push({ symbol: rec.symbol, atExit: +atExit.toFixed(1), base: +median(all).toFixed(1), rank: +rank.toFixed(2) });
}

console.log(`tokens with enough history for a control: ${perToken.length}\n`);
console.log(`median 24h forward return AT THE EXIT HOUR:  ${median(exitRets)?.toFixed(1)}%`);
console.log(`median 24h forward return AT A RANDOM HOUR:  ${median(baseRets)?.toFixed(1)}%`);
console.log(`\nmedian percentile rank of exit timing: ${median(perToken.map(p => p.rank))?.toFixed(2)}`);
console.log(`(0.50 = exits are indistinguishable from a coin flip; <0.50 = sold before worse-than-usual drops)\n`);

const better = perToken.filter(p => p.atExit < p.base).length;
console.log(`exits that beat that token's own typical hour: ${better}/${perToken.length}\n`);
console.log('symbol        fwd24h@exit   token median   pctile');
for (const p of perToken.sort((a, b) => a.rank - b.rank))
  console.log(`${(p.symbol || '?').padEnd(14)} ${String(p.atExit).padStart(8)}%  ${String(p.base).padStart(10)}%  ${String(p.rank).padStart(7)}`);
