# V0 validation: one wallet, 85 days

Wallet `4vVz3XpNRiruew3hYwhqPS96NoCgUPF82dA8WNx69kra`, analysed 2026-08-19.
Everything below is reproducible with the scripts in [`v0/`](v0/).

The question this was built to answer:

> Can we identify a trader's behavioural leaks from wallet history alone, and
> present them in a way that would change future decisions?

**Yes.** The engine found a leak, put a number on it, and the leak is the
opposite of the one the brief predicted.

---

## What came out of the wallet

| | |
|---|---|
| Transactions read | 107 |
| Swaps reconstructed | 79 (42 buys, 37 sells) |
| Round-trip positions | 35, all closed |
| Distinct tokens | 33 |
| Window | 2026-05-23 → 2026-08-16 |
| Capital deployed | $1,152 |
| Net realised | **−$328** |
| Win rate | 22.9% (8W / 27L) |
| Median position | $18 |
| Median hold | 11.0h |

Trades were reconstructed from balance deltas rather than DEX instruction
parsing, so one code path covered Jupiter, PumpSwap, Pump.fun, Raydium (three
variants), Meteora and Orca, including venues we never named. All data came from
free keyless sources.

---

## The leak: winners are held until they become losers

Of 35 positions, 13 peaked more than 25% up at some point. That 25% line is the
threshold the app ships with: a position that peaked +2% is not a winner anyone
gave back.

| Across those 13 | |
|---|---|
| Median peak paper gain | **+84.9%** |
| Median realised result | **−39.3%** |
| Median time to peak | **5.6h** |
| Median total hold | **62.5h** |
| Still closed red | **9 of 13** |

The position tops out before hour six and gets held for another fifty-seven
while it bleeds out, eleven times longer than it took to reach its high.

Loosening the threshold to any position that ever went green at all (19 of 35)
gives +46.3% median peak, −43.7% median realised, 3.5h to peak and 25.4h held.
The direction is identical either way; only the magnitude moves.

The largest position in the account is the cleanest example. PAYNE, $200 in, was
up 94% eleven hours after entry. It was held for 134 hours total and sold 69%
below the peak it had already shown, for −$98.67.

Across the nine positions that peaked above +25% and still closed red, the gap
between peak paper value and realised value was **$748**. Nobody sells the exact
top, so that figure is a ceiling, not a forgone profit. But the account only lost
$328. A mechanical rule capturing even half of that gap flips it green.

---

## The brief's central hypothesis does not hold here

The brief is built around premature selling and costly rotation. Neither
survives contact with this wallet.

**Rotation is not the leak.** 24 of 35 positions were exited within 30 minutes of
entering something else (median gap: 48 seconds). Comparing holding the original
against the replacement, the median rotation loses, but weighted by capital
actually deployed it comes out **+$62 at 24h and −$64 at 3d**. On $650 of rotated
capital that is noise, not a finding. n=17.

**Premature exit is not the leak either.** It is the reverse. This trader's
problem is holding too long, not selling too soon.

This matters more than the leak itself. The engine contradicted the founding
assumption instead of confirming it, which is the strongest evidence available
that it measures something real.

---

## Secondary findings

**Entries are badly timed.** Ranking each entry hour against every other hour of
that token's life, entries land at the **18th to 22nd percentile** depending on
whether still-open positions are included. They buy before worse-than-typical
moves. Only 10 of 26 beat the token's own median hour.

**Chasing a run-up is the specific mechanism.** Split by how far the token had
already moved in the 24h before entry:

| | n | net P&L | win rate | entry percentile |
|---|---:|---:|---:|---:|
| Bought after a >50% run-up | 4 | **−$44** | **0%** | 0.22 |
| Bought otherwise | 9 | **+$38** | 44% | 0.71 |

When they are not chasing, their entry timing is good. Every chase lost. n=4, so
this is a hypothesis worth tracking, not a proven law.

**Size amplifies the mistakes.** Four positions ran above 1.5× their own 75th
percentile: $535 deployed, −$150 net. The other 31 positions: $618 deployed,
−$178 net. Nearly half the account's losses came from four trades.

**Re-entry accelerates after losses.** Median gap to the next entry is 0.87
minutes after a loss versus 2.55 minutes after a win. This is the revenge-trading
signature, though n=8 on the after-a-win side is too thin to lean on.

---

## A correction worth recording

An earlier pass measured exit timing at the 31st percentile of each token's
hours and read it as skill: selling ahead of worse-than-usual drops.

That reading was wrong. Because this trader exits late in a token's life, most
remaining hours are bad by construction, so a low percentile is guaranteed and
measures nothing. The giveback analysis shows the true picture. **Any
percentile-rank metric has to control for where in the token's lifecycle the
decision happened**, or it will manufacture skill that is not there.

---

## What this says about the product

The counterfactual engine works and runs on free data, which was the biggest
technical risk going in. GeckoTerminal returned usable hourly OHLCV for all 33
tokens, including dead Pump.fun launches.

The insight that would actually change behaviour is not the one in the brief.
It is a single sentence: *your positions peak before hour six and you hold them
past hour sixty.* That is measurable from wallet history alone, needs no thesis
capture, no wallet connection and no journaling, and it lands in the first
session. It is now the headline of the scanner in [`app/`](app/).

If that generalises across wallets, the MVP is much smaller than the brief
scopes. Conviction Lock, thesis entry and the social layer are all downstream of
proving this one number moves.

---

## Limits, stated plainly

- **35 positions, $18 median, one wallet.** Directional, not significant. Several
  splits run to n=4.
- **Hourly candles**, so sub-hour entries and exits are approximate. Given a
  median 3.5h time-to-peak, hourly resolution is close to too coarse.
- **Peak-to-exit is an unattainable benchmark.** Treat $748 as a ceiling.
- **Survivorship in reverse**: memecoins decay by default. Every absolute return
  number here is confounded by that. The relative comparisons control for it; the
  absolute ones do not.
- **This wallet may not be representative.** $18 positions look like someone
  testing, not someone whose behaviour is costing them real money.

The next test is a second wallet with heavier size. If time-to-peak versus
hold-time holds there too, that is the product.
