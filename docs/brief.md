# Project Brief: Behavioral Trading Engine for Memecoin Traders

## Overview

We are building a **behavioral analytics application for crypto traders**, initially focused on memecoin traders.

The core problem is not necessarily poor coin selection. Many traders identify good opportunities but lose money because of their own behavior after entering a position. Common examples include:

- Selling a high-conviction position too early
- Rotating into another token simply because it is pumping faster
- FOMO-buying after large price moves
- Revenge trading after losses
- Overtrading
- Cutting winners too early
- Holding losers too long
- Changing the original trade thesis mid-trade
- Taking larger risk after emotional events

The application should help users understand **how their own decision-making patterns affect performance**.

The goal is not to tell users what token to buy. The goal is to help users answer:

> "When I lose money, what behavioral pattern actually caused it?"

---

## Core Product Idea

The app should combine:

1. **Objective wallet/trade data**
2. **User-entered trade intentions**
3. **Behavioral pattern detection**
4. **Counterfactual analysis**
5. **Personalized feedback**

The core data model is:

**Belief → Decision → Trade → Behavior → Outcome → Feedback**

Most trading tools only analyze:

**Buy → Sell → P&L**

We want to analyze the decisions behind the trades.

---

## Primary User Problem

A representative user behavior looks like this:

1. User buys Token A with high conviction.
2. User expects the thesis to play out over 3–5 days.
3. A few hours later, Token B starts pumping.
4. User gets impatient.
5. User sells Token A.
6. User buys Token B after it has already moved significantly.
7. Token B retraces.
8. Token A later performs well.
9. User repeats the process.

This creates a cycle:

**Conviction → Entry → Impatience → FOMO → Rotation → Loss → Regret → Repeat**

The app should identify whether this is actually happening and quantify the cost.

---

## Product Positioning

Do NOT position the product as:

- A memecoin prediction engine
- A signal service
- A trading bot
- A "100x coin finder"
- A guaranteed-profit tool

Preferred positioning:

- **Behavioral analytics for traders**
- **Trading psychology backed by wallet data**
- **Understand the decisions behind your trades**
- **Find the behavioral leaks hurting your performance**
- **Track your process, not just your P&L**

---

## Key Product Principle

The application should **not assume that patience is always better**.

For example, if a trader frequently rotates out of Token A into Token B, the app should test whether those rotations actually help or hurt performance.

The product should discover the trader's behavior empirically.

It might conclude:

> "Your rotations consistently reduce returns."

Or:

> "Your rotations actually improve your returns."

The engine should test hypotheses instead of imposing generic trading advice.

---

# Core Features

## 1. Wallet Connection

Initially target Solana wallets.

The user connects a wallet and the application imports historical transactions.

Possible wallet integrations may include:

- Phantom
- Solflare
- Backpack
- Wallet Adapter-compatible wallets

The app should reconstruct trades from on-chain transaction history.

---

## 2. Trade Reconstruction

Convert wallet activity into understandable positions/trades.

For each trade, determine:

- Token
- Entry timestamp
- Entry price
- Position size
- Exit timestamp
- Exit price
- Partial exits
- Realized P&L
- Holding duration
- Token performance before and after exit
- Whether another token was bought shortly after the exit

We should try to identify logical trade sequences rather than showing raw blockchain transactions.

---

## 3. Pre-Trade Thesis

For future trades, allow users to record a very lightweight thesis.

The process must be fast enough that users will actually use it.

Suggested fields:

### Conviction

1–10

### Expected timeframe

- <1 hour
- 1–6 hours
- 6–24 hours
- 1–3 days
- 3–7 days
- 7+ days

### Primary thesis

Examples:

- Narrative
- Momentum
- Catalyst
- Community
- Liquidity
- Technical setup
- Social attention
- Other

### Why are you entering?

Short text.

### What would invalidate the thesis?

Short text.

### Optional

- Target
- Maximum acceptable loss
- Planned position size

The application should minimize manual journaling.

---

# Behavioral Engine

The core intelligence of the product is the behavioral engine.

It should classify trading behavior based on a combination of:

- Wallet activity
- Market price history
- User-entered thesis
- Timing
- Position sizing
- Previous user behavior

---

## Behavioral Patterns to Detect

### 1. Premature Exit

The user exits substantially earlier than their stated thesis timeframe.

Example:

- Planned timeframe: 3 days
- Actual holding period: 2 hours

