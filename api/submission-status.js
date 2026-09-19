import { get, list } from '@vercel/blob';
import { roundConfig, submissionPrefix } from '../lib/round-config.js';
import { resolvePlayer } from '../lib/player-aliases.js';

const DEADLINE = new Date(roundConfig.firstKickoff);
const PLAYERS = roundConfig.players;
const PREFIX = submissionPrefix();

async function readJson(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text());
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const latestByPlayer = new Map();
    const unresolved = [];
    let cursor;

    do {
      const page = await list({ prefix: PREFIX, limit: 1000, cursor });
      for (const blob of page.blobs) {
        const submission = await readJson(blob.pathname);
        if (!submission || !submission.valid) continue;

        const received = new Date(submission.receivedAt);
        if (Number.isNaN(received.getTime()) || received >= DEADLINE) continue;

        const canonicalName = resolvePlayer(submission.enteredName) || submission.canonicalName || null;
        if (!canonicalName || !PLAYERS.includes(canonicalName)) {
          unresolved.push({ enteredName: submission.enteredName || '', receivedAt: submission.receivedAt });
          continue;
        }

        const current = latestByPlayer.get(canonicalName);
        if (!current || new Date(current.receivedAt) < received) {
          latestByPlayer.set(canonicalName, submission);
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    const submitted = PLAYERS.filter(name => latestByPlayer.has(name));
    const missing = PLAYERS.filter(name => !latestByPlayer.has(name));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      season: roundConfig.season,
      round: roundConfig.round,
      deadline: roundConfig.firstKickoff,
      deadlineDisplay: roundConfig.firstKickoffDisplay,
      totalPlayers: PLAYERS.length,
      submittedCount: submitted.length,
      submitted,
      missing,
      allSubmitted: missing.length === 0,
      unresolvedCount: unresolved.length,
      unresolved
    });
  } catch (error) {
    console.error('Submission status error', error);
    return res.status(500).json({ error: 'Submission status is temporarily unavailable.' });
  }
}
