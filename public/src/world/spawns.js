// Shared client/server spawn selection. Each team owns one canonical spawn at
// the centre of its rear boundary.

export function selectRearCenterTeamSpawn(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const rearDistance = candidates.reduce(
    (rear, candidate) => Math.max(rear, Math.abs(candidate.z)),
    0
  );
  const anchor = candidates.reduce((best, candidate) => {
    const rearInset = Math.max(0, rearDistance - Math.abs(candidate.z));
    const score = Math.hypot(candidate.x, rearInset * 2);
    return !best || score < best.score ? { candidate, score } : best;
  }, null)?.candidate;
  return anchor ? [anchor] : [];
}