This should not automatically be classified as bad if the thesis was invalidated.

---

### 2. Rotation

The user exits one token and quickly enters another.

Example:

**SELL DOGA → BUY CAT within 15 minutes**

Track:

- Time between exit and new entry
- Percentage of capital rotated
- New token's recent price movement
- Performance of both positions afterward

---

### 3. Momentum Chasing / FOMO Entry

The user enters a token after a significant recent price increase.

Example:

- Token is already +60% in 4 hours
- User enters near the local high

The threshold should eventually adapt to the user's normal behavior and market volatility.

---

### 4. Revenge Trading

After a significant loss, the user:

- Trades faster
- Increases position size
- Takes lower-quality setups
- Opens more positions than normal

The engine should compare behavior after losses with the user's own baseline.

---

### 5. Overtrading

Trading frequency rises significantly above the user's normal range.

Potential signals:

- Trades per hour/day
- Number of wallet swaps
- Position turnover
- Average time between trades

---

### 6. Profit Cutting

The user consistently exits winners quickly.

Compare:

- Average holding time for winners
- Average holding time for losers
- Post-exit token performance

---

### 7. Loss Holding

The user holds losing positions substantially longer than winning positions.

---

### 8. Thesis Drift

The reason for entering and exiting becomes disconnected.

Example:

Original thesis:

> "Upcoming catalyst in 3 days."

Exit reason:

> "Another coin is moving faster."

The application should record when decisions diverge from the original thesis.

---

### 9. Conviction Inconsistency

The user repeatedly rates trades highly but behaves as if conviction is low.

Example:

- Conviction: 9/10
- Planned timeframe: 5 days
- Average actual hold: 90 minutes

---

### 10. Position-Size Tilt

Position sizes increase after:

- Large losses
- Large wins
- FOMO events
- Consecutive losing trades

---

# Conviction Lock

One potential signature feature is a **Conviction Lock**.

This should initially be a behavioral intervention, not a hard restriction on wallet transactions.

Example:

User enters:

- Token: DOGA
- Conviction: 9/10
- Planned timeframe: 3 days

Two hours later, they attempt to sell and rotate into CAT.

The app shows:

> You rated DOGA 9/10 and gave the thesis 3 days.
>
> You have held it for 2h 14m.
>
> CAT has already moved +64% today.
>
> This resembles 12 previous rotations in your history.

Then ask:

**Why are you exiting?**

- Thesis invalidated
- Risk changed
- Better opportunity
- Price action scared me
- Taking profit
- Other

The user can still continue.

The goal is to create a moment of reflection and collect behavioral data.

---

# Counterfactual / Parallel Universe Engine

This is one of the most important features.

Whenever a user rotates:

**Token A → Token B**

Create two tracked outcomes.

## Actual

User sells Token A and buys Token B.

## Counterfactual

Assume the user continued holding Token A.

Track both over predefined horizons such as:

- 1 hour
- 6 hours
- 24 hours
- 3 days
- 7 days

Example:

### Actual

Sold DOGA → Bought CAT

24-hour result:

- -8%

### Counterfactual

Held DOGA

24-hour result:

- +22%

The application can later show:

> Across your last 30 rotations, holding the original position would have outperformed the replacement in 19 cases.

Or:

> Your rotations added value in 63% of cases.

Important: present this as **counterfactual analysis**, not proof that one decision was correct.

---

# Behavioral Fingerprint

After enough trading history, create a personalized behavioral profile.

Example:

## Behavioral Profile

**Conviction:** 82/100  
**Patience:** 41/100  
**FOMO Resistance:** 36/100  
**Rotation Discipline:** 29/100  
**Risk Discipline:** 74/100  

### Primary leak

Premature rotation

### Secondary leak

FOMO entries

### Strength

Strong initial entries

### Best-performing behavior

Holding high-conviction trades for 1–3 days

### Worst-performing behavior

Rotating into tokens already experiencing large short-term price moves

The scores should eventually be based primarily on the trader's own history rather than arbitrary universal thresholds.

---

# Personalized Baselines

A major design principle:

**Compare traders primarily against themselves.**

Instead of saying:

> "Holding for 3 hours is bad."

Say:

> "Your normal holding period is 14 hours. This trade lasted 18 minutes."

Or:

> "You normally use 4% of your portfolio per trade. This position was 13%."

This makes the behavioral analysis more meaningful.

