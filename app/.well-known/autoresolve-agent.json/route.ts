import { NextResponse } from 'next/server';
import { getAutoResolveAgentManifest } from '@/lib-web/agentManifest';
import { getCachedGenerationPromptTemplate } from '@/lib-web/agentManifestServer';

// v25 (L3): see app/api/agent-manifest/route.ts for the rationale. v26
// (H1+M1) routed both endpoints through the shared cached helper in
// `agentManifestServer.ts` to dedupe the readContract and use a single
// module-level publicClient. Identical behavior to /api/agent-manifest —
// kept as a separate route per the .well-known discovery convention.
export async function GET() {
  const manifest = getAutoResolveAgentManifest();
  const prompt = await getCachedGenerationPromptTemplate();
  if (prompt) {
    const [prefix, suffix] = prompt;
    // v32 (H0): see app/api/agent-manifest/route.ts for the rationale. The
    // contract sends "<prefix><topic><suffix>" as a single user message —
    // no system role. Renaming `system` → `userSuffix` matches the actual
    // model architecture so external agents don't misread the prompt
    // structure.
    manifest.creation = {
      ...manifest.creation,
      promptTemplate: { userPrefix: prefix, userSuffix: suffix },
    };
  }
  return NextResponse.json(manifest);
}
