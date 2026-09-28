import { badgeFor } from './team-badges.js';

const fixtures = [
  { game: 1, home: 'Bath Rugby', away: 'Exeter Chiefs', kickoffIso: '2026-10-02T18:45:00Z', kickoff: 'Friday, 2 October 2026 – 19:45' },
  { game: 2, home: 'Bristol Bears', away: 'Northampton Saints', kickoffIso: '2026-10-03T14:05:00Z', kickoff: 'Saturday, 3 October 2026 – 15:05' },
  { game: 3, home: 'Gloucester Rugby', away: 'Harlequins', kickoffIso: '2026-10-03T16:30:00Z', kickoff: 'Saturday, 3 October 2026 – 17:30' },
  { game: 4, home: 'Newcastle Red Bulls', away: 'Leicester Tigers', kickoffIso: '2026-10-03T18:45:00Z', kickoff: 'Saturday, 3 October 2026 – 19:45' },
  { game: 5, home: 'Saracens', away: 'Sale Sharks', kickoffIso: '2026-10-04T14:00:00Z', kickoff: 'Sunday, 4 October 2026 – 15:00' }
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
  round: 2,
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