---

# Weekly Behavioral Report

The app should periodically summarize behavior.

Example:

## This Week

- 21 trades
- 7 rotations
- 5 premature exits
- 4 FOMO entries
- 2 revenge-trading events

### Biggest behavioral leak

Premature rotation

### Estimated counterfactual impact

Original positions outperformed replacement positions in 5 of 7 rotations.

### Improvement

Rotation frequency decreased 23% compared with your previous four-week baseline.

### Suggested experiment

For the next 10 high-conviction trades, require a thesis re-evaluation before exiting earlier than 24 hours.

The product should frame recommendations as behavioral experiments rather than guaranteed trading advice.

---

# Social Layer

The application could eventually have public or semi-public trader profiles.

Avoid rankings based solely on P&L because that rewards extreme risk-taking.

Instead, gamify discipline and process.

Potential profile metrics:

- Conviction consistency
- Patience
- FOMO resistance
- Risk discipline
- Rotation discipline
- Thesis adherence
- Behavioral improvement

Potential achievements:

- Thesis Keeper
- Anti-FOMO
- Patient Trader
- Disciplined Exit
- Rotation Reduction
- Risk Consistency
- Tilt Recovery

The social layer should reward behavioral improvement rather than gambling harder.

---

# Onboarding

Onboarding should provide value immediately.

Ideal flow:

1. Connect wallet
2. Import trading history
3. Reconstruct historical trades
4. Detect behavioral patterns
5. Generate initial behavioral report
6. Show user's biggest behavioral leak
7. Ask user to start recording lightweight theses for future trades

The first experience should ideally produce an insight without requiring any manual journaling.

Example onboarding result:

> We analyzed your last 100 trades.
>
> Your most expensive behavior appears to be premature rotation.
>
> You made 42 rotations.
>
> In 27 cases, the original token outperformed the replacement over the next 24 hours.

---

# MVP Scope

Build the smallest version that can validate whether traders find behavioral insights useful.

## MVP Components

### 1. Solana Wallet Connection

Connect a wallet.

### 2. Historical Transaction Import

Fetch swaps and token transfers.

### 3. Trade Reconstruction

Turn wallet transactions into understandable trades.

### 4. Market Price History

Obtain historical token prices around entries/exits.

### 5. Basic Behavioral Classifier

Initially support:

- Premature exit
- Rotation
- FOMO entry
- Overtrading

### 6. Counterfactual Rotation Analysis

Compare original token vs replacement after rotation.

### 7. Dashboard

Show:

- Total trades
- Win rate
- Average holding time
- Rotation count
- Premature exits
- FOMO entries
- Behavioral scores

### 8. Lightweight Thesis Entry

Allow users to define conviction and expected timeframe.

### 9. Weekly Report

Summarize behavioral patterns and improvements.

---

# Suggested Initial Dashboard

Example:

## Your Trading Behavior

| Metric | Score |
|---|---:|
| Conviction | 82 |
| Patience | 41 |
| FOMO Resistance | 33 |
| Rotation Discipline | 29 |
| Risk Discipline | 74 |

### Biggest Leak

**Premature Rotation**

You exited 8 positions earlier than your stated timeframe this week.

### Counterfactual Result

5 of those 8 original tokens outperformed the token you rotated into.

### Suggested Experiment

For your next 10 high-conviction trades, reconsider the thesis before exiting within the first 24 hours.

---

# Architecture Concept

A possible system architecture:

## Frontend

Potential stack:

- Next.js
- React
- TypeScript
- Tailwind
- Solana Wallet Adapter

## Backend

Potential stack:

- Node.js / TypeScript
- PostgreSQL
- Redis for jobs/cache if needed
- Background workers for blockchain and price ingestion

## Blockchain Data

Need APIs/indexers for:

- Solana transaction history
- Token swaps
- Token metadata
- DEX routing
- Wallet activity

Potential providers could include Solana RPC/indexing services.

Provider choice should be evaluated separately based on current pricing, reliability, and API coverage.

## Market Data

Need historical token price data at relatively high resolution.

Requirements:

- Price at entry
- Price at exit
- Price before entry
- Price after exit
- Market cap if available
- Liquidity
- Short-term returns

## Behavioral Engine

Initially rule-based.

Examples:

```text
if actual_hold_time < planned_hold_time * threshold:
    flag premature_exit
```

