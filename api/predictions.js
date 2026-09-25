import { get, list } from '@vercel/blob';
import { roundConfig, submissionPrefix } from '../lib/round-config.js';
import { results } from '../lib/results.js';
import { resolveRoundWinners } from '../lib/round-winner.js';

const PLAYERS = roundConfig.players;
const DEADLINE = new Date(roundConfig.firstKickoff);
const PREFIX = submissionPrefix();

async function readJson(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

function resultFor(game) {
  const fixture = roundConfig.fixtures.find(f => f.game === game);
  const r = results.games.find(x => x.game === game);
  if (!fixture || !r || r.homeScore == null || r.awayScore == null) return null;
  const diff = Number(r.homeScore) - Number(r.awayScore);
  return {
    homeScore: Number(r.homeScore),
    awayScore: Number(r.awayScore),
    winner: diff === 0 ? 'Draw' : diff > 0 ? fixture.home : fixture.away,
    margin: Math.abs(diff),
    signedMargin: diff,
    awayWon: diff < 0
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

    const fixturePayload = roundConfig.fixtures.map(f => {
      const actual = resultFor(f.game);
      return {
        game: f.game,
        home: f.home,
        away: f.away,
        kickoff: f.kickoff,
        homeBadge: f.homeBadge,
        awayBadge: f.awayBadge,
        completed: Boolean(actual),
        homeScore: actual?.homeScore ?? null,
        awayScore: actual?.awayScore ?? null
      };
    });

    if (!roundConfig.predictionsVisible && now < DEADLINE) {
      return res.status(200).json({
        season: roundConfig.season,
        round: roundConfig.round,
        locked: true,
        revealAt: roundConfig.firstKickoff,
        revealAtDisplay: roundConfig.firstKickoffDisplay,
        fixtures: fixturePayload,
        players: PLAYERS,
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

    const completedGames = fixturePayload.filter(f => f.completed).map(f => f.game);
    const roundComplete = completedGames.length === roundConfig.fixtures.length;

    const playerRows = PLAYERS.map(name => {
      const submission = latestByPlayer.get(name);
      let correctWinners = 0;
      let awayWinners = 0;
      let totalMarginDifference = 0;

      const picks = roundConfig.fixtures.map(fixture => {
        const pick = submission?.picks?.find(p => p.game === fixture.game) || null;
        const actual = resultFor(fixture.game);
        const points = !submission ? 0 : actual ? matchPoints(pick, actual) : null;

        if (submission && actual && pick) {
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

      const allFiveCorrect = roundComplete && Boolean(submission) && picks.every(p => {
        const actual = resultFor(p.game);
        return actual && p.winner === actual.winner;
      });

      const matchTotal = picks.reduce((sum, p) => sum + (Number.isFinite(Number(p.points)) && p.points != null ? Number(p.points) : 0), 0);
      const allFiveBonus = allFiveCorrect ? 5 : 0;
      const basePoints = matchTotal + allFiveBonus;
      const matchScores = picks.filter(p=>p.points!=null).map(p=>Number(p.points||0)).sort((a,b)=>b-a);

      return {
        player: name,
        submitted: Boolean(submission),
        receivedAt: submission?.receivedAt ?? null,
        picks,
        matchTotal,
        allFiveBonus,
        basePoints,
        correctWinners,
        awayWinners,
        totalMarginDifference,
        matchScores,
        roundWinnerBonus: 0,
        totalPoints: basePoints
      };
    });

    let roundWinnerStatus = 'pending';
    let roundWinners = [];
    if (roundComplete) {
      const winners = resolveRoundWinners(playerRows);
      roundWinners = winners.map(p => p.player);
      for (const winner of winners) {
        winner.roundWinnerBonus = 10;
        winner.totalPoints += 10;
      }
      roundWinnerStatus = winners.length === 1 ? 'awarded' : 'joint-winners';
    }

    const bonuses = [];
    for (const p of playerRows) {
      if (p.allFiveBonus) bonuses.push({ player: p.player, type: 'All 5 winners correct', points: 5 });
      if (p.roundWinnerBonus) bonuses.push({ player: p.player, type: 'Round winner', points: 10 });
    }

    return res.status(200).json({
      season: roundConfig.season,
      round: roundConfig.round,
      locked: false,
      revealAt: roundConfig.firstKickoff,
      revealAtDisplay: roundConfig.firstKickoffDisplay,
      submittedCount: latestByPlayer.size,
      totalPlayers: PLAYERS.length,
      players: PLAYERS,
      fixtures: fixturePayload,
      predictions: playerRows,
      bonuses,
      completedGames,
      roundComplete,
      roundWinnerStatus,
      roundWinners
    });
  } catch (error) {
    console.error('Predictions API error', error);
    return res.status(500).json({ error: 'Predictions are temporarily unavailable.' });
  }
}
