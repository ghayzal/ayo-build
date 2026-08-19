// Hourly SOL/USD candles from Binance (free, no key) covering the swap window.
import { readFileSync, writeFileSync } from 'node:fs';

const swaps = JSON.parse(readFileSync('v0/data/swaps.json', 'utf8'));
const times = swaps.map(s => s.time).sort((a, b) => a - b);
const start = (times[0] - 7200) * 1000;
const end = (times[times.length - 1] + 7200) * 1000;

const out = {};
let cursor = start;
while (cursor < end) {
  const url = `https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=1h&startTime=${cursor}&endTime=${end}&limit=1000`;
  const rows = await (await fetch(url)).json();
  if (!Array.isArray(rows) || rows.length === 0) break;
  for (const r of rows) out[Math.floor(r[0] / 1000)] = Number(r[4]); // close
  cursor = rows[rows.length - 1][0] + 3600_000;
  if (rows.length < 1000) break;
}
writeFileSync('v0/data/sol-prices.json', JSON.stringify(out));
const keys = Object.keys(out).map(Number).sort((a, b) => a - b);
console.log(`${keys.length} hourly SOL candles`);
console.log(`${new Date(keys[0]*1000).toISOString()} -> ${new Date(keys[keys.length-1]*1000).toISOString()}`);
