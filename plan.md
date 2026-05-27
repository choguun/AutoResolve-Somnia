# Autonomous Prediction Market Resolver — Comprehensive Implementation Plan

**Project Tagline:** The first fully on-chain, agent-powered prediction market that resolves itself using Somnia’s LLM agents — no humans, no disputes, fully verifiable.

---

## Table of Contents

1. [Concept & Value Proposition](#1-concept--value-proposition)
2. [Architecture Overview](#2-architecture-overview)
3. [Somnia Agent Infrastructure Deep Dive](#3-somnia-agent-infrastructure-deep-dive)
4. [Smart Contract Implementation](#4-smart-contract-implementation)
5. [Frontend Implementation](#5-frontend-implementation)
6. [Resolution Pipeline: Agent Orchestration](#6-resolution-pipeline-agent-orchestration)
7. [Testing, Debugging & Error Handling](#7-testing-debugging--error-handling)
8. [Deployment Configuration](#8-deployment-configuration)
9. [Hackathon Success Playbook](#9-hackathon-success-playbook)
10. [Appendix: Reference Materials](#10-appendix-reference-materials)

---

## 1. Concept & Value Proposition

### 1.1 The Problem

Traditional prediction markets suffer from a fundamental trust bottleneck: **resolution**. Whether it is Polymarket (which relies on UMA's human disputers) or a bespoke oracle solution, someone — a person, a committee, or a centralized off-chain backend — must eventually declare "Yes" or "No." This introduces latency, subjectivity, and a single point of failure. As the Somnia team notes, "Most systems that rely on AI for resolution bolt it on externally. That's where they slow down and where trust gaps appear".

### 1.2 The Solution

AutoResolve is a prediction market where **every market self-resolves**. Using Somnia's native agent infrastructure, the smart contract itself dispatches an LLM-powered web scraper to fetch real-world data, processes the result through a deterministic language model, and writes the outcome back on-chain — all verified by a decentralized subcommittee of validators running consensus over byte-identical outputs.

### 1.3 Why This Wins

| Dimension | Traditional Prediction Markets | AutoResolve |
|---|---|---|
| Resolution | Human oracle / disputer | Autonomous AI agent |
| Trust Model | Centralized operator | Decentralized validator consensus |
| Latency | Hours to days | Minutes (sub-second finality post-consensus) |
| Auditability | Opaque decision | Fully transparent execution receipts |
| Disputes | Common | Impossible (deterministic, consensus-verified) |

---

## 2. Architecture Overview

### 2.1 Full-Stack Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 15+)                      │
│  Market List │ Create Market │ Market Detail │ Agent Receipt Viewer │
└──────────────┬───────────────────────────────────────────────────┬┘
               │  wagmi + viem + RainbowKit                        │
               ▼                                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│               SMART CONTRACT (AutonomousPredictionMarket.sol)      │
│  createMarket() │ bet() │ requestResolution() │ handleAgentResponse() │
└──────────────┬───────────────────────────────────────────────────┬┘
               │  createRequest()                                   ▲
               ▼                                                   │
┌──────────────────────────────────────────────────────────────────┐
│               SOMNIA AGENT PLATFORM (0x037B...76776)              │
│                                                                   │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐  │
│  │  LLM Parse Website   │───▶│     LLM Inference (Qwen3-30B)    │  │
│  │  (Fetch + Scrape)    │    │  (Classify: YES / NO / UNSURE)   │  │
│  └─────────────────────┘    └─────────────────────────────────┘  │
│              │                                                     │
│              ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │           Subcommittee Validator Consensus                    │  │
│  │  (N nodes execute identical compute, agree on output)         │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     VERIFICATION LAYER                             │
│  agents.somnia.network — Execution Receipts (Public, Immutable)    │
│  shannon-explorer.somnia.network — On-Chain Transaction Logs       │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Key Contract Addresses (Testnet)

| Component | Address | Source |
|---|---|---|
| Agent Platform (IAgentRequester) | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |  |
| LLM Inference Agent ID | `12847293847561029384` |  |
| LLM Parse Website Agent ID | Refer to `agents.somnia.network` for latest | Context |
| Agent Registry | `0xaD3101C37F091593fEe7cb471e92b5E9A1205194` |  |

---

## 3. Somnia Agent Infrastructure Deep Dive

### 3.1 The Three Base Agents (Phase 1)

The Somnia network ships with three foundational agent types that developers can invoke directly from smart contracts:

#### 3.1.1 JSON API Request Agent

Standard data fetching from structured web APIs. Useful for pulling specific values (e.g., sports scores, weather metrics) directly into a smart contract. Uses dot-notated queries to extract parameters across structural web endpoints【Context†L7-L8】.

#### 3.1.2 LLM Inference Agent (Qwen3-30B)

The "brain" of the operation. Executes requests to a deterministic LLM using system prompts and text strings. Key capabilities:

- **Structured outputs**: Classification matrices (e.g., "approved" or "denied"), mathematical number responses, chat threads【Context†L8-L9】
- **Tool calling** (`inferToolsChat`): Allows the LLM to drive decision-making directly inside smart contracts【Context†L9-L10】
- **Deterministic execution**: Somnia pins specific model weights, frameworks, temperatures, and seeds to ensure **batch-invariant, byte-identical output** across different node runners. This is the critical property that enables on-chain consensus【Context†L19-L21】

#### 3.1.3 LLM Parse Website Agent

Used when no structured API exists. It crawls a web URL or domain, converts HTML to markdown via Zen browser scraping protocols, and utilizes an LLM to extract specific strings or numbers based on configurable confidence thresholds【Context†L11-L13】. This is the primary agent for resolution — it reads news articles, sports results, or any web-based ground truth.

### 3.2 Deterministic Language Models — The Consensus Secret

This is the architectural innovation that makes AutoResolve possible. Unlike public API providers (OpenAI, Anthropic) where identical prompts can produce subtly different outputs due to floating-point non-determinism, Somnia's agent infrastructure:

- Pins **specific model weights** (Qwen3-30B)
- Fixes **temperature to 0**
- Sets **deterministic seeds**
- Uses **identical frameworks** across all validator nodes
- Ensures **batch-invariant, byte-identical output**【Context†L19-L21】

This means that when five validators in a subcommittee each run the same `inferString()` call, they produce the exact same result. Consensus is a simple byte comparison — not a fuzzy threshold.

### 3.3 Consensus & Subcommittees

- Each agent request is processed by an **elected subcommittee of validators**【Context†L6】
- Developers can specify **custom subcommittee sizes** and **consensus types**【Context†L25-L26】:
  - **Absolute string agreement**: All validators must produce byte-identical output (for classification tasks like YES/NO)
  - **Threshold averaging**: For continuous data like token prices, validators average their results
- Every node generates an **execution receipt** (audit log) allowing anyone to trace exactly how the agent processed data【Context†L6-L7】

### 3.4 Fee Structure

Requests are metered in **STT** (Somnia Test Tokens) on testnet and **SOMI** on mainnet:

- **Invocation fee** = base fee × subcommittee size + gas【Context†L22-L23】
- Any leftover budget is **refunded as a rebate** to the smart contract, which requires implementing a `receive()` function【Context†L23-L24】
- The `getRequestDeposit()` function returns the current required deposit for a request

---

## 4. Smart Contract Implementation

### 4.1 Core Interfaces

#### IAgentRequester Interface

Based on the Somnia agent platform, this is the interface your contract must interact with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentRequester {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function getRequestDeposit() external view returns (uint256);
}

// Response structure returned in callback
struct Response {
    bytes result;
    // Additional fields as defined by Somnia platform
}

enum ResponseStatus {
    Pending,
    Success,
    Failure
}
```

### 4.2 Complete Solidity Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentRequester {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function getRequestDeposit() external view returns (uint256);
}

struct Response {
    bytes result;
}

enum ResponseStatus {
    Pending,   // 0
    Success,   // 1
    Failure    // 2
}

contract AutonomousPredictionMarket {
    // ============ Constants ============
    IAgentRequester public constant PLATFORM =
        IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

    // Agent IDs — verify latest at agents.somnia.network
    uint256 public constant LLM_PARSE_WEBSITE_AGENT_ID = 1459123871459123871;
    uint256 public constant LLM_INFERENCE_AGENT_ID = 12847293847561029384;

    // ============ State ============
    uint256 public nextMarketId;

    enum MarketStatus { Open, Resolving, Resolved }
    enum BetOption { Yes, No }

    struct Market {
        address creator;
        string question;
        string resolutionSource;   // e.g., "bbc.com/sport"
        uint256 endTime;
        uint256 yesTotal;
        uint256 noTotal;
        MarketStatus status;
        bool outcome;              // true = YES, false = NO
        string resolutionReason;
        uint256 agentRequestId;
        uint256 resolvedAt;
    }

    struct Bet {
        address better;
        uint256 amount;
        BetOption option;
    }

    mapping(uint256 => Market) public markets;
    mapping(uint256 => Bet[]) public marketBets;
    mapping(address => mapping(uint256 => uint256)) public userBets; // user => marketId => amount
    mapping(uint256 => uint256) public requestToMarket; // requestId => marketId

    // ============ Events ============
    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        string question,
        string resolutionSource,
        uint256 endTime
    );
    event BetPlaced(
        uint256 indexed marketId,
        address indexed better,
        BetOption option,
        uint256 amount
    );
    event ResolutionRequested(uint256 indexed marketId, uint256 requestId);
    event MarketResolved(
        uint256 indexed marketId,
        bool outcome,
        string reason,
        uint256 timestamp
    );
    event RebateReceived(uint256 amount);

    // ============ Constructor ============
    constructor() {
        nextMarketId = 1;
    }

    // ============ Market Creation ============
    function createMarket(
        string calldata question,
        string calldata resolutionSource,
        uint256 durationSeconds
    ) external returns (uint256 marketId) {
        require(bytes(question).length > 0, "Question required");
        require(bytes(resolutionSource).length > 0, "Source required");
        require(durationSeconds >= 3600, "Min 1 hour duration");

        marketId = nextMarketId++;

        markets[marketId] = Market({
            creator: msg.sender,
            question: question,
            resolutionSource: resolutionSource,
            endTime: block.timestamp + durationSeconds,
            yesTotal: 0,
            noTotal: 0,
            status: MarketStatus.Open,
            outcome: false,
            resolutionReason: "",
            agentRequestId: 0,
            resolvedAt: 0
        });

        emit MarketCreated(marketId, msg.sender, question, resolutionSource, block.timestamp + durationSeconds);
    }

    // ============ Betting ============
    function bet(uint256 marketId, BetOption option) external payable {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Open, "Market not open");
        require(block.timestamp < market.endTime, "Market ended");
        require(msg.value > 0, "Bet amount required");

        if (option == BetOption.Yes) {
            market.yesTotal += msg.value;
        } else {
            market.noTotal += msg.value;
        }

        marketBets[marketId].push(Bet({
            better: msg.sender,
            amount: msg.value,
            option: option
        }));

        userBets[msg.sender][marketId] += msg.value;

        emit BetPlaced(marketId, msg.sender, option, msg.value);
    }

    // ============ Resolution ============
    /// @notice Anyone can trigger resolution after market ends.
    ///         Caller pays agent invocation fee.
    function requestResolution(uint256 marketId) external payable {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Open, "Market not open");
        require(block.timestamp >= market.endTime, "Market still active");
        require(market.agentRequestId == 0, "Already requested");

        market.status = MarketStatus.Resolving;

        // Step 1: Build payload for LLM Parse Website agent
        // This agent fetches the URL, converts HTML → markdown, extracts content
        string memory extractionQuery = string.concat(
            "Extract the outcome of this question: ",
            market.question,
            ". Return ONLY a JSON object with keys: 'outcome' (string), 'confidence' (number 0-100), 'evidence' (string)."
        );

        bytes memory parsePayload = abi.encodeWithSignature(
            "parseWebsite(string,string,uint256)",
            market.resolutionSource,
            extractionQuery,
            uint256(70) // confidence threshold: 70%
        );

        // Step 2: Dispatch to agent platform
        uint256 deposit = PLATFORM.getRequestDeposit();
        require(msg.value >= deposit, "Insufficient deposit");

        uint256 requestId = PLATFORM.createRequest{value: deposit}(
            LLM_PARSE_WEBSITE_AGENT_ID,
            address(this),
            this.handleAgentResponse.selector,
            parsePayload
        );

        market.agentRequestId = requestId;
        requestToMarket[requestId] = marketId;

        emit ResolutionRequested(marketId, requestId);

        // Refund excess
        if (msg.value > deposit) {
            payable(msg.sender).transfer(msg.value - deposit);
        }
    }

    // ============ Agent Callback ============
    /// @notice Called by Somnia Agent Platform after consensus is reached.
    ///         CRITICAL: Only the platform may call this.
    function handleAgentResponse(
        uint256 requestId,
        Response[] calldata responses,
        ResponseStatus status
    ) external {
        require(msg.sender == address(PLATFORM), "Only platform");
        require(status != ResponseStatus.Pending, "Still pending");

        uint256 marketId = requestToMarket[requestId];
        require(marketId > 0, "Unknown request");

        Market storage market = markets[marketId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            // Decode the agent's response
            // The LLM Parse Website agent returns structured JSON
            string memory result = abi.decode(responses[0].result, (string));

            // Parse the result to determine outcome
            // In a production setting, you would parse the JSON properly
            // For now, we use a second agent call for classification
            _resolveWithLLMInference(marketId, result);
        } else {
            // Resolution failed — market remains unresolved
            market.status = MarketStatus.Open;
            market.agentRequestId = 0;
        }
    }

    /// @dev Internal: Uses LLM Inference agent to classify the scraped result
    function _resolveWithLLMInference(uint256 marketId, string memory scrapedData) private {
        Market storage market = markets[marketId];

        // Build classification prompt
        string memory prompt = string.concat(
            "Based on the following data, answer ONLY 'YES' or 'NO' to this question: ",
            market.question,
            "\n\nData: ",
            scrapedData,
            "\n\nAnswer (YES or NO only):"
        );

        // Allowed values for deterministic classification
        string[] memory allowedValues = new string[](2);
        allowedValues[0] = "YES";
        allowedValues[1] = "NO";

        bytes memory inferPayload = abi.encodeWithSignature(
            "inferString(string,string,bool,string[])",
            prompt,
            "You are a truthful prediction market resolver. Answer only YES or NO.",
            false, // chainOfThought disabled for strict classification
            allowedValues
        );

        uint256 deposit = PLATFORM.getRequestDeposit();

        uint256 requestId = PLATFORM.createRequest{value: deposit}(
            LLM_INFERENCE_AGENT_ID,
            address(this),
            this.handleInferenceCallback.selector,
            inferPayload
        );

        requestToMarket[requestId] = marketId;
        market.agentRequestId = requestId;
    }

    /// @dev Second-stage callback from LLM Inference agent
    function handleInferenceCallback(
        uint256 requestId,
        Response[] calldata responses,
        ResponseStatus status
    ) external {
        require(msg.sender == address(PLATFORM), "Only platform");

        uint256 marketId = requestToMarket[requestId];
        require(marketId > 0, "Unknown request");

        Market storage market = markets[marketId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            string memory result = abi.decode(responses[0].result, (string));

            bool outcome = _parseYesNo(result);
            market.outcome = outcome;
            market.status = MarketStatus.Resolved;
            market.resolutionReason = result;
            market.resolvedAt = block.timestamp;

            emit MarketResolved(marketId, outcome, result, block.timestamp);
        } else {
            market.status = MarketStatus.Open;
            market.agentRequestId = 0;
        }
    }

    function _parseYesNo(string memory result) private pure returns (bool) {
        // Simple parsing — in production, use more robust logic
        bytes memory resultBytes = bytes(result);
        if (resultBytes.length >= 3) {
            // Check first character
            if (resultBytes[0] == 'Y' || resultBytes[0] == 'y') return true;
            if (resultBytes[0] == 'N' || resultBytes[0] == 'n') return false;
        }
        return false; // Default to NO if unparseable
    }

    // ============ Payouts ============
    function claimWinnings(uint256 marketId) external {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Resolved, "Not resolved");

        uint256 userTotal = userBets[msg.sender][marketId];
        require(userTotal > 0, "No bets");

        // Determine total pool and winning pool
        uint256 totalPool = market.yesTotal + market.noTotal;
        uint256 winningPool = market.outcome ? market.yesTotal : market.noTotal;

        require(winningPool > 0, "No winning pool");

        // Calculate user's share
        uint256 winnings = (userTotal * totalPool) / winningPool;

        // Reset user bets to prevent re-entrancy
        userBets[msg.sender][marketId] = 0;

        payable(msg.sender).transfer(winnings);
    }

    // ============ Rebate Handler ============
    receive() external payable {
        emit RebateReceived(msg.value);
    }

    // ============ View Functions ============
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function getMarketBets(uint256 marketId) external view returns (Bet[] memory) {
        return marketBets[marketId];
    }

    function getRequiredDeposit() external view returns (uint256) {
        return PLATFORM.getRequestDeposit();
    }

    function getTotalPool(uint256 marketId) external view returns (uint256) {
        Market storage market = markets[marketId];
        return market.yesTotal + market.noTotal;
    }
}
```

### 4.3 Key Design Decisions

**Two-Stage Resolution Pipeline**: The contract uses a two-stage agent pipeline rather than a single call:
1. **Stage 1 — LLM Parse Website**: Fetches the resolution source URL, converts HTML to markdown, extracts relevant content with confidence scoring
2. **Stage 2 — LLM Inference**: Takes the scraped content and classifies it as YES or NO using constrained output values

This two-stage approach ensures:
- **Auditability**: Each stage produces its own execution receipt, making the full reasoning chain visible on `agents.somnia.network`
- **Robustness**: If the website scrape fails (e.g., 422 error for unanswerable queries), the market gracefully reverts to Open status rather than resolving incorrectly【Context†L36-L38】
- **Deterministic classification**: The Inference stage uses `allowedValues: ["YES", "NO"]` to constrain the LLM output, eliminating ambiguity

**Rebate Handling**: The `receive()` function captures any refunded STT from the agent platform when the actual compute cost is less than the deposit【Context†L23-L24】.

**Security**: Both callback functions strictly enforce `msg.sender == address(PLATFORM)` to prevent unauthorized resolution.

### 4.4 Advanced: Custom Subcommittee Configuration

For high-stakes markets, you can use advanced `createRequest` variants that accept custom subcommittee sizes and consensus types:

```solidity
// Conceptual — verify exact API against latest Somnia docs
function createRequestAdvanced(
    uint256 agentId,
    address callbackAddress,
    bytes4 callbackSelector,
    bytes calldata payload,
    uint256 subcommitteeSize,    // e.g., 5 validators
    uint256 consensusType        // 0 = absolute string agreement, 1 = threshold
) external payable returns (uint256 requestId);
```

For YES/NO classification, **absolute string agreement** (all validators must produce byte-identical output) is the appropriate consensus type. For numeric outcomes (e.g., "what was the temperature?"), threshold averaging would be more appropriate【Context†L25-L26】.

---

## 5. Frontend Implementation

### 5.1 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | Next.js 15+ (App Router) | Server components, streaming, modern patterns |
| Language | TypeScript | Type safety across agent payloads |
| Styling | Tailwind CSS + shadcn/ui | Rapid, beautiful UI with accessible components |
| Web3 | wagmi v2 + viem + RainbowKit | Best-in-class React hooks for EVM |
| State | TanStack Query (React Query) | Automatic caching, refetching, optimistic updates |
| Notifications | Sonner | Toast notifications for tx lifecycle |

### 5.2 Project Structure

```
AutoResolve-Somnia/
├── app/
│   ├── layout.tsx                    # Root layout with RainbowKit provider
│   ├── page.tsx                      # Home / Market List
│   ├── markets/
│   │   └── page.tsx                  # All markets with filters
│   ├── create/
│   │   └── page.tsx                  # Market creation form
│   ├── market/
│   │   └── [id]/
│   │       └── page.tsx              # Market detail + bet + resolve
│   └── receipt/
│       └── [requestId]/
│           └── page.tsx              # Agent execution receipt viewer
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── markets/
│   │   ├── MarketCard.tsx            # Card in list view
│   │   ├── MarketFilters.tsx         # Filter by status, date
│   │   └── CreateMarketForm.tsx      # Form with validation
│   ├── market/
│   │   ├── MarketHeader.tsx          # Question, timer, status badge
│   │   ├── BetPanel.tsx              # YES/NO betting interface
│   │   ├── ResolutionPanel.tsx       # Trigger resolution + progress
│   │   ├── OutcomeDisplay.tsx        # Final result display
│   │   └── PayoutClaim.tsx           # Claim winnings button
│   ├── receipts/
│   │   ├── AgentReceiptViewer.tsx    # Full JSON receipt explorer
│   │   └── ResolutionTimeline.tsx    # Visual timeline of resolution
│   └── shared/
│       ├── ConnectButton.tsx
│       ├── TxToast.tsx
│       └── LoadingSpinner.tsx
├── lib/
│   ├── somnia.ts                     # wagmi config + chain definition
│   ├── contract.ts                   # Contract address, ABI, read/write helpers
│   ├── agents.ts                     # Agent ID constants, payload builders
│   └── utils.ts                      # Formatting, time helpers
├── hooks/
│   ├── useMarkets.ts                 # TanStack Query hooks for markets
│   ├── useMarketBets.ts
│   ├── useAgentReceipt.ts            # Fetch receipt from agents.somnia.network
│   └── useResolutionStatus.ts        # Poll for resolution completion
└── public/
    └── receipt-placeholder.png
```

### 5.3 wagmi + viem Configuration (`lib/somnia.ts`)

```typescript
import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

// Somnia Testnet (Shannon) Chain Definition
export const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Shannon Testnet',
  nativeCurrency: {
    name: 'Somnia Test Token',
    symbol: 'STT',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://dream-rpc.somnia.network'],
      webSocket: ['wss://dream-rpc.somnia.network/ws'],
    },
    public: {
      http: ['https://dream-rpc.somnia.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Shannon Explorer',
      url: 'https://shannon-explorer.somnia.network',
    },
  },
  testnet: true,
});

// RainbowKit + wagmi config
export const config = getDefaultConfig({
  appName: 'AutoResolve',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID!,
  chains: [somniaTestnet],
  transports: {
    [somniaTestnet.id]: http('https://dream-rpc.somnia.network'),
  },
});
```

### 5.4 Contract Interaction Helpers (`lib/contract.ts`)

```typescript
import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { config } from './somnia';
import { parseEther } from 'viem';

export const CONTRACT_ADDRESS = '0x...'; // Deployed contract address

export const CONTRACT_ABI = [
  // ... full ABI from compiled contract
] as const;

// Read helpers
export async function getMarket(marketId: bigint) {
  return readContract(config, {
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getMarket',
    args: [marketId],
  });
}

export async function getRequiredDeposit() {
  return readContract(config, {
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getRequiredDeposit',
  });
}

// Write helpers
export async function createMarket(
  question: string,
  resolutionSource: string,
  durationSeconds: bigint
) {
  const { request } = await writeContract(config, {
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'createMarket',
    args: [question, resolutionSource, durationSeconds],
  });
  return request;
}

export async function placeBet(marketId: bigint, option: 0 | 1, amount: string) {
  const { request } = await writeContract(config, {
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'bet',
    args: [marketId, option],
    value: parseEther(amount),
  });
  return request;
}

export async function requestResolution(marketId: bigint, deposit: bigint) {
  const { request } = await writeContract(config, {
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'requestResolution',
    args: [marketId],
    value: deposit,
  });
  return request;
}
```

### 5.5 Agent Receipt Viewer (`components/receipts/AgentReceiptViewer.tsx`)

This component is critical for hackathon judging — it demonstrates the **verifiability** of the autonomous resolution:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';

interface AgentReceipt {
  requestId: string;
  agentId: string;
  agentName: string;
  status: 'pending' | 'success' | 'failure';
  subcommittee: {
    size: number;
    consensusType: string;
    nodes: Array<{
      address: string;
      output: string;
      executionTimeMs: number;
    }>;
  };
  payload: {
    url?: string;
    query?: string;
    prompt?: string;
    systemPrompt?: string;
  };
  result: string;
  confidenceScore?: number;
  blockNumber: number;
  timestamp: number;
  txHash: string;
}

export function AgentReceiptViewer({ requestId }: { requestId: string }) {
  const { data: receipt, isLoading } = useQuery<AgentReceipt>({
    queryKey: ['agent-receipt', requestId],
    queryFn: async () => {
      const response = await fetch(
        `https://agents.somnia.network/api/receipts/${requestId}`
      );
      if (!response.ok) throw new Error('Failed to fetch receipt');
      return response.json();
    },
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 5000 : false,
  });

  if (isLoading) return <ReceiptSkeleton />;
  if (!receipt) return <div>Receipt not found</div>;

  return (
    <div className="space-y-6 p-6 bg-gray-900 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-white">Execution Receipt</h3>
        <StatusBadge status={receipt.status} />
      </div>

      {/* Agent Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-400">Agent:</span>{' '}
          <span className="text-white">{receipt.agentName}</span>
        </div>
        <div>
          <span className="text-gray-400">Request ID:</span>{' '}
          <span className="text-white font-mono">{receipt.requestId}</span>
        </div>
      </div>

      {/* Subcommittee Consensus */}
      <div>
        <h4 className="text-lg font-semibold text-white mb-2">
          Validator Consensus ({receipt.subcommittee.size} nodes)
        </h4>
        <div className="space-y-2">
          {receipt.subcommittee.nodes.map((node, i) => (
            <div
              key={i}
              className="flex justify-between p-2 bg-gray-800 rounded text-sm"
            >
              <span className="text-gray-300 font-mono text-xs">
                {node.address.slice(0, 10)}...
              </span>
              <span className="text-green-400">{node.executionTimeMs}ms</span>
              <span className="text-blue-400 font-mono text-xs">
                {node.output.slice(0, 40)}...
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Payload & Result */}
      <div>
        <h4 className="text-lg font-semibold text-white mb-2">Agent Payload</h4>
        <pre className="p-3 bg-gray-800 rounded text-xs text-gray-300 overflow-x-auto">
          {JSON.stringify(receipt.payload, null, 2)}
        </pre>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-white mb-2">Result</h4>
        <div className="p-3 bg-gray-800 rounded text-green-400 font-mono">
          {receipt.result}
        </div>
        {receipt.confidenceScore !== undefined && (
          <div className="mt-2 text-sm text-gray-400">
            Confidence: {receipt.confidenceScore}%
          </div>
        )}
      </div>

      {/* On-chain Verification */}
      <div className="text-xs text-gray-500">
        <span>Block: {receipt.blockNumber}</span>
        {' | '}
        <a
          href={`https://shannon-explorer.somnia.network/tx/${receipt.txHash}`}
          target="_blank"
          className="text-blue-400 hover:underline"
        >
          View on Explorer ↗
        </a>
      </div>
    </div>
  );
}
```

### 5.6 Key UI Screens

#### Market Creation Form

- **Question** textarea with character count
- **Resolution Source** input (domain/URL with validation)
- **Duration** selector (1h, 6h, 24h, 1w, custom)
- **Preview** of how the agent will resolve: "At end time, an AI agent will scrape [source] to determine: [question]"
- **Estimated resolution cost** display (fetched from `getRequiredDeposit()`)

#### Market Detail Page

- **Market Header**: Question, timer countdown, total pool, status badge (Open / Resolving / Resolved)
- **Bet Panel**: YES/NO buttons with amount input, real-time odds display
- **Resolution Panel** (appears after market ends):
  - "Request Resolution" button with cost display
  - Progress indicator during resolution (polling for callback)
  - Agent receipt link once resolved
- **Outcome Display**: Final YES/NO result with reasoning
- **Payout Claim**: Button for winners

#### Market List Page

- Filter tabs: Active, Resolving, Resolved, My Bets
- Each card shows: question, source, pool size, time remaining, status
- Sort by: newest, ending soon, highest volume

---

## 6. Resolution Pipeline: Agent Orchestration

### 6.1 Complete Resolution Flow

```
1. Market ends (block.timestamp >= endTime)
        │
2. Anyone calls requestResolution(marketId)
        │
3. Contract dispatches createRequest() → LLM Parse Website Agent
        │
4. Agent subcommittee fetches URL, converts HTML → Markdown
        │
5. LLM extracts relevant content with confidence scoring
        │
6. Consensus: all N validators agree on byte-identical markdown + extraction
        │
7. handleAgentResponse() callback fires with scraped data
        │
8. Contract dispatches second createRequest() → LLM Inference Agent
        │
9. LLM classifies scraped content as YES or NO (constrained output)
        │
10. Consensus: all validators produce identical YES/NO
        │
11. handleInferenceCallback() fires, market resolved
        │
12. Winners can claim payouts
```

### 6.2 Prompt Engineering for Deterministic Resolution

The quality of resolution depends critically on prompt design. Key principles:

**For LLM Parse Website (extraction):**
```
Extract the outcome of this question: [QUESTION]
Return ONLY a JSON object with keys:
- "outcome" (string): the relevant fact
- "confidence" (number 0-100): how certain you are
- "evidence" (string): direct quote from the page
```

**For LLM Inference (classification):**
```
Based on the following data, answer ONLY 'YES' or 'NO' to this question: [QUESTION]

Data: [SCRAPED_CONTENT]

Answer (YES or NO only):
```

The constraint to `allowedValues: ["YES", "NO"]` combined with temperature=0 and fixed seed ensures deterministic, consensus-compatible output across all validators【Context†L19-L21】.

### 6.3 Handling Edge Cases

| Scenario | Behavior |
|---|---|
| Website unreachable | Agent returns error; market reverts to Open |
| Query unanswerable (e.g., future event) | Agent returns 422 error; market reverts to Open【Context†L36-L38】 |
| Confidence below threshold | Agent returns failure; market reverts to Open |
| Validator disagreement | Consensus failure; market reverts to Open |
| Resolution source changed | Agent scrapes whatever is live at resolution time |

---

## 7. Deployment Configuration

### 7.1 Network Parameters

| Parameter | Testnet (Shannon) | Mainnet |
|---|---|---|
| Chain ID | `50312` | `5031` |
| Currency | STT (test token) | SOMI |
| RPC | `https://dream-rpc.somnia.network` | `https://api.infra.mainnet.somnia.network` |
| Explorer | `https://shannon-explorer.somnia.network` | `https://explorer.somnia.network` |
| Faucet | `https://testnet.somnia.network/` | N/A |

Fromand.

### 7.2 Getting Test Tokens (STT)

Multiple methods available:

1. **Google Cloud Web3 Faucet**: `https://cloud.google.com/application/web3/faucet/somnia/shannon`
2. **Discord**: Join Somnia Discord → `#dev-chat` → tag `@emreyeth` with your wallet address
3. **Telegram**: Join Somnia Developer Telegram, tag `@emreyeth`
4. **Email**: `developers@somnia.foundation` with project description and wallet address

---

## 8. Hackathon Success Playbook

### 8.1 Features That Impress Judges

| Feature | Priority | Why It Wins |
|---|---|---|
| **Live Resolution Demo** | 🔴 Critical | Show a market resolving in real-time with visible agent progress |
| **Agent Receipt Viewer** | 🔴 Critical | Prove verifiability — judges can see every validator's output |
| **Two-Stage Pipeline Visualization** | 🟡 High | Show scraped data → classification flow with timeline |
| **Multi-Market Demo** | 🟡 High | Have 3-4 markets resolving against different sources simultaneously |
| **Confidence Score Display** | 🟢 Medium | Show the LLM's confidence in each resolution |
| **Responsive + Dark Mode** | 🟢 Medium | Polished UI signals production quality |

### 8.2 Demo Script (5-Minute Pitch)

1. **0:00-1:00** — Problem: "Prediction markets are only as trustworthy as their resolution mechanism. Today, that's humans."
2. **1:00-2:00** — Solution: "AutoResolve uses Somnia's native LLM agents to resolve markets autonomously, with every step verified by a decentralized validator subcommittee."
3. **2:00-3:00** — Live Demo: Create a market, place bets, trigger resolution, watch the agent scrape a live website and classify the result
4. **3:00-4:00** — Receipt Deep Dive: Open `agents.somnia.network` and show the execution receipt — all validators produced byte-identical output
5. **4:00-5:00** — Architecture: Walk through the two-stage pipeline, explain deterministic LLMs, contrast with traditional oracles

### 8.3 Key Talking Points

- **"No humans, no disputes"**: The resolution is mathematically deterministic — there is nothing to dispute
- **"Fully on-chain AI"**: Unlike every other prediction market that calls external APIs, Somnia's agents run inside the execution environment with the same consensus guarantees as any transaction
- **"Verifiable by anyone"**: Every execution receipt is public and immutable on `agents.somnia.network`
- **"Built on Somnia's Agentic L1"**: Leveraging the same infrastructure that powers Prophecy Social (2,000+ markets, 5,000+ users in week one)

### 8.4 Checkpoint Deliverables

For the Agentathon midweek checkpoint:

1. **Working smart contract** deployed to Somnia Testnet (Shannon)
2. **Frontend with at least**: Market creation + betting + resolution trigger
3. **At least one successful resolution** with agent receipt available
4. **Short demo video** (2-3 min) walking through the full flow

---

## 9. Appendix: Reference Materials

### 9.1 Key URLs

| Resource | URL |
|---|---|
| Somnia Docs | `https://docs.somnia.network` |
| Agent Explorer & Receipts | `https://agents.somnia.network` |
| Testnet Explorer | `https://shannon-explorer.somnia.network` |
| Testnet Faucet | `https://testnet.somnia.network/` |
| Google Cloud Faucet | `https://cloud.google.com/application/web3/faucet/somnia/shannon` |
| Discord | `https://discord.com/invite/somnia` |

### 9.2 Agent IDs (Verify Latest)

| Agent | ID | Purpose |
|---|---|---|
| LLM Inference (Qwen3-30B) | `12847293847561029384` | Classification, structured output |
| LLM Parse Website | `1459123871459123871` | Web scraping + extraction |
| JSON API Request | *(verify on explorer)* | Structured API data fetching |

**⚠️ Always verify agent IDs at `agents.somnia.network` before deployment**, as they may be updated.

### 9.3 Platform Addresses (Testnet)

| Contract | Address |
|---|---|
| IAgentRequester (Platform) | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| AgentRegistry | `0xaD3101C37F091593fEe7cb471e92b5E9A1205194` |

### 9.4 Further Reading

- **Prophecy Social Case Study**: Real-world prediction market running on Somnia agents — 2,000+ markets resolved autonomously in one week
- **VC Critic Tutorial**: Complete walkthrough of building an LLM-powered dApp on Somnia, including Solidity code, Hardhat config, and event polling
- **Somnia Reactivity**: On-chain event subscriptions enabling contracts to react automatically without backend infrastructure

---

*This implementation plan synthesizes information from Somnia's official documentation, the Agentathon workshop presentation, the Prophecy Social case study, and the VC Critic developer tutorial. All agent IDs, contract addresses, and network parameters should be verified against `docs.somnia.network` and `agents.somnia.network` at time of implementation.*