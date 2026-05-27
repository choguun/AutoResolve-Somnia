# AutoResolve Somnia Agentathon Win Plan

**Tagline:** Autonomous prediction markets that resolve themselves with Somnia Agents. No human oracle, no off-chain backend, public validator receipts for every decision.

**Competition timing checked:** 2026-05-27. Public listings describe the Somnia Agentathon as running through June 11, 2026, with submissions expected to include a working prototype/demo, public GitHub repo, and 2-5 minute demo video. The listed judging criteria are functionality, agent-first design, innovation and technical creativity, and autonomous performance.

Sources to keep handy:

- Somnia Agentathon listing: https://www.competehub.dev/en/competitions/encodeclub_agentathon
- Somnia Agents guide: https://blog.somnia.network/p/building-on-the-agentic-l1-a-developers
- Testnet Agent Explorer: https://agents.testnet.somnia.network
- Shannon Explorer: https://shannon-explorer.somnia.network

---

## 1. Current State

AutoResolve is no longer just an implementation idea. It already has the hard parts that judges care about:

| Area | Status | Evidence |
|---|---:|---|
| Solidity contract | Done | `src/AutonomousPredictionMarket.sol` |
| Two-stage agent resolution | Done | Parse Website -> Inference callbacks |
| Shannon deployment | Done | `DEPLOYED.md` |
| Successful end-to-end resolution | Done | Market #1 resolved YES with parse + inference receipts |
| Frontend | Done | Next.js app with market list, create, detail, receipts |
| Receipt viewer | Done | `/receipt/[requestId]` normalizes validator receipts |
| Tests | Partial | Core create/bet/payout tests pass locally |
| Demo assets | Needs final polish | Video, hosted frontend, submission write-up |

Deployed contract:

```text
AutonomousPredictionMarket v2
0x1631303A748076648a0AbbE077a657Ad7812834F
https://shannon-explorer.somnia.network/address/0x1631303A748076648a0AbbE077a657Ad7812834F
```

Successful proof run:

| Proof | Value |
|---|---|
| Market | `#1` - Is the capital of France Paris? |
| Parse request | `2400421` |
| Inference request | `2400485` |
| Outcome | YES |
| Claim tx | `0x8883273b0bb83dbb7f2cb489b7a5b54b9a7591afeaee58bd472e7fb5b57c2380` |

---

## 2. What Must Be True To Win

Judges should be able to understand the project in 20 seconds, verify it in 2 minutes, and remember it after seeing every other demo.

### Core Thesis

Prediction markets are only as decentralized as their resolution layer. AutoResolve turns resolution into a first-class on-chain agent workflow:

1. Contract stores the market and escrowed STT.
2. Anyone triggers resolution after market close.
3. Somnia's LLM Parse Website agent reads the source.
4. Somnia's LLM Inference agent classifies YES/NO.
5. Validator subcommittee reaches consensus.
6. Contract records the outcome.
7. Winners claim payouts.
8. Anyone can inspect receipts.

### Judge Criteria Mapping

| Criterion | What To Show | AutoResolve Proof |
|---|---|---|
| Functionality | Working product, not a mock | Create market, bet, resolve, claim |
| Agent-first design | Agents are necessary, not decorative | Contract cannot read web pages or run LLMs without Somnia Agents |
| Innovation and technical creativity | New resolution primitive | Two-agent pipeline replaces human oracles |
| Autonomous performance | Agent output changes on-chain state | Callback writes the final market outcome and unlocks payouts |

---

## 3. Highest-Leverage Gaps

These are the gaps that matter most for winning. Fix them in order.

### P0 - Submission Package

The current code is stronger than the story. Package it so judges do not have to work.

- Add hosted frontend URL to `README.md`, `DEMO.md`, and `DEPLOYED.md`.
- Record a 2-5 minute video with one complete flow.
- Pin two working receipt links in the submission.
- Add a short "Why Somnia" paragraph near the top of `README.md`.
- Make the public repo easy to scan: architecture diagram, quick start, deployed proof, known limitations.

### P0 - Demo Reliability

Live agent calls are impressive, but a hackathon demo needs a fallback path.

- Keep one already-resolved market visible for proof.
- Keep one expired-but-unresolved market ready for live `Request Resolution`.
- Keep one active 5-minute market ready for create/bet UX.
- Keep explorer and receipt tabs pre-opened.
- If the live request is slow, switch immediately to the known receipt pair `2400421` and `2400485`.

### P0 - Agent-First Framing

The project must not sound like a normal prediction market with AI sprinkled on top. The framing should be:

> AutoResolve is an on-chain escrow and settlement engine whose resolver is a Somnia validator-executed agent workflow.

Emphasize:

- No centralized server decides outcomes.
- No multisig or admin can override a result.
- Resolution output is written through an agent callback.
- Validator receipts show what each runner produced.
- The app is only a frontend; the core product is the contract-agent loop.

### P1 - Contract Hardening Story

Do not overbuild before submission, but be transparent about current constraints.

