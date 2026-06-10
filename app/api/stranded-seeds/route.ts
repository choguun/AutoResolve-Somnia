import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { somniaTestnet } from '@/lib-web/somnia-chain';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib-web/contract';

export const dynamic = 'force-dynamic';

// v64 (M0): stranded-seed dApp surface. Derives the stranded set
// from on-chain data:
//   1. Get the relayer EOA's full market list (v40 getUserMarkets).
//   2. For each market, read the market struct + the relayer's bets.
//   3. A market is "stranded" iff:
//        a. market.status === Open (0)
//        b. relayer has both YES and NO bets (the auto-seed placed them)
//        c. yesTotal + noTotal === 0.02 STT (the seed-only case — a
//           real user bet would have moved the total above 0.02)
//        d. parseRequestId === 0 (no parse in flight; the parse callback
//           has either succeeded or failed-and-rolled-back)
//   4. A market that's Resolved (status=2) is NOT stranded (the relayer
//      would have claimed via the v63 L1 fix).
//   5. A market that's Resolving (status=1) is mid-flight — skip.
//
// Note: the on-chain derivation can't tell WHY a market is stranded
// (parse-failure cache vs. contract underfunded vs. agent pipeline
// stuck). For that, the operator still needs `railway logs`. But it
// does answer the operator's primary question: "how much of my STT
// is locked in markets that haven't resolved yet?"

const RELAYER_EOA_HARDCODED = (
  process.env.NEXT_PUBLIC_RELAYER_EOA ?? '0x119F9fd07C09B7AD45Ac45c6797e2c2FB97a5fD6'
).toLowerCase() as `0x${string}`;
const SEED_SIZE_PER_MARKET = 20_000_000_000_000_000n; // 0.02 STT in wei

export async function GET() {
  if (
    !CONTRACT_ADDRESS ||
    CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000'
  ) {
    return NextResponse.json(
      { error: 'CONTRACT_ADDRESS not configured', count: 0, markets: [] },
      { status: 503 },
    );
  }
  const publicClient = createPublicClient({
    chain: somniaTestnet,
    transport: http(),
  });
  try {
    // Read the relayer EOA's full market list (v40 ABI view).
    const marketIds = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'getUserMarkets',
      args: [RELAYER_EOA_HARDCODED as `0x${string}`],
    })) as bigint[];
    if (!Array.isArray(marketIds) || marketIds.length === 0) {
      return NextResponse.json({
        eoa: RELAYER_EOA_HARDCODED,
        count: 0,
        totalStrandedStt: '0',
        markets: [],
      });
    }
    // Read all markets + their bet arrays in parallel.
    const marketData = await Promise.all(
      marketIds.map(async (id) => {
        try {
          const market = (await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getMarket',
            args: [id],
          })) as {
            creator: string;
            endTime: bigint;
            yesTotal: bigint;
            noTotal: bigint;
            status: number;
            parseRequestId: bigint;
            inferenceRequestId: bigint;
            resolutionSource: string;
          };
          return { id, market };
        } catch {
          return null;
        }
      }),
    );
    const stranded = [];
    for (const entry of marketData) {
      if (!entry) continue;
      const { id, market } = entry;
      // Open, no parse in flight, total is exactly the seed amount.
      // Also skip the "ghost" market (the empty slot at nextMarketId).
      if (Number(market.status) !== 0) continue; // Open
      if (market.parseRequestId !== 0n) continue;
      // v66 (L1): the route keeps the original `hasYes && hasNo on
      // the bet array` filter. The Somnia state-trie partial-seed
      // bug (userNoBets=0.01 but noTotal=0) is a platform issue, not
      // an AutoResolve bug — from the operator's view, the seed money
      // is still locked (the relayer EOA has 0.02 STT of bets on the
      // market). The v66 (M0) periodic retry will eventually fix
      // the missing-side SSTORE; in the meantime, showing the market
      // as stranded is honest. We do NOT filter on `noTotal === 0`
      // because that would hide the partial-seed markets from the
      // operator and the periodic retry would have no signal that
      // there's work to do.
      //
      // The previous check `yesTotal + noTotal === SEED_SIZE_PER_MARKET`
      // is also dropped — a real user bet would push the totals
      // above 0.02 STT, but the bet-array check is more robust
      // (it proves the relayer EOA has the bets, regardless of the
      // aggregate total).
      let bets: Array<{ better: string; option: number }>;
      try {
        bets = (await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getMarketBets',
          args: [id],
        })) as Array<{ better: string; option: number }>;
      } catch {
        continue;
      }
      const relayerLower = RELAYER_EOA_HARDCODED;
      const hasYes = bets.some(
        (b) => b.better.toLowerCase() === relayerLower && b.option === 0,
      );
      const hasNo = bets.some(
        (b) => b.better.toLowerCase() === relayerLower && b.option === 1,
      );
      if (!hasYes || !hasNo) continue;
      // v66 (L1): tag the entry with a `partialSeed` boolean so the
      // dApp can distinguish fully-stranded from partial-seed
      // markets. A partial seed is a Somnia state-trie artifact
      // (userNoBets[relayer][N] = 0.01 STT but market.noTotal = 0);
      // the relayer's v66 (M0) periodic retry will eventually fix
      // the missing-side SSTORE. The dApp can show a "partial seed"
      // pill so the operator knows which markets are awaiting
      // the retry vs. fully stranded on-chain.
      const partialSeed =
        market.yesTotal === 0n && market.noTotal === 0n
          ? true
          : market.yesTotal === 0n || market.noTotal === 0n;
      stranded.push({
        marketId: id.toString(),
        url: market.resolutionSource,
        endTime: market.endTime.toString(),
        partialSeed,
      });
    }
    // Total STT locked: stranded.length * 0.02 STT. Use 1e15 as the
    // divisor so the result is in 0.001 STT units (the smallest
    // unit the dApp cares about). Integer division is fine here —
    // 0.001 STT precision is enough for the operator card. e.g.
    // 2 markets * 0.02 STT = 0.04 STT = 40 (in 0.001 STT units).
    const totalStrandedMilliStt = (
      (BigInt(stranded.length) * SEED_SIZE_PER_MARKET) /
      1_000_000_000_000_000n
    ).toString();
    // Format the millistt value back to a human-readable string in
    // STT (e.g. "0.040").
    const totalStrandedStt = (Number(totalStrandedMilliStt) / 1000).toFixed(3);
    return NextResponse.json(
      {
        eoa: RELAYER_EOA_HARDCODED,
        count: stranded.length,
        totalStrandedStt,
        markets: stranded,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=10, s-maxage=10',
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to read stranded-seeds from chain',
        message: err instanceof Error ? err.message : String(err),
        count: 0,
        markets: [],
      },
      { status: 502 },
    );
  }
}
