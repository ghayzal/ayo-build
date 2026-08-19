// Pull every transaction signature for a wallet, newest -> oldest, via public RPC.
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const WALLET = process.argv[2];
const MAX = Number(process.argv[3] || 5000);
if (!WALLET) { console.error('usage: node fetch-signatures.mjs <wallet> [max]'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function rpc(method, params, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (res.status === 429) { await sleep(1000 * (i + 1)); continue; }
      const j = await res.json();
      if (j.error) { await sleep(500 * (i + 1)); continue; }
      return j.result;
    } catch (e) {
      await sleep(500 * (i + 1));
    }
  }
  throw new Error(`rpc ${method} failed after ${tries} tries`);
}

const all = [];
let before = undefined;
while (all.length < MAX) {
  const params = [WALLET, before ? { limit: 1000, before } : { limit: 1000 }];
  const batch = await rpc('getSignaturesForAddress', params);
  if (!batch || batch.length === 0) break;
  all.push(...batch);
  before = batch[batch.length - 1].signature;
  process.stderr.write(`\rfetched ${all.length}`);
  if (batch.length < 1000) break;
  await sleep(250);
}
process.stderr.write('\n');

const ok = all.filter(s => !s.err);
const times = ok.map(s => s.blockTime).filter(Boolean).sort((a, b) => a - b);
console.error(`total: ${all.length}  succeeded: ${ok.length}  failed: ${all.length - ok.length}`);
if (times.length) {
  console.error(`oldest: ${new Date(times[0] * 1000).toISOString()}`);
  console.error(`newest: ${new Date(times[times.length - 1] * 1000).toISOString()}`);
  const days = (times[times.length - 1] - times[0]) / 86400;
  console.error(`span:   ${days.toFixed(1)} days  (~${(ok.length / Math.max(days, 1)).toFixed(1)} tx/day)`);
}
process.stdout.write(JSON.stringify(all, null, 0));