Current contract strengths:

- Requires callback sender to be Somnia Agent Platform.
- Tracks parse and inference request IDs separately.
- Tracks request stage to reject wrong callback routes.
- Uses separate YES/NO user accounting.
- Reverts failed agent resolution back to Open for retry.
- Implements `receive()` for agent rebates.

Known limitations to acknowledge:

- The current version supports binary YES/NO markets only.
- Resolution source quality is user supplied.
- Failed or ambiguous scrape results require retry rather than dispute.
- Payouts are proportional but there is no fee model yet.

Optional post-submission upgrades:

- Add market cancellation if resolution fails repeatedly.
- Add source allowlist or stronger source validation.
- Add creator bond to reduce spam markets.
- Add protocol fee and treasury.
- Add explicit request cleanup for parse request after inference starts.

### P1 - Receipt Viewer Proof

The receipt viewer is a killer feature. Make it impossible to miss.

- On the market detail page, label receipt links as "Validator receipt" instead of generic "View receipt" if time allows.
- In the video, zoom into:
  - request ID
  - agent name
  - subcommittee node list
  - result/output
  - external explorer link
- In the submission text, include both receipt IDs.

### P1 - Testing Gap

The contract test suite covers core market mechanics, but not agent callbacks.

Before final submission, add a harness or mock tests for:

- parse callback success starts inference
- parse callback failure reopens market
- inference callback success resolves market
- inference callback failure reopens market
- unauthorized callback reverts
- losing bettor cannot claim
- winner cannot claim twice

This matters because agent callbacks are the most novel part of the build.

### P2 - Product Polish

Already improved:

- Production-style app shell
- Responsive market list
- More polished create/detail/receipt surfaces
- Better empty/loading/error states
- Source lint and production build pass

Optional quick wins:

- Add a small "Agent resolved" badge on resolved market cards.
- Show "Parse receipt" and "Inference receipt" side by side on resolved market detail.
- Add copy buttons for contract address and request IDs.
- Add a visible "Deployed on Shannon" link in the footer.

---

## 4. Architecture

```text
User / Wallet
  |
  v
Next.js + wagmi + RainbowKit
  |
  v
AutonomousPredictionMarket.sol
  | createRequest(parse)
  v
Somnia LLM Parse Website Agent
  | callback with extracted evidence
  v
AutonomousPredictionMarket.sol
  | createRequest(inference)
  v
Somnia LLM Inference Agent
  | callback with YES/NO
  v
AutonomousPredictionMarket.sol
  |
  v
Resolved market + claimable payouts

Parallel verification:
Agent receipts -> agents.testnet.somnia.network
On-chain txs -> shannon-explorer.somnia.network
```

Current implementation details:

| Item | Value |
|---|---|
| Chain | Somnia Shannon Testnet |
| Chain ID | `50312` |
| RPC | `https://dream-rpc.somnia.network` |
| Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| Parse Website Agent | `12875401142070969085` |
| Inference Agent | `12847293847561029384` |
| Subcommittee size | `3` |
| Parse cost per agent | `0.10 STT` |
| Inference cost per agent | `0.10 STT` |
| Minimum market duration | `300 seconds` |

Important Somnia integration detail:

`getRequestDeposit()` is only the platform reserve floor. Real requests need:

```text
getRequestDeposit() + pricePerAgent * subcommitteeSize
```

AutoResolve does this with:

- `getParseDeposit()`
- `getInferenceDeposit()`
- `getResolutionDeposit()`

---

## 5. Demo Plan

### 5-Minute Judge Demo

1. **Problem, 30 seconds**
   "Prediction markets fail at resolution. If a human, committee, server, or opaque oracle decides the answer, the market is not truly autonomous."

2. **Product, 45 seconds**
   Open homepage. Show live/resolved markets, pools, status, and the create flow.

3. **Betting, 45 seconds**
   Open a market. Place a small YES or NO bet. Show that the contract escrows STT.

4. **Autonomous resolution, 90 seconds**
   Open an expired market. Click "Request Resolution." Explain parse stage and inference stage while the timeline updates.

5. **Verification, 90 seconds**
   Open receipt pages. Show validator nodes, agent output, request ID, and external explorer link.

6. **Settlement, 30 seconds**
   Show resolved outcome and claim winnings. Close with: "The agent decision is not a UI claim. It is contract state."

### 2-5 Minute Video Structure

Target length: 3 minutes.

| Time | Screen | Script |
|---:|---|---|
| 0:00 | Homepage | "AutoResolve is a prediction market whose resolver is a Somnia Agent workflow." |
| 0:20 | Create form | "A creator supplies a YES/NO question and a public source." |
| 0:45 | Market detail | "Traders stake STT on YES or NO." |
| 1:10 | Resolution panel | "After close, anyone can trigger autonomous resolution." |
| 1:35 | Timeline | "Stage one scrapes the source. Stage two classifies the evidence." |
| 2:05 | Receipt viewer | "Every validator receipt is public. Judges can verify the output." |
| 2:35 | Outcome/claim | "The callback resolves the market and winners claim from the pool." |
| 2:55 | Architecture | "No server resolver, no admin oracle, no human dispute layer." |

