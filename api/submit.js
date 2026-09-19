import { put } from '@vercel/blob';
import { roundConfig, submissionPrefix } from '../lib/round-config.js';
import { resolvePlayer } from '../lib/player-aliases.js';

const ROUND = roundConfig.round;
const DEADLINE = new Date(roundConfig.firstKickoff);
const FORMSPREE_URL = 'https://formspree.io/f/mwpngaee';

function clean(value) { return String(value ?? '').trim(); }
function escapeHtml(value) { return String(value).replace(/[&<>'\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch])); }
function htmlPage(title, message, ok = true) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;color:#213547;margin:0;padding:24px}.card{max-width:600px;margin:60px auto;background:#fff;border:1px solid #e3e7ec;border-radius:14px;padding:28px;box-shadow:0 2px 8px rgba(16,24,40,.06)}h1{color:#0f355e}a{display:inline-block;margin-top:12px;background:#1469c9;color:white;text-decoration:none;padding:11px 15px;border-radius:9px;font-weight:700}.status{font-weight:700;color:${ok ? '#238636' : '#b42318'}}</style></head><body><main class="card"><h1>${escapeHtml(title)}</h1><p class="status">${escapeHtml(message)}</p><a href="/">Back to predictor</a> <a href="/predictions.html">View predictions</a></main></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end('Method not allowed');
  }

  try {
    const receivedAt = new Date();
    if (receivedAt >= DEADLINE) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(htmlPage(`Round ${ROUND} is closed`, 'The prediction deadline has passed. No new or revised predictions can be accepted after the first fixture kicks off.', false));
    }

    const body = req.body || {};
    const enteredName = clean(body['Player Name']);
    const canonicalName = resolvePlayer(enteredName);
    const picks = [];

    for (const fixture of roundConfig.fixtures) {
      const i = fixture.game;
      const winner = clean(body[`Game ${i} Winner`]);
      const marginRaw = clean(body[`Game ${i} Margin`]);
      const margin = Number(marginRaw);
      if (!winner || !Number.isInteger(margin) || margin < 0) {
        res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(htmlPage('Submission not saved', `Game ${i} needs a winner and a whole-number margin.`, false));
      }
      const allowed = [fixture.home, 'Draw', fixture.away];
      if (!allowed.includes(winner)) {
        res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(htmlPage('Submission not saved', `Game ${i} has an invalid winner selection.`, false));
      }
      if (winner === 'Draw' && margin !== 0) {
        res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(htmlPage('Submission not saved', `Game ${i}: a draw must have a margin of 0.`, false));
      }
      if (winner !== 'Draw' && margin === 0) {
        res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(htmlPage('Submission not saved', `Game ${i}: a winning team must have a margin of at least 1.`, false));
      }
      picks.push({ game: i, winner, margin });
    }

    const submission = {
      season: roundConfig.season,
      round: ROUND,
      enteredName,
      canonicalName,
      recognised: Boolean(canonicalName),
      receivedAt: receivedAt.toISOString(),
      deadline: roundConfig.firstKickoff,
      valid: true,
      picks,
    };

    const safePlayer = (canonicalName || 'unrecognised').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const stamp = receivedAt.toISOString().replace(/[:.]/g, '-');
    await put(`${submissionPrefix()}${safePlayer}/${stamp}.json`, JSON.stringify(submission, null, 2), {
      access: 'private', contentType: 'application/json', addRandomSuffix: true,
    });

    const emailCopy = new URLSearchParams();
    emailCopy.set('_subject', canonicalName ? `PREM Round ${ROUND} Predictions – ${canonicalName}` : `UNRECOGNISED NAME – PREM Round ${ROUND} – ${enteredName || '(blank)'}`);
    emailCopy.set('Player Name Entered', enteredName);
    emailCopy.set('Recognised As', canonicalName || 'UNRECOGNISED');
    emailCopy.set('Round', String(ROUND));
    emailCopy.set('Received At', receivedAt.toISOString());
    for (const pick of picks) {
      emailCopy.set(`Game ${pick.game} Winner`, pick.winner);
      emailCopy.set(`Game ${pick.game} Margin`, String(pick.margin));
    }
    try {
      await fetch(FORMSPREE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: emailCopy.toString() });
    } catch (_) {}

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!canonicalName) return res.end(htmlPage('Predictions received', `Saved for review because the name “${enteredName || 'blank'}” was not recognised.`, true));
    return res.end(htmlPage('Predictions received', `Thanks ${canonicalName} — your Round ${ROUND} predictions were saved. Your latest valid submission before kickoff will count.`, true));
  } catch (error) {
    console.error('Submission error', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(htmlPage('Something went wrong', 'Your predictions could not be saved. Please try again.', false));
  }
}
