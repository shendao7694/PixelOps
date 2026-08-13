export const PVP_MAP_OPTIONS = Object.freeze([
  Object.freeze({ id: 'facility', name: 'BLACKSITE', thumbnail: './blacksite.png' }),
  Object.freeze({ id: 'playland', name: 'PLAYLAND', thumbnail: './playland.png' }),
  Object.freeze({ id: 'ruins', name: 'RUINS', thumbnail: './RUINS.png' }),
]);

const OPTION_IDS = new Set(PVP_MAP_OPTIONS.map((option) => option.id));

export function isPvpMapOption(mapId) {
  return OPTION_IDS.has(mapId);
}

export function mapVoteCounts(votes) {
  const counts = Object.fromEntries(PVP_MAP_OPTIONS.map(({ id }) => [id, 0]));
  for (const mapId of votes?.values?.() || []) {
    if (isPvpMapOption(mapId)) counts[mapId]++;
  }
  return counts;
}

/** Highest vote count wins; a supplied RNG makes tied outcomes testable. */
export function resolveMapVote(votes, random = Math.random) {
  const counts = mapVoteCounts(votes);
  const high = Math.max(...Object.values(counts));
  const tied = PVP_MAP_OPTIONS.filter(({ id }) => counts[id] === high);
  const pick = Math.min(tied.length - 1, Math.floor(Math.max(0, random()) * tied.length));
  return { mapId: tied[pick].id, counts, tied: tied.map(({ id }) => id) };
}
