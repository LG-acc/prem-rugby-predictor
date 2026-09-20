export const teamBadges = Object.freeze({
  'Bath Rugby': '/badges/bath.png',
  'Bristol Bears': '/badges/bristol.png',
  'Exeter Chiefs': '/badges/exeter.png',
  'Gloucester Rugby': '/badges/gloucester.png',
  'Harlequins': '/badges/harlequins.png',
  'Leicester Tigers': '/badges/leicester.png',
  'Newcastle Red Bulls': '/badges/newcastle.png',
  'Northampton Saints': '/badges/saints.png',
  'Sale Sharks': '/badges/sale.png',
  'Saracens': '/badges/saracens.png'
});

export function badgeFor(team) {
  const badge = teamBadges[team];
  if (!badge) throw new Error(`No badge configured for team: ${team}`);
  return badge;
}
