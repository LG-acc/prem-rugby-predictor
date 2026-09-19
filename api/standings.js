import { get, list } from '@vercel/blob';
import { roundConfig, submissionPrefix } from '../lib/round-config.js';
import { results } from '../lib/results.js';
import { seasonState } from '../lib/season-state.js';

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
  const diff = r.homeScore - r.awayScore;
  return {
    winner: diff === 0 ? 'Draw' : diff > 0 ? fixture.home : fixture.away,
    margin: Math.abs(diff),
    signedMargin: diff,
    awayWon: diff < 0,
    home: fixture.home,
    away: fixture.away,
    homeScore: r.homeScore,
    awayScore: r.awayScore
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

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
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
    const roundComplete = completedGames.length === roundConfig.fixtures.length;
    const roundRows = [];

    for(const name of roundConfig.players){
      const s = latest.get(name);
      const stats = blankStats();
      let allFiveCorrect = roundComplete && Boolean(s);

      if(s){
        for(const game of completedGames){
          const actual = actualFor(game);
          const pick = s.picks.find(p=>p.game===game);
          const fixture = roundConfig.fixtures.find(f=>f.game===game);
          if(!actual || !pick || !fixture){
            allFiveCorrect = false;
            continue;
          }

          stats.predictionsMade += 1;
          stats.basePoints += matchPoints(pick,actual);

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

      // +5 stays in Base Points: it is the bonus for predicting all five winners correctly.
      if(allFiveCorrect) stats.basePoints += 5;
      stats.totalPoints = stats.basePoints;

      roundRows.push({name,...stats,hasSubmission:Boolean(s)});
    }

    let roundWinnerStatus = 'pending';
    let roundWinners = [];
    if(roundComplete){
      const max = Math.max(...roundRows.map(x=>x.basePoints));
      roundWinners = roundRows.filter(x=>x.basePoints===max).map(x=>x.name);
      if(roundWinners.length===1){
        const winner = roundRows.find(x=>x.name===roundWinners[0]);
        winner.roundsWon = 1;
        winner.bonusPoints = 10;
        winner.totalPoints = winner.basePoints + winner.bonusPoints;
        roundWinnerStatus = 'awarded';
      }else{
        roundWinnerStatus = 'tie-needs-rule';
      }
    }

    const overallPlayers = roundRows.map(roundRow=>{
      const prior = seasonState.players?.[roundRow.name] || blankStats();
      const combined = addStats(prior,roundRow);
      return {name:roundRow.name,...combined};
    });

    const latestCompletedRound = roundComplete
      ? {round:roundConfig.round,players:roundRows.map(({hasSubmission,...p})=>p)}
      : seasonState.latestCompletedRound;

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
      latestCompletedRound
    });
  }catch(error){
    console.error('Standings API error',error);
    return res.status(500).json({error:'Standings are temporarily unavailable.'});
  }
}
