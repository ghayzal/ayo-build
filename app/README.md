# Giveback — the scanner

Paste a Solana address, find out how much of your peak paper gains you handed
back. No wallet connection, nothing signed, no accounts, no journaling.

## Running it

```bash
node app/server.js
```

Then open http://localhost:3000. No install step and no dependencies: it is
plain Node 20+ and three static files.

## Set a real RPC before you show anyone

The public Solana RPC will not carry this. A cold scan of a 107-transaction
wallet stalls partway through and never finishes.

```bash
cp .env.example .env    # then put your endpoint in SOLANA_RPC
node app/server.js
```

Every setting is in [`.env.example`](../.env.example).

### Which endpoint

We benchmarked the no-signup public endpoints against the workload that actually
matters, batched `getTransaction` over months-old signatures. Reproduce it with:

```bash
node tools/bench-rpc.mjs
```

Every one of them failed. Most cannot see old transactions at all, because they
prune history and this app needs months of it. **Archival access is the hard
requirement**, and it is what rules out the free public endpoints.

So one of you has to make a free account.

| | Free allowance | Rate | Permanent? |
|---|---|---|---|
| **Helius** | 1M credits/month | 10 rps | yes |
| Alchemy | 30M CU/month (~1.1M calls) | 25 rps | yes |
| QuickNode | 10M credits | 15 rps | **no, 30-day trial** |

QuickNode's "free" plan is a one-month trial, not an ongoing tier. Do not build
the habit on it.

**Helius is the pick.** Archival calls bill at 1 credit with no deep-history
surcharge, which is the number that matters here since every transaction we read
is months old. 1M credits is roughly 2,500 scans at the 400-signature cap, or
about 9,000 scans of a normal hundred-transaction wallet. Its 10 rps is the weak
point: a 400-transaction cold scan takes around 40 seconds.

Alchemy is the alternative and is faster at 25 rps, but its archival guarantee for
Solana is stated less precisely, so verify it with the benchmark before trusting
it.

Syndica advertises 10M requests a month at 100 rps on a free tier, which would
beat both by a wide margin. We could not load their pricing page to confirm it,
and have not benchmarked them. Worth ten minutes if someone wants to check.

If scanning volume ever becomes the real bottleneck, the thing to buy is Helius
Developer at $49/month, for `getTransactionsForAddress`: it returns 100 full
transactions per call and would collapse a scan from ~400 requests to 4.

Verify whatever you sign up for before wiring it in:

```bash
node tools/bench-rpc.mjs "https://your-endpoint-with-key"
```

It checks archival reach, batch tolerance and sustained throughput, and prints a
verdict. Do not skip it: two of the endpoints we tested answered normal requests
fine and still could not return a three-month-old transaction.

## How a scan works

```
signatures -> transactions -> swaps -> positions -> prices -> analysis
```

Progress streams to the browser over SSE, because a silent sixty-second wait
reads as a broken page.

Trades are reconstructed from **balance deltas**, not DEX instruction parsing.
We diff the wallet's token balances before and after each transaction and ask
what actually moved. One code path covers Jupiter, PumpSwap, Pump.fun, Raydium,
Meteora and Orca, including venues we never named, and it keeps working when a
new DEX launches.

SOL, USDC and USDT are treated as **quote** assets rather than positions. Without
that split every USDC-funded buy looks like a token-to-token rotation.

## Caching

Two flat files under `app/cache/`, both safe to delete:

- `txs.json` — confirmed transactions, which are immutable, so this never goes
  stale. A repeat scan of the same wallet is close to instant.
- `tokens.json` — hourly OHLCV per token, one hour TTL. Shared across every
  scan, which matters more than it sounds: degens pile into the same coins, so
  the second person to scan a popular token pays nothing.

Both are flat JSON, which is fine at demo scale and is the first thing to replace
with a real store if this sees traffic.

To warm the cache from the V0 research data:

```bash
node v0/seed-app-cache.mjs
```

## Limits worth knowing

- Reads at most the 400 most recent transactions per wallet.
- Prices at most the 30 tokens that carried the most capital.
- Two concurrent scans, because the free price API allows about 30 calls a minute.
- Hourly candles, so entries and exits inside the same hour are approximate.
- The verdict is allowed to say **nothing conclusive**. A wallet with fewer than
  five closed positions, or one that genuinely keeps its winners, gets told that
  rather than having a leak invented for it.
