/**
 * Shared automatic-respawn policy.
 *
 * A missing death animation identifies a player who has joined a room but has
 * not deployed for the first time; that state must never auto-spawn. A killed
 * player auto-spawns when the reinforcement timer expires unless they
 * explicitly opened the loadout screen.
 */
export function automaticRespawnReady({
  alive,
  deathAnimation,
  remaining,
  loadoutRequested = false,
}) {
  return alive === false
    && Boolean(deathAnimation)
    && Number.isFinite(Number(remaining))
    && Number(remaining) <= 0
    && loadoutRequested !== true;
}
