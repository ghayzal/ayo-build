# Ayo Build

Behavioural analytics for memecoin traders. Not a signal service, not a
prediction engine. The question is "when I lose money, what pattern of my own
actually caused it?"

Full concept: [`docs/brief.md`](docs/brief.md)

## Where the project actually stands

**V0 is done: the concept is validated on one wallet, and it found something the
brief did not predict.** Read [`FINDINGS.md`](FINDINGS.md) first, it is the most
important file here.

Short version: the tested wallet's leak is holding winners too long, not selling
them too early. Positions peak at a median 3.5 hours and get held a median 25.4
hours. Median peak paper gain +46.3% turns into a median realised −43.7%.

The rotation hypothesis the brief is built around did not survive the data.

## What exists

| | |
|---|---|
| [`v0/`](v0/) | Working analysis pipeline. Wallet address in, behavioural report out. |
| [`FINDINGS.md`](FINDINGS.md) | Results from the first wallet, with limits stated. |
| [`docs/brief.md`](docs/brief.md) | Original product concept. |

No app yet, on purpose. No frontend, database, auth or wallet connect until the
core insight is proven on more than one wallet.

## Getting started

```bash
git clone https://github.com/ghayzal/ayo-build.git
cd ayo-build
```

Then follow [`v0/README.md`](v0/README.md) to run the pipeline against any Solana
address. Node 24+, no API keys, no install step.

## Next

The single most useful contribution right now is **running `v0/` against another
wallet**, ideally one trading real size. If time-to-peak versus hold-time holds
up across traders, that is the product. If it does not, we learned that cheaply.

## Working together

- Branch off `main`: `git checkout -b your-name/what-youre-doing`
- Open a pull request instead of pushing straight to `main`
- Keep commits small enough that someone else can read them