```text
if sell_token_A and buy_token_B within X minutes:
    flag rotation
```

```text
if token_return_before_entry > threshold:
    flag possible_fomo
```

Over time, rules should become personalized using the user's own behavioral baseline.

Machine learning is not necessary for V1.

---

# Core Entities / Data Model

Potential database entities:

## User

- id
- wallet_address
- created_at

## Trade

- id
- user_id
- token_address
- entry_timestamp
- entry_price
- entry_amount
- exit_timestamp
- exit_price
- realized_pnl
- holding_duration

## Thesis

- id
- trade_id
- conviction_score
- planned_timeframe
- thesis_type
- thesis_text
- invalidation_text
- target
- max_loss

## BehavioralEvent

- id
- user_id
- trade_id
- event_type
- severity
- timestamp
- metadata

Possible event types:

- premature_exit
- rotation
- fomo_entry
- revenge_trade
- overtrade
- profit_cutting
- loss_holding
- thesis_drift
- conviction_inconsistency
- position_size_tilt

## Rotation

- id
- user_id
- source_trade_id
- destination_trade_id
- rotation_timestamp
- time_between_trades

## Counterfactual

- id
- rotation_id
- horizon
- actual_return
- original_token_return
- difference

## BehavioralScore

- user_id
- metric
- score
- calculated_at

---

# Product Questions We Need to Validate

We should not assume the product is useful until these questions are tested.

## Question 1

Do traders actually want to understand behavioral mistakes, or do they only want trade signals?

## Question 2

Can wallet history reconstruct trades accurately enough?

## Question 3

Can the system detect rotations reliably?

## Question 4

Does counterfactual analysis create useful insights?

## Question 5

Will traders voluntarily enter a thesis before or shortly after a trade?

## Question 6

Does showing behavioral feedback actually change future behavior?

## Question 7

Which behavioral metric creates the strongest retention?

Potential candidates:

- Rotation cost
- Missed gains
- FOMO score
- Patience score
- Thesis adherence

---

# Initial Validation Strategy

Start with one user's wallet.

Analyze roughly 50–100 trades.

For each trade, calculate:

- Entry
- Exit
- Holding time
- P&L
- Price movement before entry
- Price movement after exit
- Whether a rotation occurred
- Replacement token performance
- Original token counterfactual performance

Then determine:

1. What behavior causes the largest losses?
2. Are initial token selections actually good?
3. Does rotation improve or hurt performance?
4. Are winners exited too early?
5. Are losers held too long?
6. Does trading frequency increase after losses?
7. Are position sizes correlated with emotional events?

If the engine reveals meaningful patterns that the trader did not already understand clearly, that is evidence the product has value.

---

# Longer-Term Vision

If the product works for individual traders, the behavioral engine could eventually become infrastructure.

Possible future directions:

- Multi-chain support
- Trading-platform integrations
- Wallet integrations
- Behavioral API
- Trader coaching layer
- AI-generated behavioral explanations
- Behavioral alerts
- Anonymous aggregate benchmarks
- Community analytics
- Research datasets

Potential B2B customers could eventually include:

- Wallets
- Exchanges
- Trading terminals
- Portfolio trackers
- Trading communities
- Crypto research platforms

However, the immediate focus should remain on building a useful product for individual traders.

---

# Design Philosophy

The product should feel like:

**Strava / Whoop / Oura for trading behavior**

rather than:

**A trading signal Discord**

The user should feel that the app understands their habits and helps them improve their process.

The system should avoid moralizing.

Instead of:

> "You made a bad trade."

Prefer:

> "This decision resembles a pattern that has historically reduced your returns."

Instead of:

> "Do not sell."

Prefer:

> "You are exiting significantly earlier than planned. Your previous similar exits underperformed holding in 68% of cases."

The goal is better self-awareness and decision quality.

---

# Immediate Goal for Claude

Help design and build an MVP for this behavioral trading engine.

Prioritize:

1. Product architecture
2. Solana wallet/trade ingestion
3. Trade reconstruction
4. Behavioral event detection
5. Rotation detection
6. Counterfactual performance tracking
7. Database schema
8. Simple behavioral scoring
9. Dashboard UX
10. Lightweight thesis capture

Keep V1 simple and rule-based.

Do not over-engineer the AI layer.

The most important thing to validate is:

> **Can we identify a trader's behavioral leaks from their wallet history and present them in a way that changes future decisions?**
