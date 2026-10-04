import { badgeFor } from './team-badges.js';

const fixtures = [
  { game: 1, home: 'Leicester Tigers', away: 'Gloucester Rugby', kickoffIso: '2026-10-09T18:45:00Z', kickoff: 'Friday, 9 October 2026 – 19:45' },
  { game: 2, home: 'Northampton Saints', away: 'Bath Rugby', kickoffIso: '2026-10-10T14:05:00Z', kickoff: 'Saturday, 10 October 2026 – 15:05' },
  { game: 3, home: 'Saracens', away: 'Bristol Bears', kickoffIso: '2026-10-10T16:30:00Z', kickoff: 'Saturday, 10 October 2026 – 17:30' },
  { game: 4, home: 'Sale Sharks', away: 'Harlequins', kickoffIso: '2026-10-11T14:00:00Z', kickoff: 'Sunday, 11 October 2026 – 15:00' },
  { game: 5, home: 'Exeter Chiefs', away: 'Newcastle Red Bulls', kickoffIso: '2026-10-11T14:00:00Z', kickoff: 'Sunday, 11 October 2026 – 15:00' }
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
  round: 3,
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
