import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const TOPICS_FILE = path.join(process.cwd(), 'scripts', 'topics.txt');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const raw = await fs.readFile(TOPICS_FILE, 'utf8');
    const topics = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    return NextResponse.json(
      { topics },
      // v35 (M0): Cache-Control public/max-age=5 — the topic list is
      // expected to be polled by AgentCommandCenter + the relayer and is
      // safe to cache for 5s (topics.txt is operator-edited, so a stale
      // read for one polling cycle is harmless). Without the header, every
      // fetch reads the file from disk and Next.js's default `private,
      // no-cache` policy makes the route a serialization hot spot under
      // load.
      { headers: { 'Cache-Control': 'public, max-age=5' } },
    );
  } catch (err) {
    // v47 (L1): surface the missing-file case to operators. The relayer
    // reads scripts/topics.txt from disk separately, so a missing file
    // doesn't break the relayer — but the in-app "Topics in queue" pill
    // silently renders as zero. A bare `catch {}` left the user unable
    // to tell "no topics yet" from "file missing" (fresh clone, CI
    // container). The warn fires on every poll while the file is missing,
    // so a deploy hook that creates the file is the recovery.
    console.warn('[api/topics] read failed:', err);
    return NextResponse.json({ topics: [] });
  }
}
