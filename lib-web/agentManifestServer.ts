import { createPublicClient, http } from 'viem';
import { unstable_cache } from 'next/cache';
import { somniaTestnet } from './somnia-chain';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from './contract';

// v26 (H1+M1): server-only helper for reading the on-chain generation
// prompt template. The contract's getGenerationPromptTemplate() is a `pure`
// function (returns constants baked in at deploy time) — the result is
// constant until a contract upgrade. The v25 L3 route handlers did a
// fresh readContract on every request, which is wasteful for an endpoint
// that external agents may poll for discovery handshakes.
//
// This helper:
// 1. Hoists the viem publicClient to module scope (matching the pattern
//    in scripts/relayer.mjs:128 and hooks/useGenerationFailures.ts:14).
//    The v25 L3 handlers created a new client per request; viem's
//    transport is meant to be shared.
// 2. Wraps the readContract call in Next.js `unstable_cache` with a
//    5-minute revalidate. The 5-min expiry is well below any realistic
//    redeploy cadence. Judges/external agents get a fast (cached) response
//    and can still verify the live prompt via on-chain call.
//
// Filename convention: `lib-web/<thing>.ts` is the client-safe module;
// `<thing>Server.ts` is server-only (mirrors the `somnia.ts` /
// `somnia-chain.ts` split). This file must not be imported from client
// components — the `unstable_cache` import is server-side.

const serverPublicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http('https://dream-rpc.somnia.network'),
});

async function readGenerationPromptTemplateFromChain(): Promise<readonly [string, string] | null> {
  try {
    return (await serverPublicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'getGenerationPromptTemplate',
    })) as readonly [string, string];
  } catch {
    // Contract unreachable (RPC down, address unset, or the function was
    // removed in a future version). Caller falls back to the static
    // promptTemplate in getAutoResolveAgentManifest().
    return null;
  }
}

// unstable_cache is per-process on the server. The cache key includes the
// contract address so a redeploy to a new address is automatically picked
// up. Tag-based revalidation could be wired in via revalidateTag() if a
// future deploy flow needs to bust the cache deterministically.
export const getCachedGenerationPromptTemplate = unstable_cache(
  readGenerationPromptTemplateFromChain,
  ['generation-prompt-template', CONTRACT_ADDRESS],
  { revalidate: 300 }, // 5 min — collapses repeated manifest fetches
);
