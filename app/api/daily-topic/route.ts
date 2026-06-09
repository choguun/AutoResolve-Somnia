import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const TOPICS_FILE = path.join(process.cwd(), 'scripts', 'daily-topics.txt');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Matches "<topic> [duration=<seconds>]" — group 1 = topic, group 2 = seconds.
// Lines without the suffix default to durationHint=86400 (24h) at parse time.
const DURATION_RE = /^(.*?)\s*\[duration=(\d+)\]\s*$/;

type DailyTopic = { topic: string; durationHint: number };

function parseTopicLine(line: string): DailyTopic {
  const m = DURATION_RE.exec(line);
  if (m && m[1] && m[2]) {
    const seconds = Number(m[2]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return { topic: m[1].trim(), durationHint: seconds };
    }
  }
  return { topic: line.trim(), durationHint: 86400 };
}

// Day-of-year in UTC so the daily-topics cycle is identical across timezones.
// Matches the relayer's "one topic per tick" cadence; the relayer's 30s
// polling against a 5-min cache means the day-of-year index can shift at
// most 4 times in 24h (00:00 UTC, plus the next 3 revalidations).
function dayOfYear(): number {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start;
  return Math.floor(diff / 86_400_000);
}

export async function GET() {
  let topics: DailyTopic[] = [];
  try {
    const raw = await fs.readFile(TOPICS_FILE, 'utf8');
    topics = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map(parseTopicLine);
  } catch (err) {
    // v56 (M0): mirror the v47 L1 attribution in app/api/topics/route.ts —
    // a bare `catch {}` left the in-app "today's topic" pill silently
    // rendering as `null` on a fresh clone (no file). The warn fires on
    // every poll while the file is missing, so a deploy hook that creates
    // the file is the recovery.
    console.warn('[api/daily-topic] read failed:', err);
  }

  const today = dayOfYear();

  if (topics.length === 0) {
    return NextResponse.json(
      { topic: null, dayOfYear: today, totalTopics: 0, index: -1, durationHint: 86400 },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  }

  const index = today % topics.length;
  const { topic, durationHint } = topics[index]!;

  return NextResponse.json(
    { topic, dayOfYear: today, totalTopics: topics.length, index, durationHint },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
