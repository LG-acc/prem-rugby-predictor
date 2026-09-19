export const roundConfig = {
  season: '2026/27',
  round: 1,
  firstKickoff: '2026-09-25T18:45:00Z',
  firstKickoffDisplay: 'Friday, 25 September 2026 – 19:45',
  players: ['Luke', 'Jo', 'Steve', 'Deb', 'Cas', 'Ash'],
  fixtures: [
    { game: 1, home: 'Harlequins', away: 'Bath Rugby', kickoff: 'Friday, 25 September 2026 – 19:45', homeBadge: '/badges/harlequins.png', awayBadge: '/badges/bath.png' },
    { game: 2, home: 'Northampton Saints', away: 'Newcastle Red Bulls', kickoff: 'Friday, 25 September 2026 – 19:45', homeBadge: '/badges/saints.png', awayBadge: '/badges/newcastle.png' },
    { game: 3, home: 'Exeter Chiefs', away: 'Gloucester Rugby', kickoff: 'Saturday, 26 September 2026 – 15:05', homeBadge: '/badges/exeter.png', awayBadge: '/badges/gloucester.png' },
    { game: 4, home: 'Sale Sharks', away: 'Bristol Bears', kickoff: 'Saturday, 26 September 2026 – 17:30', homeBadge: '/badges/sale.png', awayBadge: '/badges/bristol.png' },
    { game: 5, home: 'Leicester Tigers', away: 'Saracens', kickoff: 'Sunday, 27 September 2026 – 15:00', homeBadge: '/badges/leicester.png', awayBadge: '/badges/saracens.png' }
  ]
};

export function submissionPrefix() {
  return `submissions/${roundConfig.season.replace('/', '-')}/round-${roundConfig.round}/`;
}
