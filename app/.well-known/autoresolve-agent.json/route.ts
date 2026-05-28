import { NextResponse } from 'next/server';
import { getAutoResolveAgentManifest } from '@/lib-web/agentManifest';

export async function GET() {
  return NextResponse.json(getAutoResolveAgentManifest());
}
