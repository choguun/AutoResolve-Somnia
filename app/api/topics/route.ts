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
    return NextResponse.json({ topics });
  } catch {
    return NextResponse.json({ topics: [] });
  }
}
