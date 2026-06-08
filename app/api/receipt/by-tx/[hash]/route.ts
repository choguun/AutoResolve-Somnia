import { NextResponse } from 'next/server';
import { createPublicClient, decodeAbiParameters, http, keccak256, toHex } from 'viem';
import { somniaTestnet } from '@/lib-web/somnia-chain';

export const dynamic = 'force-dynamic';

// v15: reverse-lookup a tx hash to the platform requestId(s) it produced.
// Used by GenerateMarketForm to navigate the user from the tx-confirmed toast
// to `/receipt/<requestId>` without a second client-side log-decode step.
//
// We fetch the tx receipt from the Shannon RPC, filter logs emitted by the
// AutoResolve contract, and decode the `ResolutionRequested` and
// `GenerationRequested` event topics. The `requestId` is the second topic
// for `GenerationRequested` (the indexed arg) and the third for
// `ResolutionRequested` (after the indexed `marketId`).

// keccak256("ResolutionRequested(uint256,uint256,uint8)") — RequestStage is uint8.
const RESOLUTION_REQUESTED_TOPIC = keccak256(
  toHex('ResolutionRequested(uint256,uint256,uint8)')
);
// keccak256("GenerationRequested(uint256,string)")
const GENERATION_REQUESTED_TOPIC = keccak256(
  toHex('GenerationRequested(uint256,string)')
);

const rpcPublicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http('https://dream-rpc.somnia.network'),
});

function isHexHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;
  if (!hash || !isHexHash(hash)) {
    return NextResponse.json({ error: 'Invalid transaction hash' }, { status: 400 });
  }

  try {
    const receipt = await rpcPublicClient.getTransactionReceipt({
      hash: hash as `0x${string}`,
    });
    if (!receipt) {
      return NextResponse.json(
        { error: 'Transaction not yet indexed', hash },
        { status: 404 }
      );
    }

    const resolutionRequestIds: bigint[] = [];
    const generationRequestIds: bigint[] = [];

    // The AutoResolve contract emits both `ResolutionRequested` and
    // `GenerationRequested`; the Somnia platform may also emit its own logs
    // (e.g. `RequestCreated`). We only care about the AutoResolve contract's
    // logs — `log.address` is the contract that emitted the event.
    // v32 (L3): when NEXT_PUBLIC_CONTRACT_ADDRESS is unset (local dev
    // without a deploy), the filter below is bypassed entirely — every
    // log in the tx is checked against the event signatures. The risk is
    // low (the event signatures are AutoResolve-specific) but a wrong-
    // contract match would surface a bogus requestId. Log a one-time
    // warning so the operator notices the unset env.
    // v36 (L0): also surface the unset state to the CLIENT via the
    // `contractFilterApplied` response flag, so the form can show a
    // one-time toast. The console.warn is fine for an operator, but
    // a user who navigates to the by-tx URL directly (e.g. via the
    // explorer deep link) never sees the dev-server logs.
    const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '').toLowerCase();
    const contractFilterApplied = !!contractAddress;
    if (!contractAddress) {
      console.warn(
        '[api/receipt/by-tx] NEXT_PUBLIC_CONTRACT_ADDRESS is unset; contract-address filter is permissive. ' +
        'Set it in .env for production-grade accuracy.',
      );
    }
    for (const log of receipt.logs) {
      if (contractAddress && log.address.toLowerCase() !== contractAddress) {
        continue;
      }
      if (!log.topics[0]) continue;
      const topic0 = log.topics[0];
      if (topic0 === RESOLUTION_REQUESTED_TOPIC) {
        // topics: [sig, marketId (indexed)]
        // data: abi.encode(uint256 requestId, uint8 stage)
        // v38 (M0): only marketId is indexed in the contract event
        // `ResolutionRequested(uint256 indexed marketId, uint256 requestId, RequestStage stage)`.
        // Pre-v38, this read `log.topics[2]` (undefined) and the L90
        // null-guard prevented a throw but silently dropped the
        // requestId from mixed txs (GenerationRequested +
        // ResolutionRequested in the same receipt). Decode the
        // requestId from log.data via decodeAbiParameters — same
        // pattern as useGenerationFailures:104 and the v37 H0
        // logResolvedMarkets fix.
        try {
          const decoded = decodeAbiParameters(
            [{ type: 'uint256' }, { type: 'uint8' }],
            log.data,
          );
          if (decoded[0]) resolutionRequestIds.push(decoded[0]);
        } catch (err) {
          // v49 (L1): surface the malformed-log case to operators. The
          // v38 (M0) fix moved the requestId decode from log.topics[2]
          // to log.data via decodeAbiParameters — a malformed log
          // (truncated, wrong shape) would throw. A bare `catch {}` left
          // the dev-server logs empty; an operator hitting a 404
          // ("No AutoResolve request events found in this transaction")
          // on a real AutoResolve tx couldn't tell "the tx has no
          // AutoResolve events" from "the events were malformed and we
          // silently dropped them." Matches the v47 (L1) /api/topics
          // console.warn pattern.
          console.warn(`[api/receipt/by-tx] ResolutionRequested log decode threw for tx=${hash}:`, err);
          // Malformed log (truncated, wrong shape) — skip this entry.
        }
      } else if (topic0 === GENERATION_REQUESTED_TOPIC) {
        // topics: [sig, requestId (indexed)]
        const requestIdTopic = log.topics[1];
        if (requestIdTopic) generationRequestIds.push(BigInt(requestIdTopic));
      }
    }

    if (resolutionRequestIds.length === 0 && generationRequestIds.length === 0) {
      return NextResponse.json(
        {
          error: 'No AutoResolve request events found in this transaction',
          hash,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      hash,
      contractAddress: contractAddress || null,
      // v36 (L0): false when NEXT_PUBLIC_CONTRACT_ADDRESS is unset (the
      // contract-address log filter at L75 is bypassed). GenerateMarketForm
      // shows a one-time warning toast on `contractFilterApplied === false`.
      contractFilterApplied,
      blockNumber: receipt.blockNumber.toString(),
      resolutionRequestIds: resolutionRequestIds.map((id) => id.toString()),
      generationRequestIds: generationRequestIds.map((id) => id.toString()),
      // Convenience field for the typical single-call tx: the first id found,
      // preferring generation over resolution (matches GenerateMarketForm UX).
      primaryRequestId: (
        generationRequestIds[0] ?? resolutionRequestIds[0]
      )?.toString(),
      primaryKind: generationRequestIds.length > 0 ? 'generation' : 'resolution',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch transaction';
    return NextResponse.json({ error: message, hash }, { status: 500 });
  }
}
