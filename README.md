# Ayo Build

Behavioural analytics for memecoin traders. Not a signal service, not a
prediction engine. The question is "when I lose money, what pattern of my own
actually caused it?"

## Run the scanner

```bash
node app/server.js
```

Open http://localhost:3000, paste a Solana address, get a verdict. No install
step, no dependencies, no wallet connection, nothing signed.

**Set a real RPC first.** The public Solana endpoint rate-limits hard enough that
a cold scan stalls partway through. See [`app/README.md`](app/README.md).

## Where the project stands

V0 validated the concept on one wallet and found something the brief did not
predict. Read [`FINDINGS.md`](FINDINGS.md) before anything else.

Short version: the tested wallet's leak is holding winners too long, not selling
them too early. Positions peak before hour six and get held past hour sixty. The
median winner peaked +85% and closed −39%. That is $748 handed back on an account
that only lost $328.

The rotation hypothesis the brief is built around did not survive the data.

## What is here

| | |
|---|---|
| [`app/`](app/) | The scanner. Address in, behavioural verdict out. |
| [`FINDINGS.md`](FINDINGS.md) | Results from the first wallet, with limits stated. |
| [`v0/`](v0/) | Research pipeline the findings came from. Scripts, not product. |
| [`docs/brief.md`](docs/brief.md) | Original product concept. |

There is no database, no auth and no wallet connect, on purpose. None of them are
needed to deliver the insight, and every one of them is a reason for someone to
bounce before they see their number.

## What the scanner will not do

It is allowed to say nothing conclusive. A wallet with fewer than five closed
positions, or one that genuinely keeps its winners, gets told that instead of
having a leak invented for it. A tool that finds a problem in every wallet is not
measuring anything.

## Next

The most useful contribution right now is **running the scanner against another
wallet**, ideally one trading real size. One wallet is a hypothesis. If
time-to-peak versus hold-time holds across traders, that is the product.

After that, in order:

1. A real RPC endpoint, which unblocks everything else.
2. A Telegram bot that pings at the hour a position historically peaks. The
   scanner gets people in; the alarm is the part that changes behaviour.
3. Only then, anything from the brief's later sections.

## Working together

- Branch off `main`: `git checkout -b your-name/what-youre-doing`
- Open a pull request instead of pushing straight to `main`
- Keep commits small enough that someone else can read them
