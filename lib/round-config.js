import { badgeFor } from './team-badges.js';

const fixtures = [
  { game: 1, home: 'Bristol Bears', away: 'Leicester Tigers', kickoffIso: '2026-10-30T19:45:00Z', kickoff: 'Friday, 30 October 2026 – 19:45' },
  { game: 2, home: 'Exeter Chiefs', away: 'Harlequins', kickoffIso: '2026-10-31T15:00:00Z', kickoff: 'Saturday, 31 October 2026 – 15:00' },
  { game: 3, home: 'Saracens', away: 'Newcastle Red Bulls', kickoffIso: '2026-10-31T15:00:00Z', kickoff: 'Saturday, 31 October 2026 – 15:00' },
  { game: 4, home: 'Bath Rugby', away: 'Sale Sharks', kickoffIso: '2026-10-31T15:05:00Z', kickoff: 'Saturday, 31 October 2026 – 15:05' },
  { game: 5, home: 'Northampton Saints', away: 'Gloucester Rugby', kickoffIso: '2026-10-31T17:30:00Z', kickoff: 'Saturday, 31 October 2026 – 17:30' }
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
  round: 5,
  firstKickoff: firstFixture.kickoffIso,
  firstKickoffDisplay: firstFixture.kickoff,
  submissionsClosed: false,
  predictionsVisible: false,
  players: ['Luke', 'Jo', 'Steve', 'Deb', 'Cas', 'Ash'],
  fixtures
};

export function submissionPrefix() {
  return `submissions/${roundConfig.season.replace('/', '-')}/round-${roundConfig.round}/`;
}
