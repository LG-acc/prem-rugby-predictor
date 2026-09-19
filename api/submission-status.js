import { timingSafeEqual } from 'node:crypto';
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

function suppliedToken(req) {
  const auth = String(req.headers?.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return String(req.headers?.['x-organizer-token'] || '').trim();
}

function authorised(req) {
  const expected = String(process.env.ORGANIZER_TOKEN || '');
  const supplied = suppliedToken(req);
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ORGANIZER_TOKEN) return res.status(503).json({ error: 'Organiser access has not been configured yet.' });
  if (!authorised(req)) return res.status(401).json({ error: 'Invalid organiser access code.' });

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

    const players = PLAYERS.map(name => {
      const submission = latestByPlayer.get(name);
      return {
        name,
        submitted: Boolean(submission),
        receivedAt: submission?.receivedAt || null
      };
    });
    const submitted = players.filter(p => p.submitted).map(p => p.name);
    const missing = players.filter(p => !p.submitted).map(p => p.name);

    return res.status(200).json({
      season: roundConfig.season,
      round: roundConfig.round,
      deadline: roundConfig.firstKickoff,
      deadlineDisplay: roundConfig.firstKickoffDisplay,
      totalPlayers: PLAYERS.length,
      submittedCount: submitted.length,
      players,
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
