import { get, list } from '@vercel/blob';
import { roundConfig, submissionPrefix } from '../lib/round-config.js';
import { results } from '../lib/results.js';
import { archiveRounds } from '../lib/archive-rounds.js';
import { resolveRoundWinners } from '../lib/round-winner.js';
import { validateRoundResults, resultsFingerprint } from '../lib/round-audit.js';

function blankStats(){
  return {
    predictionsMade:0,
    correctWinners:0,
    perfectPicks:0,
    awayWinners:0,
    totalMarginDifference:0,
    basePoints:0,
    roundsWon:0,
    bonusPoints:0,
    totalPoints:0
  };
}

async function readJson(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text());
}

function actualFor(game) {
  const r = results.games.find(x => x.game === game);
  if (!r || r.homeScore == null || r.awayScore == null) return null;
  const fixture = roundConfig.fixtures.find(f => f.game === game);
  if (!fixture) return null;
  const diff = Number(r.homeScore) - Number(r.awayScore);
  return {
    winner: diff === 0 ? 'Draw' : diff > 0 ? fixture.home : fixture.away,
    margin: Math.abs(diff),
    signedMargin: diff,
    awayWon: diff < 0,
    home: fixture.home,
    away: fixture.away,
    homeScore: Number(r.homeScore),
    awayScore: Number(r.awayScore)
  };
}

function predictedSignedMargin(pick, fixture) {
  if (pick.winner === 'Draw') return 0;
  if (pick.winner === fixture.home) return Number(pick.margin);
  if (pick.winner === fixture.away) return -Number(pick.margin);
  return null;
}

function matchPoints(pick, actual) {
  if (pick.winner !== actual.winner) return 0;
  if (actual.winner === 'Draw') return 25;
  const err = Math.abs(Number(pick.margin) - actual.margin);
  if (err === 0) return 25;
  return Math.max(10, 20 - err);
}

function addStats(a,b){
  const out = blankStats();
  for(const key of Object.keys(out)) out[key] = Number(a?.[key] || 0) + Number(b?.[key] || 0);
  out.totalPoints = out.basePoints + out.bonusPoints;
  return out;
}

function archivedRoundsForSeason(){
  const rounds = archiveRounds.filter(r => r.season === roundConfig.season);
  const seen = new Set();
  for(const round of rounds){
    if(seen.has(round.round)) throw new Error(`Duplicate archived round ${round.round}`);
    seen.add(round.round);
    if(!round.standings || typeof round.standings !== 'object'){
      throw new Error(`Archived round ${round.round} is missing its standings snapshot`);
    }
  }
  return rounds;
}

function archivedTotals(rounds,name){
  let total = blankStats();
  for(const round of rounds){
    total = addStats(total, round.standings?.[name] || blankStats());
  }
  return total;
}

