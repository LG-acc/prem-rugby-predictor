export const playerAliases = new Map([
  ['luke', 'Luke'], ['luke g', 'Luke'],
  ['jo', 'Jo'], ['joanne', 'Jo'], ['jo g', 'Jo'], ['joanne goscomb', 'Jo'], ['jo goscomb', 'Jo'],
  ['steve', 'Steve'], ['steven', 'Steve'], ['biv', 'Steve'], ['bivo', 'Steve'], ['steve g', 'Steve'], ['steven goscomb', 'Steve'], ['steve goscomb', 'Steve'],
  ['deb', 'Deb'], ['debbie', 'Deb'], ['deborah', 'Deb'], ['debbie caswell', 'Deb'], ['deborah caswell', 'Deb'],
  ['cas', 'Cas'], ['gary', 'Cas'],
  ['ash', 'Ash'], ['ashley', 'Ash']
]);

export function normaliseName(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolvePlayer(value = '') {
  return playerAliases.get(normaliseName(value)) || null;
}
