export function resolveRoundWinners(rows) {
  let contenders = (rows || []).filter(r => r && r.submitted !== false && r.hasSubmission !== false);
  if (!contenders.length) return [];

  const keepMax = key => {
    const best = Math.max(...contenders.map(r => Number(r[key] || 0)));
    contenders = contenders.filter(r => Number(r[key] || 0) === best);
  };
  const keepMin = key => {
    const best = Math.min(...contenders.map(r => Number(r[key] || 0)));
    contenders = contenders.filter(r => Number(r[key] || 0) === best);
  };

  // Round-winner tiebreaks, in order:
  // 1) Base Points (including the +5 for all five winners)
  // 2) Correct winners in the round
  // 3) Correct away-team winners in the round
  // 4) Lowest total margin error across the round
  // 5) Best individual match score, then second-best, and so on
  keepMax('basePoints');
  if (contenders.length === 1) return contenders;

  keepMax('correctWinners');
  if (contenders.length === 1) return contenders;

  keepMax('awayWinners');
  if (contenders.length === 1) return contenders;

  keepMin('totalMarginDifference');
  if (contenders.length === 1) return contenders;

  const maxMatches = Math.max(...contenders.map(r => (r.matchScores || []).length));
  for (let i = 0; i < maxMatches && contenders.length > 1; i++) {
    const best = Math.max(...contenders.map(r => Number((r.matchScores || [])[i] ?? 0)));
    contenders = contenders.filter(r => Number((r.matchScores || [])[i] ?? 0) === best);
  }

  // If every tiebreak is still identical, all remaining players are joint round winners.
  return contenders;
}
