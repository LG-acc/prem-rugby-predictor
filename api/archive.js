import { get, list } from '@vercel/blob';
import { archiveRounds } from '../lib/archive-rounds.js';
import { resolveRoundWinners } from '../lib/round-winner.js';

async function readJson(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text());
}

function prefixFor(season, round) {
  return `submissions/${String(season).replace('/', '-')}/round-${round}/`;
}

function actualFor(round, game) {
  const fixture = round.fixtures.find(f => f.game === game);
  const result = round.results.find(r => r.game === game);
  if (!fixture || !result || result.homeScore == null || result.awayScore == null) return null;
  const diff = Number(result.homeScore) - Number(result.awayScore);
  return {
    winner: diff === 0 ? 'Draw' : diff > 0 ? fixture.home : fixture.away,
    margin: Math.abs(diff),
    signedMargin: diff,
    awayWon: diff < 0,
    homeScore: Number(result.homeScore),
    awayScore: Number(result.awayScore)
  };
}

function predictedSignedMargin(pick, fixture) {
  if (!pick) return null;
  if (pick.winner === 'Draw') return 0;
  if (pick.winner === fixture.home) return Number(pick.margin);
  if (pick.winner === fixture.away) return -Number(pick.margin);
  return null;
}

function matchPoints(pick, actual) {
  if (!pick || !actual || pick.winner !== actual.winner) return 0;
  if (actual.winner === 'Draw') return 25;
  const err = Math.abs(Number(pick.margin) - actual.margin);
  if (err === 0) return 25;
  return Math.max(10, 20 - err);
}

async function latestSubmissions(round) {
  const deadline = new Date(round.firstKickoff);
  const latest = new Map();
  let cursor;
  do {
    const page = await list({ prefix: prefixFor(round.season, round.round), limit: 1000, cursor });
    for (const blob of page.blobs) {
      const s = await readJson(blob.pathname);
      if (!s || !s.valid || !s.recognised || !round.players.includes(s.canonicalName)) continue;
      const t = new Date(s.receivedAt);
      if (Number.isNaN(t.getTime()) || t >= deadline) continue;
      const cur = latest.get(s.canonicalName);
      if (!cur || new Date(cur.receivedAt) < t) latest.set(s.canonicalName, s);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return latest;
}

async function buildRound(round) {
  const latest = await latestSubmissions(round);
  const predictions = round.players.map(name => {
    const submission = latest.get(name);
    let correctWinners = 0;
    let awayWinners = 0;
    let totalMarginDifference = 0;

    const picks = round.fixtures.map(fixture => {
      const pick = submission?.picks?.find(p => p.game === fixture.game) || null;
      const actual = actualFor(round, fixture.game);
      const points = submission ? matchPoints(pick, actual) : 0;

      if (submission && pick && actual) {
        if (pick.winner === actual.winner) {
          correctWinners += 1;
          if (actual.awayWon) awayWinners += 1;
        }
        const signedPred = predictedSignedMargin(pick, fixture);
        if (signedPred != null) totalMarginDifference += Math.abs(signedPred - actual.signedMargin);
      }

      return {
        game: fixture.game,
        winner: pick?.winner ?? null,
        margin: pick?.margin ?? null,
        points
      };
    });

    const allFiveCorrect = Boolean(submission) && picks.every((p, i) => {
      const actual = actualFor(round, round.fixtures[i].game);
      return actual && p.winner === actual.winner;
    });
    const matchTotal = picks.reduce((sum, p) => sum + Number(p.points || 0), 0);
    const allFiveBonus = allFiveCorrect ? 5 : 0;
    return {
      player: name,
      submitted: Boolean(submission),
      picks,
      matchTotal,
      allFiveBonus,
      basePoints: matchTotal + allFiveBonus,
      correctWinners,
      awayWinners,
      totalMarginDifference,
      matchScores: picks.map(p=>Number(p.points||0)).sort((a,b)=>b-a),
      roundWinnerBonus: 0,
      totalPoints: matchTotal + allFiveBonus
    };
  });

  const winners = resolveRoundWinners(predictions);
  for (const winner of winners) {
    winner.roundWinnerBonus = 10;
    winner.totalPoints += 10;
  }

  const bonuses = [];
  for (const p of predictions) {
    if (p.allFiveBonus) bonuses.push({ player: p.player, type: 'All 5 winners correct', points: 5 });
    if (p.roundWinnerBonus) bonuses.push({ player: p.player, type: 'Round winner', points: 10 });
  }

  return {
    season: round.season,
    round: round.round,
    completedAt: round.completedAt || null,
    players: round.players,
    fixtures: round.fixtures.map(f => {
      const actual = actualFor(round, f.game);
      return {
        ...f,
        completed: Boolean(actual),
        homeScore: actual?.homeScore ?? null,
        awayScore: actual?.awayScore ?? null
      };
    }),
    predictions,
    bonuses,
    roundWinnerStatus: winners.length === 1 ? 'awarded' : 'joint-winners',
    roundWinners: winners.map(p=>p.player)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    res.setHeader('Cache-Control', 'no-store');
    const roundNumber = Number(req.query?.round);
    if (roundNumber) {
      const round = archiveRounds.find(r => r.round === roundNumber);
      if (!round) return res.status(404).json({ error: 'Archived round not found.' });
      return res.status(200).json(await buildRound(round));
    }
    return res.status(200).json({
      season: '2026/27',
      rounds: archiveRounds
        .map(r => ({ round: r.round, completedAt: r.completedAt || null }))
        .sort((a, b) => b.round - a.round)
    });
  } catch (error) {
    console.error('Archive API error', error);
    return res.status(500).json({ error: 'Archive is temporarily unavailable.' });
  }
}
