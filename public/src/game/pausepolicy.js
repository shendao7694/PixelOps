const LIVE_MODES = new Set(['playing', 'dead']);
const MENU_MODES = new Set(['paused', 'settings', 'votekick']);

/**
 * PVE always pauses when pointer lock is lost. In PVP, an intentional unlock
 * (ESC while the document is still focused) opens the menu, while Alt-Tab or
 * another window-focus loss leaves the live match view running.
 */
export function shouldPauseOnUnlock(gameType, mode, documentFocused) {
  if (!LIVE_MODES.has(mode)) return false;
  return gameType !== 'pvp' || documentFocused;
}

/** PVP menus are overlays; the authoritative match and client sync keep going. */
export function keepsPvpSimulationRunning(gameType, mode) {
  return gameType === 'pvp' && MENU_MODES.has(mode);
}
