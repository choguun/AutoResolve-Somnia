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

// v34 (M1): cached reader for the contract's `agentManifest()` string view.
// The view is a constant per contract address (baked in at deploy time), so
// the 5-min revalidate collapses repeated reads while still picking up
// redeploys. The proof page parses the version prefix (e.g. "AutoResolve
// agent interface v19." → "v19") so the page can render the live contract
// version without a hardcoded string. The v33 proof page shipped with
// `contractVersion = 'v19 (pending)'` and `contractVersionNote = 'live on-
// chain is v15'` hardcoded — every contract deploy required a manual
// string edit. The SSR read below closes that drift hazard.
async function readAgentManifestFromChain(): Promise<string | null> {
  try {
    return (await serverPublicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'agentManifest',
    })) as string;
  } catch {
    // Contract unreachable (RPC down, address unset, the function returns
    // nothing, or a v0-of-N contract doesn't expose it). Caller falls back
    // to a 'detecting…' placeholder so the page still renders.
    return null;
  }
}

export const getCachedAgentManifest = unstable_cache(
  readAgentManifestFromChain,
  ['agent-manifest', CONTRACT_ADDRESS],
  { revalidate: 300 }, // 5 min — same cadence as the prompt template
);
