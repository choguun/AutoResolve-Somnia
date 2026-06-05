import { NextResponse } from 'next/server';
import { getAutoResolveAgentManifest } from '@/lib-web/agentManifest';
import { getCachedGenerationPromptTemplate } from '@/lib-web/agentManifestServer';

// v25 (L3): merge the on-chain prompt template into the manifest response.
// v26 (H1+M1): the read is now memoized in `agentManifestServer.ts` via
// unstable_cache (5 min revalidate) and uses a module-level publicClient.
// See that file for the rationale. If the cached read returns null
// (contract unreachable or function removed) we fall through with the
// static fallback — the manifest is still useful as documentation.
export async function GET() {
  const manifest = getAutoResolveAgentManifest();
  const prompt = await getCachedGenerationPromptTemplate();
  if (prompt) {
    const [prefix, suffix] = prompt;
    manifest.creation = {
      ...manifest.creation,
      promptTemplate: { userPrefix: prefix, system: suffix },
    };
  }
  return NextResponse.json(manifest);
}
