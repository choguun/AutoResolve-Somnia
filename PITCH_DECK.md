# AutoResolve Pitch Deck

## 1. Title

# AutoResolve

**Autonomous prediction market settlement on Somnia**

No human oracle. No backend resolver. Validator-executed agent receipts for every decision.

Live app: https://autoresolve-somnia.vercel.app  
Proof page: https://autoresolve-somnia.vercel.app/proof  
Contract: `0x764Dc86246D242382c7619Fc715d0E3A64B2022b` (v15 live; v19+v40+v45 contract pending deploy; v46-v48 frontend/relayer/tooling only)

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

The v15 (live) / v19+v40+v45 (pending deploy; v46-v48 frontend + relayer + tooling only) contract exposes:

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

- Contract: `0x764Dc86246D242382c7619Fc715d0E3A64B2022b` (v15 live)
- Contract balance: `1.0 STT`
- Resolution deposit: `0.66 STT`
- Seeded markets: `#1`, `#2`

Completed historical E2E proof:

- Market: `Is the capital of France Paris?`
- Parse receipt: `2400421`
- Inference receipt: `2400485`
- Outcome: `YES`
- Claim transaction: `0x888327...2380`

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

