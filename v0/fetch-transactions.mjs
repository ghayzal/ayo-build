// Fetch full transactions for cached signatures and cache them to disk.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const SIGS = 'v0/data/signatures.json';
const OUT = 'v0/data/transactions.json';
const CONCURRENCY = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function rpc(method, params, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (res.status === 429) { await sleep(800 * (i + 1)); continue; }
      const j = await res.json();
      if (j.error) { await sleep(400 * (i + 1)); continue; }
      return j.result;
    } catch { await sleep(400 * (i + 1)); }
  }
  return null;
}

const sigs = JSON.parse(readFileSync(SIGS, 'utf8')).filter(s => !s.err).map(s => s.signature);
const cache = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const todo = sigs.filter(s => !cache[s]);
console.error(`${sigs.length} signatures, ${todo.length} to fetch`);

let done = 0;
async function worker(queue) {
  while (queue.length) {
    const sig = queue.shift();
    const tx = await rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
    if (tx) cache[sig] = tx;
    done++;
    process.stderr.write(`\r${done}/${todo.length}`);
    await sleep(120);
  }
}
const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
process.stderr.write('\n');

mkdirSync('v0/data', { recursive: true });
writeFileSync(OUT, JSON.stringify(cache));
console.error(`cached ${Object.keys(cache).length} transactions -> ${OUT}`);
