// Price data. Two sources, both free and keyless:
//   SOL/USD    -> Binance klines
//   Token OHLCV -> GeckoTerminal (~30 calls/min on the free tier)
//
// The GeckoTerminal limit is the real ceiling on this app. The cache below is
// shared across every scan, which matters more than it sounds: degens pile into
// the same coins, so the second person to scan a popular token pays nothing.
// Swapping in a paid price source means replacing fetchCandles and nothing else.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', 'cache');
const TOKEN_CACHE = join(CACHE_DIR, 'tokens.json');
const SOL_CACHE = join(CACHE_DIR, 'sol.json');

const GT = 'https://api.geckoterminal.com/api/v2';
const MIN_INTERVAL_MS = 2300;      // stay under 30 calls/min
const TOKEN_TTL_MS = 60 * 60 * 1000;
const SOL_TTL_MS = 30 * 60 * 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadJson(path, fallback) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; }
  catch { return fallback; }
}
function saveJson(path, data) {
  try { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(path, JSON.stringify(data)); }
  catch { /* cache is an optimisation, never fatal */ }
}

const tokenCache = loadJson(TOKEN_CACHE, {});
let solCache = loadJson(SOL_CACHE, { fetchedAt: 0, prices: {} });

// ---- global rate limiter shared by every in-flight scan ----
let lastCall = 0;
let chain = Promise.resolve();
function throttled(fn) {
  const run = async () => {
    const wait = Math.max(0, lastCall + MIN_INTERVAL_MS - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    return fn();
  };
  chain = chain.then(run, run);
  return chain;
}

async function gt(path, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await throttled(async () => {
      try { return await fetch(GT + path, { headers: { Accept: 'application/json' } }); }
      catch { return null; }
    });
    if (!res) { await sleep(1000); continue; }
    if (res.status === 404) return null;
    if (res.status === 429) { await sleep(4000 * (i + 1)); continue; }
    if (!res.ok) { await sleep(1200 * (i + 1)); continue; }
    try { return await res.json(); } catch { return null; }
  }
  return null;
}

// ---- SOL/USD ----
export async function getSolPrices(fromTs, toTs) {
  const fresh = Date.now() - solCache.fetchedAt < SOL_TTL_MS;
  const covered = solCache.prices[Math.floor(fromTs / 3600) * 3600] != null;
  if (!fresh || !covered) {
    const prices = { ...solCache.prices };
    let cursor = (fromTs - 7200) * 1000;
    const end = (toTs + 7200) * 1000;
    while (cursor < end) {
      const url = `https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=1h&startTime=${cursor}&endTime=${end}&limit=1000`;
      let rows;
      try { rows = await (await fetch(url)).json(); } catch { break; }
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const r of rows) prices[Math.floor(r[0] / 1000)] = Number(r[4]);
      cursor = rows[rows.length - 1][0] + 3600000;
      if (rows.length < 1000) break;
    }
    solCache = { fetchedAt: Date.now(), prices };
    saveJson(SOL_CACHE, solCache);
  }
  const prices = solCache.prices;
  return ts => {
    const hour = Math.floor(ts / 3600) * 3600;
    for (let h = hour, i = 0; i < 48; h -= 3600, i++) if (prices[h] != null) return prices[h];
    return null;
  };
}

// ---- token OHLCV ----
async function fetchCandles(mint, wantFrom) {
  const pools = await gt(`/networks/solana/tokens/${mint}/pools`);
  const list = (pools && pools.data) || [];
  if (!list.length) return { symbol: null, candles: [] };

  const best = list.slice().sort((a, b) =>
    Number((b.attributes && b.attributes.reserve_in_usd) || 0) -
    Number((a.attributes && a.attributes.reserve_in_usd) || 0))[0];
  const pool = best.attributes.address;
  const symbol = (best.attributes.name || '').split('/')[0].trim() || null;

  const candles = new Map();
  let before = Math.floor(Date.now() / 1000);
  for (let page = 0; page < 3; page++) {
    const j = await gt(`/networks/solana/pools/${pool}/ohlcv/hour?aggregate=1&limit=1000&currency=usd&before_timestamp=${before}`);
    const rows = (j && j.data && j.data.attributes && j.data.attributes.ohlcv_list) || [];
    if (!rows.length) break;
    for (const r of rows) candles.set(r[0], r[4]);
    const oldest = Math.min(...rows.map(r => r[0]));
    if (oldest <= wantFrom) break;
    before = oldest - 1;
  }

  return { symbol, candles: [...candles.entries()].sort((a, b) => a[0] - b[0]) };
}

export async function getTokenPrices(mints, wantFrom, onProgress = () => {}) {
  const out = {};
  let done = 0;
  for (const mint of mints) {
    const hit = tokenCache[mint];
    if (hit && Date.now() - hit.fetchedAt < TOKEN_TTL_MS) {
      out[mint] = hit;
    } else {
      const fetched = await fetchCandles(mint, wantFrom);
      const rec = { ...fetched, fetchedAt: Date.now() };
      tokenCache[mint] = rec;
      out[mint] = rec;
      saveJson(TOKEN_CACHE, tokenCache);
    }
    onProgress(++done, mints.length);
  }
  return out;
}

export function cachedSymbol(mint) {
  const hit = tokenCache[mint];
  return (hit && hit.symbol) || null;
}
