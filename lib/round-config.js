import { badgeFor } from './team-badges.js';

const fixtures = [
  { game: 1, home: 'Harlequins', away: 'Bath Rugby', kickoffIso: '2026-09-25T18:45:00Z', kickoff: 'Friday, 25 September 2026 – 19:45' },
  { game: 2, home: 'Northampton Saints', away: 'Newcastle Red Bulls', kickoffIso: '2026-09-25T18:45:00Z', kickoff: 'Friday, 25 September 2026 – 19:45' },
  { game: 3, home: 'Exeter Chiefs', away: 'Gloucester Rugby', kickoffIso: '2026-09-26T14:05:00Z', kickoff: 'Saturday, 26 September 2026 – 15:05' },
  { game: 4, home: 'Sale Sharks', away: 'Bristol Bears', kickoffIso: '2026-09-26T16:30:00Z', kickoff: 'Saturday, 26 September 2026 – 17:30' },
  { game: 5, home: 'Leicester Tigers', away: 'Saracens', kickoffIso: '2026-09-27T14:00:00Z', kickoff: 'Sunday, 27 September 2026 – 15:00' }
].map(fixture => ({
  ...fixture,
  homeBadge: badgeFor(fixture.home),
  awayBadge: badgeFor(fixture.away)
}));

const firstFixture = fixtures.reduce((earliest, fixture) =>
  new Date(fixture.kickoffIso) < new Date(earliest.kickoffIso) ? fixture : earliest
);

export const roundConfig = {
  season: '2026/27',
  round: 1,
  firstKickoff: firstFixture.kickoffIso,
  firstKickoffDisplay: firstFixture.kickoff,
  players: ['Luke', 'Jo', 'Steve', 'Deb', 'Cas', 'Ash'],
  fixtures
};

export function submissionPrefix() {
  return `submissions/${roundConfig.season.replace('/', '-')}/round-${roundConfig.round}/`;
}