function latestArchivedRound(rounds){
  if(!rounds.length) return null;
  const latest = [...rounds].sort((a,b)=>b.round-a.round)[0];
  return {
    round:latest.round,
    players:roundConfig.players.map(name=>({name,...addStats(blankStats(),latest.standings?.[name] || blankStats())}))
  };
}

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const archived = archivedRoundsForSeason();
    const archivedRoundNumbers = new Set(archived.map(r=>r.round));
    const currentAlreadyArchived = archivedRoundNumbers.has(roundConfig.round);
    const resultAudit = validateRoundResults(roundConfig.fixtures, results.games);
    const resultFingerprint = resultsFingerprint(roundConfig.fixtures, results.games);

    const deadline = new Date(roundConfig.firstKickoff);
    const latest = new Map();
    let cursor;
    do{
      const page = await list({prefix:submissionPrefix(),limit:1000,cursor});
      for(const blob of page.blobs){
        const s = await readJson(blob.pathname);
        if(!s || !s.valid || !s.recognised || !roundConfig.players.includes(s.canonicalName)) continue;
        const t = new Date(s.receivedAt);
        if(Number.isNaN(t.getTime()) || t >= deadline) continue;
        const cur = latest.get(s.canonicalName);
        if(!cur || new Date(cur.receivedAt) < t) latest.set(s.canonicalName,s);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    }while(cursor);

    const completedGames = results.games
      .filter(r=>r.homeScore!=null && r.awayScore!=null)
      .map(r=>r.game);
    const roundComplete = resultAudit.complete;
    const roundRows = [];

    for(const name of roundConfig.players){
      const s = latest.get(name);
      const stats = blankStats();
      let allFiveCorrect = roundComplete && Boolean(s);
      const matchScores = [];

      if(s){
        for(const game of completedGames){
          const actual = actualFor(game);
          const pick = s.picks.find(p=>p.game===game);
          const fixture = roundConfig.fixtures.find(f=>f.game===game);
          if(!actual || !pick || !fixture){
            allFiveCorrect = false;
            matchScores.push(0);
            continue;
          }

          stats.predictionsMade += 1;
          const points = matchPoints(pick,actual);
          stats.basePoints += points;
          matchScores.push(points);

          const correct = pick.winner === actual.winner;
          if(correct){
            stats.correctWinners += 1;
            if(actual.awayWon) stats.awayWinners += 1;
            if(Number(pick.margin) === actual.margin) stats.perfectPicks += 1;
          }else{
            allFiveCorrect = false;
          }

          const signedPred = predictedSignedMargin(pick,fixture);
          if(signedPred != null) stats.totalMarginDifference += Math.abs(signedPred - actual.signedMargin);
        }
      }else{
        allFiveCorrect = false;
      }

      if(allFiveCorrect) stats.basePoints += 5;
      stats.totalPoints = stats.basePoints;

      roundRows.push({
        name,
        ...stats,
        hasSubmission:Boolean(s),
        matchScores:matchScores.slice().sort((a,b)=>b-a)
      });
    }

    let roundWinnerStatus = 'pending';
    let roundWinners = [];
    if(roundComplete){
      const winners = resolveRoundWinners(roundRows);
      roundWinners = winners.map(x=>x.name);
      for(const winner of winners){
        winner.roundsWon = 1;
        winner.bonusPoints = 10;
        winner.totalPoints = winner.basePoints + winner.bonusPoints;
      }
      roundWinnerStatus = winners.length === 1 ? 'awarded' : 'joint-winners';
    }

    const overallPlayers = roundConfig.players.map(name=>{
      const prior = archivedTotals(archived,name);
      const current = roundRows.find(r=>r.name===name) || blankStats();
      const combined = currentAlreadyArchived ? prior : addStats(prior,current);
      return {name,...combined};
    });

    const reconciliationIssues = [...resultAudit.issues];
    if(roundComplete){
      if(roundRows.length !== roundConfig.players.length) reconciliationIssues.push('Player count does not match the configured league players.');
      for(const row of roundRows){
        const expectedTotal = Number(row.basePoints || 0) + Number(row.bonusPoints || 0);
        if(Number(row.totalPoints || 0) !== expectedTotal) reconciliationIssues.push(`${row.name}: round total does not equal Base Points + Bonus Points.`);
        if(row.hasSubmission && Number(row.predictionsMade || 0) !== roundConfig.fixtures.length) reconciliationIssues.push(`${row.name}: submission does not have a scored prediction for every match.`);
        if(!row.hasSubmission && Number(row.totalPoints || 0) !== 0) reconciliationIssues.push(`${row.name}: non-submitter has non-zero round points.`);
      }
      if(roundWinners.length === 0) reconciliationIssues.push('No round winner could be resolved.');
    }

    const finalisation = {
      ready: roundComplete && reconciliationIssues.length === 0,
      resultsValid: resultAudit.issues.length === 0,
      completedResults: resultAudit.completedCount,
      totalFixtures: roundConfig.fixtures.length,
      recognisedSubmissions: latest.size,
      totalPlayers: roundConfig.players.length,
      nonSubmitters: roundConfig.players.filter(name=>!latest.has(name)),
      allFiveBonusPlayers: roundRows.filter(r=>roundComplete && r.hasSubmission && r.correctWinners===roundConfig.fixtures.length).map(r=>r.name),
      roundWinners,
      roundWinnerStatus,
      resultFingerprint,
      issues: reconciliationIssues
    };

    const latestCompletedRound = roundComplete && !currentAlreadyArchived
      ? {round:roundConfig.round,players:roundRows.map(({hasSubmission,matchScores,...p})=>p)}
      : latestArchivedRound(archived);

    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      season:roundConfig.season,
      round:roundConfig.round,
      completedGames,
      roundComplete,
      roundWinnerStatus,
      roundWinners,
      players:overallPlayers,
      currentRoundPlayers:roundRows,
      latestCompletedRound,
      archivedRounds:archived.map(r=>r.round).sort((a,b)=>a-b),
      currentAlreadyArchived,
      finalisation
    });
  }catch(error){
    console.error('Standings API error',error);
    return res.status(500).json({error:'Standings are temporarily unavailable.'});
  }
}
