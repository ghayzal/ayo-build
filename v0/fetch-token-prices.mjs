// Find each traded token's deepest pool and pull hourly OHLCV covering the
// trade window plus a 7-day tail (needed for counterfactual horizons).
// GeckoTerminal free tier: no key, ~30 calls/min.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const GT = 'https://api.geckoterminal.com/api/v2';
const PACE = 2200;
const TAIL = 8 * 86400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gt(path, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${GT}${path}`, { headers: { Accept: 'application/json' } });
      if (res.status === 429) { await sleep(5000 * (i + 1)); continue; }
      if (res.status === 404) return null;
      if (!res.ok) { await sleep(1500 * (i + 1)); continue; }
      return await res.json();
    } catch { await sleep(1500 * (i + 1)); }
  }
  return null;
}

const positions = JSON.parse(readFileSync('v0/data/positions.json', 'utf8'));
const need = new Map(); // token -> earliest ts we need
for (const p of positions) {
  const from = p.entryTime - 2 * 86400; // 2d before entry, for FOMO detection
  if (!need.has(p.token) || from < need.get(p.token)) need.set(p.token, from);
}

const CACHE = 'v0/data/token-prices.json';
const store = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const tokens = [...need.keys()];
console.error(`${tokens.length} tokens to price\n`);

let n = 0;
for (const token of tokens) {
  n++;
  if (store[token]?.candles?.length) { console.error(`[${n}/${tokens.length}] cached ${token.slice(0,8)}`); continue; }

  const pools = await gt(`/networks/solana/tokens/${token}/pools`);
  await sleep(PACE);
  const list = pools?.data || [];
  if (!list.length) {
    store[token] = { symbol: null, pool: null, candles: [], reason: 'no pool found' };
    console.error(`[${n}/${tokens.length}] NO POOL  ${token.slice(0,8)}`);
    writeFileSync(CACHE, JSON.stringify(store));
    continue;
  }
  const best = list.sort((a, b) =>
    Number(b.attributes?.reserve_in_usd || 0) - Number(a.attributes?.reserve_in_usd || 0))[0];
  const pool = best.attributes.address;
  const symbol = (best.attributes.name || '').split('/')[0].trim() || null;

  // walk backwards until we cover the window we need
  const wantFrom = need.get(token);
  const candles = new Map();
  let before = Math.floor(Date.now() / 1000);
  for (let page = 0; page < 4; page++) {
    const j = await gt(`/networks/solana/pools/${pool}/ohlcv/hour?aggregate=1&limit=1000&currency=usd&before_timestamp=${before}`);
    await sleep(PACE);
    const rows = j?.data?.attributes?.ohlcv_list || [];
    if (!rows.length) break;
    for (const r of rows) candles.set(r[0], { o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] });
    const oldest = Math.min(...rows.map(r => r[0]));
    if (oldest <= wantFrom) break;
    before = oldest - 1;
  }

  const arr = [...candles.entries()].map(([t, c]) => [t, c.o, c.h, c.l, c.c, c.v]).sort((a, b) => a[0] - b[0]);
  store[token] = { symbol, pool, candles: arr };
  const cov = arr.length ? `${new Date(arr[0][0]*1000).toISOString().slice(0,10)} -> ${new Date(arr[arr.length-1][0]*1000).toISOString().slice(0,10)}` : 'none';
  console.error(`[${n}/${tokens.length}] ${(symbol||'?').padEnd(12)} ${arr.length} candles  ${cov}`);
  writeFileSync(CACHE, JSON.stringify(store));
}

// coverage report
let full = 0, partial = 0, none = 0;
for (const [token, from] of need) {
  const s = store[token];
  if (!s?.candles?.length) { none++; continue; }
  const oldest = s.candles[0][0];
  const newest = s.candles[s.candles.length - 1][0];
  const pos = positions.filter(p => p.token === token);
  const lastExit = Math.max(...pos.map(p => p.exitTime || p.entryTime));
  if (oldest <= from + 86400 && newest >= lastExit + TAIL) full++; else partial++;
}
console.error(`\ncoverage: ${full} full, ${partial} partial, ${none} no data (of ${need.size})`);
