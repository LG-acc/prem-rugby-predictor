import { get, list } from '@vercel/blob';
import { roundConfig, submissionPrefix } from '../lib/round-config.js';
import { results } from '../lib/results.js';

const BASE_STANDINGS = {
  Luke:{points:0,roundsWon:0,correctWinners:0,awayWinners:0,totalPointsDifference:0},
  Jo:{points:0,roundsWon:0,correctWinners:0,awayWinners:0,totalPointsDifference:0},
  Steve:{points:0,roundsWon:0,correctWinners:0,awayWinners:0,totalPointsDifference:0},
  Deb:{points:0,roundsWon:0,correctWinners:0,awayWinners:0,totalPointsDifference:0},
  Cas:{points:0,roundsWon:0,correctWinners:0,awayWinners:0,totalPointsDifference:0},
  Ash:{points:0,roundsWon:0,correctWinners:0,awayWinners:0,totalPointsDifference:0}
};

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
  if (pick.winner === fixture.home) return pick.margin;
  if (pick.winner === fixture.away) return -pick.margin;
  return null;
}

function matchPoints(pick, actual) {
  if (pick.winner !== actual.winner) return 0;
  if (actual.winner === 'Draw') return 25;
  const err = Math.abs(pick.margin - actual.margin);
  if (err === 0) return 25;
  return Math.max(10, 20 - err);
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

    const completedGames = results.games.filter(r=>r.homeScore!=null && r.awayScore!=null).map(r=>r.game);
    const roundScores = [];

    for(const name of roundConfig.players){
      const row = {...BASE_STANDINGS[name]};
      const s = latest.get(name);
      let roundPoints = 0;
      let roundCorrect = 0;
      let roundAway = 0;
      let roundDiff = 0;
      let allFiveCorrect = completedGames.length === roundConfig.fixtures.length;

      if(s){
        for(const game of completedGames){
          const actual = actualFor(game);
          const pick = s.picks.find(p=>p.game===game);
          const fixture = roundConfig.fixtures.find(f=>f.game===game);
          if(!actual || !pick || !fixture){ allFiveCorrect=false; continue; }
          roundPoints += matchPoints(pick,actual);
          const correct = pick.winner === actual.winner;
          if(correct){
            roundCorrect += 1;
            if(actual.awayWon) roundAway += 1;
          } else {
            allFiveCorrect = false;
          }
          const signedPred = predictedSignedMargin(pick,fixture);
          if(signedPred != null) roundDiff += Math.abs(signedPred - actual.signedMargin);
        }
      } else {
        allFiveCorrect = false;
      }

      if(allFiveCorrect) roundPoints += 5;
      row.points += roundPoints;
      row.correctWinners += roundCorrect;
      row.awayWinners += roundAway;
      row.totalPointsDifference += roundDiff;
      roundScores.push({name,roundPoints,row,hasSubmission:Boolean(s)});
    }

    const roundComplete = completedGames.length === roundConfig.fixtures.length;
    let roundWinnerStatus = 'pending';
    let roundWinners = [];
    if(roundComplete){
      const max = Math.max(...roundScores.map(x=>x.roundPoints));
      roundWinners = roundScores.filter(x=>x.roundPoints===max).map(x=>x.name);
      if(roundWinners.length===1){
        const winner = roundScores.find(x=>x.name===roundWinners[0]);
        winner.row.points += 10;
        winner.row.roundsWon += 1;
        roundWinnerStatus = 'awarded';
      }else{
        roundWinnerStatus = 'tie-needs-rule';
      }
    }

    const players = roundScores.map(x=>({name:x.name,...x.row,roundPoints:x.roundPoints}));
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      season:roundConfig.season,
      round:roundConfig.round,
      completedGames,
      roundComplete,
      roundWinnerStatus,
      roundWinners,
      players
    });
  }catch(error){
    console.error('Standings API error',error);
    return res.status(500).json({error:'Standings are temporarily unavailable.'});
  }
}