### Pre-Demo Checklist

- [ ] `.env` points at `0x1631303A748076648a0AbbE077a657Ad7812834F`.
- [ ] Wallet is on Somnia Shannon, chain ID `50312`.
- [ ] Wallet has enough STT for bets.
- [ ] Contract has enough STT for parse + inference deposits.
- [ ] One resolved market is visible.
- [ ] One expired market is ready for resolution.
- [ ] Receipt pages for `2400421` and `2400485` are preloaded.
- [ ] Browser zoom is 110-125% for recording.
- [ ] README has hosted URL, contract address, and receipt links.

---

## 6. Submission Copy

Use this as the project description:

```text
AutoResolve is an autonomous prediction market on Somnia Shannon where market outcomes are resolved by Somnia Agents instead of humans or centralized oracle operators.

Each market stores a question, source URL, pool, and close time in a Solidity contract. After the market closes, anyone can trigger a two-stage agent pipeline: LLM Parse Website extracts factual evidence from the source, then LLM Inference classifies the result as YES or NO. The agent callback writes the outcome on-chain and winners claim their proportional payout.

The key difference is verifiability. Each agent request produces public validator receipts, so users can inspect which agents ran, what each validator output, and how the final on-chain decision was reached.
```

Use this as the "Why Somnia" answer:

```text
This project is only possible on an Agentic L1. A normal smart contract cannot fetch a webpage or run an LLM, and a normal AI API cannot produce a trust-minimized on-chain decision. Somnia Agents bridge that gap: the contract calls validator-executed agents through an EVM-native interface, receives asynchronous callbacks, and stores the consensus result on-chain.
```

Use this as the one-sentence closer:

```text
AutoResolve makes the resolution layer of prediction markets autonomous, verifiable, and native to Somnia.
```

---

## 7. Final Engineering Checklist

### Must Do Before Submission

- [ ] Confirm `pnpm lint` passes.
- [ ] Confirm `pnpm build` passes.
- [ ] Confirm `pnpm test:contracts` passes.
- [ ] Add deployed frontend URL after hosting.
- [ ] Update `README.md` with final demo video URL.
- [ ] Update `DEPLOYED.md` with any new successful receipt IDs.
- [ ] Make repo public.
- [ ] Submit GitHub URL, app URL, and 2-5 minute video.

### Should Do If Time Allows

- [ ] Add agent callback unit tests.
- [ ] Add copy-to-clipboard buttons for request IDs.
- [ ] Add explorer links to footer/header.
- [ ] Add "Known limitations" section to README.
- [ ] Add one screenshot or GIF to README.

### Avoid Before Submission

- Do not rewrite the contract architecture unless a critical bug appears.
- Do not add a token or governance system.
- Do not chase multi-outcome markets before the demo is locked.
- Do not depend on one live agent request working during the pitch.

---

## 8. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Agent request takes longer than demo window | High | Use pre-resolved market and receipt fallback |
| Source page changes | Medium | Use stable Wikipedia demo sources |
| Contract balance too low for agent deposits | High | Prefund before recording/demo |
| Wallet/network issue | High | Preconfigure wallet and keep explorer proof ready |
| Receipt API slow | Medium | Use direct explorer links and already-open tabs |
| Judges miss why this needs Somnia | High | Say "contract-agent-callback-state update" repeatedly |

---

## 9. Winning Narrative

The strongest version of this submission is not "we built a prediction market." That category is crowded.

The winning narrative is:

> We built an autonomous resolution primitive for prediction markets. Somnia's agent layer lets the contract ask the outside world a question, run deterministic AI over the answer, and settle money based on validator-consensus output.

What judges should remember:

- AutoResolve uses agents in the critical path.
- The agent result changes on-chain state.
- The receipt trail is public and inspectable.
- The use case is obvious and valuable.
- The demo proves the full loop end to end.

---

## 10. File Map

| File | Purpose |
|---|---|
| `src/AutonomousPredictionMarket.sol` | Core contract, market state, bets, agent callbacks, payouts |
| `src/interfaces/IAgentRequester.sol` | Somnia agent platform interface |
| `src/interfaces/ILLMAgents.sol` | Parse Website and Inference selectors |
| `components/market/*` | Market detail, betting, resolution, payout UI |
| `components/markets/*` | Market list and create form |
| `components/receipts/*` | Agent receipt timeline and viewer |
| `hooks/useMarkets.ts` | Market reads, deposit reads, user positions |
| `hooks/useResolutionStatus.ts` | Resolution state helper |
| `hooks/useAgentReceipt.ts` | Receipt polling |
| `lib-web/agents.ts` | Agent IDs, explorer URLs, receipt normalization |
| `lib-web/somnia.ts` | Shannon chain config |
| `DEPLOYED.md` | Current deployed proof |
| `DEMO.md` | Demo operations guide |

