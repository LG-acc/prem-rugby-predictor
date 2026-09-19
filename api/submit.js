import { put } from '@vercel/blob';

const ROUND = 1;
const DEADLINE = new Date('2026-09-25T18:45:00Z');
const FORMSPREE_URL = 'https://formspree.io/f/mwpngaee';

const aliases = new Map([
  ['luke', 'Luke'], ['luke g', 'Luke'],
  ['jo', 'Jo'], ['joanne', 'Jo'], ['jo g', 'Jo'], ['joanne goscomb', 'Jo'], ['jo goscomb', 'Jo'],
  ['steve', 'Steve'], ['steven', 'Steve'], ['biv', 'Steve'], ['bivo', 'Steve'], ['steve g', 'Steve'], ['steven goscomb', 'Steve'], ['steve goscomb', 'Steve'],
  ['deb', 'Deb'], ['debbie', 'Deb'], ['deborah', 'Deb'], ['debbie caswell', 'Deb'], ['deborah caswell', 'Deb'],
  ['cas', 'Cas'], ['gary', 'Cas'],
  ['ash', 'Ash'], ['ashley', 'Ash'],
]);

function normaliseName(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function clean(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function htmlPage(title, message, ok = true) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;color:#213547;margin:0;padding:24px}.card{max-width:600px;margin:60px auto;background:#fff;border:1px solid #e3e7ec;border-radius:14px;padding:28px;box-shadow:0 2px 8px rgba(16,24,40,.06)}h1{color:#0f355e}a{display:inline-block;margin-top:12px;background:#1469c9;color:white;text-decoration:none;padding:11px 15px;border-radius:9px;font-weight:700}.status{font-weight:700;color:${ok ? '#238636' : '#b42318'}}</style></head><body><main class="card"><h1>${escapeHtml(title)}</h1><p class="status">${escapeHtml(message)}</p><p>Your submission has been recorded with a server timestamp.</p><a href="/">Back to predictor</a> <a href="/predictions.html">View predictions</a></main></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end('Method not allowed');
  }

  try {
    const body = req.body || {};
    const enteredName = clean(body['Player Name']);
    const canonicalName = aliases.get(normaliseName(enteredName)) || null;
    const receivedAt = new Date();
    const beforeDeadline = receivedAt <= DEADLINE;

    const picks = [];
    for (let i = 1; i <= 5; i++) {
      const winner = clean(body[`Game ${i} Winner`]);
      const marginRaw = clean(body[`Game ${i} Margin`]);
      const margin = Number(marginRaw);
      if (!winner || !Number.isInteger(margin) || margin < 0) {
        res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(htmlPage('Submission not saved', `Game ${i} needs a winner and a whole-number margin.`, false));
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
      season: '2026/27',
      round: ROUND,
      enteredName,
      canonicalName,
      recognised: Boolean(canonicalName),
      receivedAt: receivedAt.toISOString(),
      beforeDeadline,
      deadline: DEADLINE.toISOString(),
      valid: true,
      picks,
    };

    const safePlayer = (canonicalName || 'unrecognised').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const stamp = receivedAt.toISOString().replace(/[:.]/g, '-');
    await put(`submissions/2026-27/round-1/${safePlayer}/${stamp}.json`, JSON.stringify(submission, null, 2), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: true,
    });

    // Keep the existing email/Formspree trail as a backup and flag unknown names clearly.
    const emailCopy = new URLSearchParams();
    emailCopy.set('_subject', canonicalName ? `PREM Round 1 Predictions – ${canonicalName}` : `UNRECOGNISED NAME – PREM Round 1 – ${enteredName || '(blank)'}`);
    emailCopy.set('Player Name Entered', enteredName);
    emailCopy.set('Recognised As', canonicalName || 'UNRECOGNISED');
    emailCopy.set('Round', String(ROUND));
    emailCopy.set('Received At', receivedAt.toISOString());
    emailCopy.set('Before Deadline', beforeDeadline ? 'Yes' : 'No');
    for (const pick of picks) {
      emailCopy.set(`Game ${pick.game} Winner`, pick.winner);
      emailCopy.set(`Game ${pick.game} Margin`, String(pick.margin));
    }
    try {
      await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: emailCopy.toString(),
      });
    } catch (_) {
      // Blob is the primary record. A temporary email failure must not lose the submission.
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!canonicalName) {
      return res.end(htmlPage('Predictions received', `Saved for review because the name “${enteredName || 'blank'}” was not recognised.`, true));
    }
    if (!beforeDeadline) {
      return res.end(htmlPage('Predictions received', `Saved, but this submission arrived after the Round 1 deadline and will not count for scoring.`, false));
    }
    return res.end(htmlPage('Predictions received', `Thanks ${canonicalName} — your Round 1 predictions were saved. Your latest valid submission before the deadline will count.`, true));
  } catch (error) {
    console.error('Submission error', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(htmlPage('Something went wrong', 'Your predictions could not be saved. Please try again.', false));
  }
}
