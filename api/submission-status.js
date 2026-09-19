import { get, list } from '@vercel/blob';

const PLAYERS = ['Luke', 'Jo', 'Steve', 'Deb', 'Cas', 'Ash'];
const DEADLINE = new Date('2026-09-25T18:45:00Z');
const PREFIX = 'submissions/2026-27/round-1/';

async function readJson(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end('Method not allowed');
  }

  try {
    const latestByPlayer = new Map();
    let cursor;

    do {
      const page = await list({ prefix: PREFIX, limit: 1000, cursor });
      for (const blob of page.blobs) {
        const submission = await readJson(blob.pathname);
        if (!submission || !submission.valid || !submission.recognised || !submission.canonicalName) continue;
        if (!PLAYERS.includes(submission.canonicalName)) continue;

        const received = new Date(submission.receivedAt);
        if (Number.isNaN(received.getTime()) || received >= DEADLINE) continue;

        const current = latestByPlayer.get(submission.canonicalName);
        if (!current || new Date(current.receivedAt) < received) {
          latestByPlayer.set(submission.canonicalName, submission);
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    const submitted = PLAYERS.filter(name => latestByPlayer.has(name));
    const missing = PLAYERS.filter(name => !latestByPlayer.has(name));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      season: '2026/27',
      round: 1,
      deadline: DEADLINE.toISOString(),
      totalPlayers: PLAYERS.length,
      submittedCount: submitted.length,
      submitted,
      missing,
      allSubmitted: missing.length === 0
    });
  } catch (error) {
    console.error('Submission status error', error);
    return res.status(500).json({ error: 'Submission status is temporarily unavailable.' });
  }
}
