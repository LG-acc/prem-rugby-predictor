export function validateRoundResults(fixtures, results) {
  const issues = [];
  const fixtureGames = new Set((fixtures || []).map(f => f.game));
  const seen = new Set();
  let completedCount = 0;

  if (!Array.isArray(fixtures) || fixtures.length === 0) issues.push('No fixtures configured.');
  if (!Array.isArray(results)) issues.push('Results are missing.');

  for (const r of results || []) {
    if (seen.has(r.game)) issues.push(`Duplicate result entry for game ${r.game}.`);
    seen.add(r.game);
    if (!fixtureGames.has(r.game)) issues.push(`Result exists for unknown game ${r.game}.`);

    const homeBlank = r.homeScore == null;
    const awayBlank = r.awayScore == null;
    if (homeBlank !== awayBlank) {
      issues.push(`Game ${r.game} has only one score entered.`);
      continue;
    }
    if (homeBlank && awayBlank) continue;

    if (!Number.isInteger(Number(r.homeScore)) || Number(r.homeScore) < 0 || !Number.isInteger(Number(r.awayScore)) || Number(r.awayScore) < 0) {
      issues.push(`Game ${r.game} has an invalid score.`);
      continue;
    }
    completedCount += 1;
  }

  for (const f of fixtures || []) {
    if (!seen.has(f.game)) issues.push(`Game ${f.game} is missing from the results file.`);
  }

  return {
    issues,
    completedCount,
    complete: issues.length === 0 && completedCount === (fixtures || []).length
  };
}

export function resultsFingerprint(fixtures, results) {
  const byGame = new Map((results || []).map(r => [r.game, r]));
  return (fixtures || []).map(f => {
    const r = byGame.get(f.game) || {};
    const h = r.homeScore == null ? '' : String(r.homeScore);
    const a = r.awayScore == null ? '' : String(r.awayScore);
    return `${f.game}:${h}-${a}`;
  }).join('|');
}
