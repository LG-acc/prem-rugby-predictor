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
        if (Number.isNaN(received.getTime()) || received > DEADLINE || !submission.beforeDeadline) continue;

        const current = latestByPlayer.get(submission.canonicalName);
        if (!current || new Date(current.receivedAt) < received) {
          latestByPlayer.set(submission.canonicalName, submission);
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    const allSubmitted = PLAYERS.every(name => latestByPlayer.has(name));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    if (!allSubmitted) {
      return res.status(200).json({
        round: 1,
        allSubmitted: false,
        submittedCount: latestByPlayer.size,
        totalPlayers: PLAYERS.length,
        message: 'Predictions will appear once all six players have submitted.'
      });
    }

    return res.status(200).json({
      round: 1,
      allSubmitted: true,
      submittedCount: PLAYERS.length,
      totalPlayers: PLAYERS.length,
      predictions: PLAYERS.map(name => {
        const submission = latestByPlayer.get(name);
        return {
          player: name,
          receivedAt: submission.receivedAt,
          picks: submission.picks.map(p => ({ game: p.game, winner: p.winner, margin: p.margin }))
        };
      })
    });
  } catch (error) {
    console.error('Predictions API error', error);
    return res.status(500).json({ error: 'Predictions are temporarily unavailable.' });
  }
}
