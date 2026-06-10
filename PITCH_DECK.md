# AutoResolve Pitch Deck

## 1. Title

# AutoResolve

**Autonomous prediction market settlement on Somnia**

No human oracle. No backend resolver. Validator-executed agent receipts for every decision.

Live app: https://autoresolve-somnia.vercel.app
Proof page: https://autoresolve-somnia.vercel.app/proof
Contract: `0x48556EA096F4abFFB569916a138Ec946B54A85dE` (deployed 2026-06-09)

---

## 2. The Problem

Prediction markets are only as decentralized as their resolution layer.

Today, most markets still depend on one of these:

- Human dispute committees
- Centralized oracle operators
- Backend scripts controlled by the app team
- Manual admin intervention

That creates latency, subjectivity, trust gaps, and a weak point exactly where money gets settled.

---

## 3. The Insight

Smart contracts are good at escrow and payouts.

AI is good at reading messy real-world information.

But a normal smart contract cannot read a web page or run an LLM, and a normal AI API cannot create a trust-minimized on-chain settlement result.

**Somnia Agents connect those worlds.**

---

## 4. The Solution

AutoResolve is a YES/NO prediction market where outcome resolution is handled by Somnia Agents.

When a market closes:

1. The contract invokes Somnia's **LLM Parse Website** agent.
2. The agent extracts factual evidence from the source URL.
3. The contract invokes Somnia's **LLM Inference** agent.
4. The inference agent classifies the evidence as `YES` or `NO`.
5. The agent callback writes the outcome on-chain.
6. Winners claim their proportional payout.

The result is not just shown in the UI. It changes contract state.

---

## 5. Why Somnia

AutoResolve uses Somnia for the critical path:

- Web extraction from real-world sources
- Deterministic LLM classification
- Validator-executed agent requests
- Public agent receipts
- Asynchronous callbacks into EVM contracts

Without Somnia Agents, AutoResolve would need a centralized resolver server.

With Somnia, the resolver becomes part of the on-chain settlement flow.

---

## 6. Agent-First Design

AutoResolve is built so autonomous agents can interact with it directly.

The contract exposes:

| Function | Purpose |
|---|---|
| `scanResolvableMarkets(cursor, limit)` | Discover expired markets ready for resolution |
| `getAgentMarketContext(marketId)` | Inspect question, source, funding, status, and request IDs |
| `getResolutionFundingStatus()` | Calculate required agent deposit and top-up |
| `requestResolution(marketId)` | Invoke the two-stage Somnia resolver pipeline |
| `agentManifest()` | On-chain description of how agents should interact |

The frontend also exposes:

- `/api/agent-manifest`
- `/.well-known/autoresolve-agent.json`
- `/proof` with a live Agent Command Center

---

## 7. Architecture

```text
User or autonomous resolver
        |
        v
Next.js UI or direct contract call
        |
        v
AutonomousPredictionMarket.sol
        |
        | createRequest(parse)
        v
Somnia LLM Parse Website Agent
        |
        | callback with extracted evidence
        v
AutonomousPredictionMarket.sol
        |
        | createRequest(inference)
        v
Somnia LLM Inference Agent
        |
        | callback with YES/NO
        v
Resolved market + claimable payouts
```

Verification:

- Agent receipts: `agents.testnet.somnia.network`
- On-chain transactions: `shannon-explorer.somnia.network`

---

## 8. What We Built

| Layer | Delivered |
|---|---|
| Smart contract | Market creation, betting, autonomous resolution, payouts |
| Somnia integration | Parse Website agent + LLM Inference agent callbacks |
| Agent discovery | Agent-scannable market context and manifest methods |
| Frontend | Next.js app with wallet connect, markets, create, detail, receipts |
| Proof UI | Live Agent Command Center on `/proof` |
| Deployment | Somnia Shannon + Vercel production |
| Tests | 113 Foundry tests covering market mechanics and agent callback lifecycle |

---

## 9. Live Proof

Current deployment:

- Contract: `0x48556EA096F4abFFB569916a138Ec946B54A85dE` (deployed 2026-06-09)
- Contract balance: ~16.8 STT (well above the 2 STT auto-fund target; the relayer tops up automatically when needed)
- Resolution deposit: ~0.66 STT per resolution (parse 0.36 + inference 0.30)
- AI-created markets: 8 markets with `creator == 0xA1` (the agent-sentinel class). The most recent auto-created market (`#13` — "v63 partial seed test", BBC URL) was created via the relayer's topic-feed path. The dApp's `StrandedSeedsCard` shows `count: 9, totalStrandedStt: "0.180"` — 9 markets with the relayer's auto-seed that haven't resolved yet.

