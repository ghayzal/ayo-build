// Reconstruct swaps from raw transactions using net balance deltas.
// Venue-agnostic on purpose: we never parse DEX instructions, we just ask
// "what did this wallet's balances actually do?" That works for Jupiter,
// Pump.fun, Raydium, Meteora, Orca and anything else that ever ships.
import { readFileSync, writeFileSync } from 'node:fs';

const WALLET = process.argv[2];
if (!WALLET) { console.error('usage: node extract-swaps.mjs <wallet>'); process.exit(1); }

const LAMPORTS = 1e9;
const DUST_SOL = 0.0005;   // below this a SOL move is fees/rent, not a trade
const DUST_USD = 0.01;

// Assets the trader pays WITH rather than speculates ON.
const QUOTES = {
  'So11111111111111111111111111111111111111112': { sym: 'SOL',  usd: false },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { sym: 'USDC', usd: true },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { sym: 'USDT', usd: true },
};
const NATIVE = 'So11111111111111111111111111111111111111112';

const VENUES = {
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter v6',
  'JUP4Fb2cqiRUcaTNcntAdRrEuFhV5PP1Kn8FUjHnpvi': 'Jupiter v4',
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'Pump.fun',
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'PumpSwap',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium v4',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'Raydium CPMM',
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'Meteora DLMM',
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB': 'Meteora Pools',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
};

const txs = JSON.parse(readFileSync('v0/data/transactions.json', 'utf8'));

const accountKeyList = tx => {
  const msg = tx.transaction.message;
  const stat = (msg.accountKeys || []).map(k => (typeof k === 'string' ? k : k.pubkey));
  const l = tx.meta?.loadedAddresses;
  return [...stat, ...(l?.writable || []), ...(l?.readonly || [])];
};

function venueOf(tx) {
  const seen = new Set();
  const walk = ins => { for (const i of ins || []) { if (i.programId) seen.add(i.programId); } };
  walk(tx.transaction.message.instructions);
  for (const inner of tx.meta?.innerInstructions || []) walk(inner.instructions);
  for (const p of seen) if (VENUES[p]) return VENUES[p];
  return 'unknown';
}

const swaps = [], skipped = [];

for (const [sig, tx] of Object.entries(txs)) {
  if (!tx || tx.meta?.err) { skipped.push({ sig, why: 'failed tx' }); continue; }

  const keys = accountKeyList(tx);
  const idx = keys.indexOf(WALLET);
  const fee = (tx.meta.fee || 0) / LAMPORTS;

  let solDelta = 0;
  if (idx >= 0) solDelta = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / LAMPORTS + fee;

  const pre = new Map(), post = new Map();
  for (const b of tx.meta.preTokenBalances || [])
    if (b.owner === WALLET) pre.set(b.mint, (pre.get(b.mint) || 0) + Number(b.uiTokenAmount.uiAmountString || 0));
  for (const b of tx.meta.postTokenBalances || [])
    if (b.owner === WALLET) post.set(b.mint, (post.get(b.mint) || 0) + Number(b.uiTokenAmount.uiAmountString || 0));

  const deltas = new Map();
  for (const m of new Set([...pre.keys(), ...post.keys()])) {
    const d = (post.get(m) || 0) - (pre.get(m) || 0);
    if (d !== 0) deltas.set(m, d);
  }
  if (deltas.has(NATIVE)) { solDelta += deltas.get(NATIVE); deltas.delete(NATIVE); }

  // split into base (speculative) and quote (payment) legs
  const base = [], quote = [];
  for (const [mint, d] of deltas) {
    if (QUOTES[mint]) { if (Math.abs(d) > DUST_USD) quote.push({ mint, sym: QUOTES[mint].sym, amt: d }); }
    else base.push({ mint, amt: d });
  }
  if (Math.abs(solDelta) > DUST_SOL) quote.push({ mint: NATIVE, sym: 'SOL', amt: solDelta });

  const baseIn = base.filter(b => b.amt > 0), baseOut = base.filter(b => b.amt < 0);
  const quoteIn = quote.filter(q => q.amt > 0), quoteOut = quote.filter(q => q.amt < 0);

  const rec = { sig, time: tx.blockTime, iso: new Date(tx.blockTime * 1000).toISOString(), venue: venueOf(tx), fee };

  if (baseIn.length === 1 && baseOut.length === 0 && quoteOut.length >= 1) {
    const q = quoteOut.sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt))[0];
    swaps.push({ ...rec, kind: 'buy', token: baseIn[0].mint, tokenAmt: baseIn[0].amt,
                 quoteMint: q.mint, quoteSym: q.sym, quoteAmt: Math.abs(q.amt) });
  } else if (baseOut.length === 1 && baseIn.length === 0 && quoteIn.length >= 1) {
    const q = quoteIn.sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt))[0];
    swaps.push({ ...rec, kind: 'sell', token: baseOut[0].mint, tokenAmt: Math.abs(baseOut[0].amt),
                 quoteMint: q.mint, quoteSym: q.sym, quoteAmt: Math.abs(q.amt) });
  } else if (baseIn.length === 1 && baseOut.length === 1) {
    swaps.push({ ...rec, kind: 'direct_swap', token: baseIn[0].mint, tokenAmt: baseIn[0].amt,
                 soldToken: baseOut[0].mint, soldAmt: Math.abs(baseOut[0].amt) });
  } else {
    skipped.push({ sig, why: `base_in=${baseIn.length} base_out=${baseOut.length} quote_in=${quoteIn.length} quote_out=${quoteOut.length}` });
  }
}

swaps.sort((a, b) => a.time - b.time);
writeFileSync('v0/data/swaps.json', JSON.stringify(swaps, null, 2));

const tally = (arr, key) => arr.reduce((a, x) => (a[x[key]] = (a[x[key]] || 0) + 1, a), {});
console.log(`transactions:  ${Object.keys(txs).length}`);
console.log(`swaps found:   ${swaps.length}`);
console.log(`not a swap:    ${skipped.length}`);
console.log(`unique tokens: ${new Set(swaps.map(s => s.token)).size}`);
console.log(`\nby kind:  ${JSON.stringify(tally(swaps, 'kind'))}`);
console.log(`by quote: ${JSON.stringify(tally(swaps.filter(s => s.quoteSym), 'quoteSym'))}`);
console.log(`by venue: ${JSON.stringify(tally(swaps, 'venue'))}`);
const why = tally(skipped, 'why');
console.log(`\nskip reasons:`);
for (const [k, v] of Object.entries(why).sort((a, b) => b[1] - a[1])) console.log(`  ${v}x  ${k}`);
