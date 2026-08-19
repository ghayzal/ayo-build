# v0 — wallet analysis pipeline

A throwaway-grade pipeline that answers one question before anyone builds an app:

> Can we read a trader's behavioural leaks out of their wallet history?

No frontend, no database, no auth, no wallet connect. Just scripts and JSON files.

## Running it

```bash
node v0/fetch-signatures.mjs <WALLET> 5000 > v0/data/signatures.json
node v0/fetch-transactions.mjs
node v0/extract-swaps.mjs <WALLET>
node v0/fetch-sol-prices.mjs
node v0/build-positions.mjs
node v0/detect-behavior.mjs
node v0/fetch-token-prices.mjs      # slow: free-tier rate limits
node v0/counterfactuals.mjs
```

Every step caches to `v0/data/` and is safe to re-run. That directory is gitignored.

## Design decisions worth keeping

**Swaps are reconstructed from balance deltas, not DEX instructions.** We never
parse a Jupiter route or a Pump.fun bonding-curve call. We diff the wallet's
token balances before and after each transaction and ask what actually moved.
One code path handled Jupiter, PumpSwap, Pump.fun, Raydium (3 variants), Meteora
and Orca on the first test wallet, including venues we had no name for. Anything
that ships next year works too, for free.

**Stablecoins and SOL are "quote" assets, not positions.** A trader paying USDC
for a memecoin is buying, not swapping. Without this split, every buy looks like
a token-to-token rotation and the rotation detector fills with false positives.

**Positions, not transactions.** A position opens when the balance leaves zero
and closes when it returns to it, absorbing scale-ins and partial exits. Dust
under 1% of peak size counts as flat, because memecoin sells leave remainders.

**Baselines are per-trader.** "Fast exit" means below this trader's own 25th
percentile hold time, not below some universal number.

**Both ends of a price comparison come from the same OHLCV series.** Mixing
execution price with index price manufactures returns that were never available.
Missing candles stay `null` instead of being interpolated.

## Data sources (all free, no API key)

| Need | Source |
|---|---|
| Transaction history | Solana public RPC |
| SOL/USD history | Binance klines |
| Memecoin OHLCV | GeckoTerminal |

The public RPC and GeckoTerminal free tier are both rate-limited. Fine for one
wallet, nowhere near enough for a product. Swapping in a paid indexer is a
config change, not a rewrite.

## Known limits

- Hourly candles only, so sub-hour entries and exits are approximate.
- Tokens whose pools died have no price history, and those rows stay `null`.
- Historical trades have no thesis attached, so "premature exit" is measured
  against the trader's own baseline rather than a stated plan.
