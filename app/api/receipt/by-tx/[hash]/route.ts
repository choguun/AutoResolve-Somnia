import { NextResponse } from 'next/server';
import { createPublicClient, http, keccak256, toHex } from 'viem';
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
    const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '').toLowerCase();
    for (const log of receipt.logs) {
      if (contractAddress && log.address.toLowerCase() !== contractAddress) {
        continue;
      }
      if (!log.topics[0]) continue;
      const topic0 = log.topics[0];
      if (topic0 === RESOLUTION_REQUESTED_TOPIC) {
        // topics: [sig, marketId (indexed), requestId (indexed)]
        const requestIdTopic = log.topics[2];
        if (requestIdTopic) resolutionRequestIds.push(BigInt(requestIdTopic));
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
