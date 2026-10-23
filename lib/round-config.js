import { badgeFor } from './team-badges.js';

const fixtures = [
  { game: 1, home: 'Gloucester Rugby', away: 'Bath Rugby', kickoffIso: '2026-10-23T18:45:00Z', kickoff: 'Friday, 23 October 2026 – 19:45' },
  { game: 2, home: 'Newcastle Red Bulls', away: 'Sale Sharks', kickoffIso: '2026-10-23T18:45:00Z', kickoff: 'Friday, 23 October 2026 – 19:45' },
  { game: 3, home: 'Leicester Tigers', away: 'Northampton Saints', kickoffIso: '2026-10-24T14:05:00Z', kickoff: 'Saturday, 24 October 2026 – 15:05' },
  { game: 4, home: 'Bristol Bears', away: 'Exeter Chiefs', kickoffIso: '2026-10-24T16:30:00Z', kickoff: 'Saturday, 24 October 2026 – 17:30' },
  { game: 5, home: 'Harlequins', away: 'Saracens', kickoffIso: '2026-10-25T15:00:00Z', kickoff: 'Sunday, 25 October 2026 – 15:00' }
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
  round: 4,
  firstKickoff: firstFixture.kickoffIso,
  firstKickoffDisplay: firstFixture.kickoff,
  submissionsClosed: true,
  predictionsVisible: true,
  players: ['Luke', 'Jo', 'Steve', 'Deb', 'Cas', 'Ash'],
  fixtures
};

export function submissionPrefix() {
  return `submissions/${roundConfig.season.replace('/', '-')}/round-${roundConfig.round}/`;
}