Fresh E2E proof:

- The relayer's first AI-created market on this contract is `#5` ("Will Somnia mainnet launch before 2027?") at tx `0x454a2c…e56c`. The market is in `Open` state with the relayer EOA's seed (0.01 STT YES + 0.01 STT NO).

Completed historical E2E proof:

- Market: `Is the capital of France Paris?`
- Parse receipt: `2400421`
- Inference receipt: `2400485`
- Outcome: `YES`
- Claim transaction: `0x888327...2380`

Completed historical E2E proof (AI-created → AI-resolved):

- Market: `Did a tier-1 LLM agent beat a human on a standard SWE-bench task this week?` (creator `0xA1`)
- Parse receipt: `4254170`
- Inference receipt: `4254291`
- Outcome: `YES`
- Resolution transaction: `0x362daa6f…b5143`

Proof page:

https://autoresolve-somnia.vercel.app/proof

---

## 10. Demo Flow

1. Open `/proof`.
2. Show the **Live Autonomous Resolver Console**.
3. Point out:
   - `scanResolvableMarkets`
   - `getAgentMarketContext`
   - contract funding status
   - resolvable markets
4. Open the completed Parse Website and Inference receipts.
5. Open the app and show market creation/betting.
6. Request resolution on an expired market.
7. Show the resolution timeline and claim flow.

If live agent execution takes longer than the pitch slot, use receipts `2400421` and `2400485`.

---

## 11. Why It Is Novel

AutoResolve is not "a prediction market with AI."

It is an autonomous settlement primitive.

The same pattern can resolve:

- Prediction markets
- Sports markets
- Insurance claims
- DAO milestone payments
- Bounties
- Escrow releases
- Real-world event contracts

Any contract that needs to settle based on facts can use this pattern.

---

## 12. Impact

Prediction markets fail when users do not trust resolution.

AutoResolve makes resolution:

- Autonomous
- Publicly verifiable
- On-chain
- Agent-executed
- Reusable across settlement use cases

The core value is replacing human or backend-controlled settlement with Somnia-native agent execution.

---

## 13. Technical Differentiators

- Two-stage agent pipeline instead of a single opaque answer
- Constrained `YES` / `NO` inference output
- Separate parse and inference request IDs
- Public validator receipt links
- Retry-safe behavior for failed or invalid resolution
- Agent-scannable contract interface
- Machine-readable manifest for external agents
- Full callback and payout test coverage
- Relayer-driven auto-liquidity: the relayer EOA places 0.01 STT YES + 0.01 STT NO on every newly-created market, so fresh markets show non-zero pools from the start instead of `0 STT` totals
- Periodic partial-seed retry: the relayer detects Somnia state-trie partial seeds (where `userNoBets` and `marketBets.push` commit but `market.noTotal` rolls back) and retries the missing side every tick with a 60-attempt cap
- Stranded-seed observability: the dApp's `/api/stranded-seeds` API derives the stranded set from on-chain data; a `StrandedSeedsCard` on `/proof` shows count + total STT locked + per-market detail with a "partial" pill for partial-seed markets
- Backfill-on-startup: the relayer scans `[1, nextMarketId)` on the first tick and seeds any Open market where the relayer EOA hasn't already placed the YES+NO seed
- Relayer-driven auto-funding: the relayer tops up the contract's STT balance whenever it falls below a configurable threshold. Per-refill cap = `min(0.1 * EOA balance, 2 STT)`. No contract bytecode change — the contract's `receive()` function already accepts plain STT transfers

---

## 14. Current Limitations

The current version is intentionally focused:

- Binary YES/NO markets only
- User-supplied resolution sources
- Failed or ambiguous agent results reopen the market for retry
- No protocol fee or governance layer yet
- Demo uses Shannon testnet STT

These are product expansion points, not blockers for the core primitive.

---

## 15. Roadmap

Next steps:

1. Add automated keeper/resolver agent that periodically scans and calls `requestResolution`.
2. Support richer market templates with source validation.
3. Add multi-source evidence aggregation.
4. Add dispute-free cancellation paths for repeatedly unresolvable markets.
5. Expand the settlement primitive to bounties and insurance-style claims.
6. Add protocol fees and treasury routing.

---

## 16. Closing

**AutoResolve turns Somnia Agents into a trust-minimized oracle replacement for real-world settlement.**

The winning side is not chosen by our frontend, our backend, or an admin.

It is chosen by a Somnia agent workflow, verified by public receipts, and written back into contract state.
