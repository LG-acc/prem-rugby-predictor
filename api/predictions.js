import { get, list } from '@vercel/blob';
import { roundConfig, submissionPrefix } from '../lib/round-config.js';

const PLAYERS = roundConfig.players;
const DEADLINE = new Date(roundConfig.firstKickoff);
const PREFIX = submissionPrefix();

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
    const now = new Date();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    if (now < DEADLINE) {
      return res.status(200).json({
        season: roundConfig.season,
        round: roundConfig.round,
        locked: true,
        revealAt: roundConfig.firstKickoff,
        revealAtDisplay: roundConfig.firstKickoffDisplay,
        fixtures: roundConfig.fixtures.map(f => ({ game: f.game, home: f.home, away: f.away })),
        message: 'Predictions will be revealed when the first fixture kicks off.'
      });
    }

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

    return res.status(200).json({
      season: roundConfig.season,
      round: roundConfig.round,
      locked: false,
      revealAt: roundConfig.firstKickoff,
      revealAtDisplay: roundConfig.firstKickoffDisplay,
      submittedCount: latestByPlayer.size,
      totalPlayers: PLAYERS.length,
      fixtures: roundConfig.fixtures.map(f => ({ game: f.game, home: f.home, away: f.away })),
      predictions: PLAYERS.filter(name => latestByPlayer.has(name)).map(name => {
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
