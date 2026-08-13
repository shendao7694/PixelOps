// Map loading. A map is `{ name, env, parts }`; parts are validated against
// the current part definitions so a stale or hand-edited file can't crash the
// game - unknown kinds are simply dropped.
import { FACILITY } from '../maps/facility.js';
import { PLAYLAND } from '../maps/playland.js';
import { RUINS } from '../maps/ruins.js';
import { PARKOUR } from '../maps/parkour.js';
import { SPACE_PRESIDENT } from '../maps/space-president.js';
import { PART_KINDS, resetPartIds } from './parts.js';

export const MAP_FORMAT = 1;

export function normaliseMap(raw) {
  const parts = [];
  let id = 1;
  for (const p of (raw && raw.parts) || []) {
    const def = PART_KINDS[p.kind];
    if (!def) continue;
    parts.push({ ...def.defaults, ...p, id: id++ });
  }
  resetPartIds(parts);
  return {
    format: MAP_FORMAT,
    name: (raw && raw.name) || 'UNTITLED',
    env: (raw && raw.env) || {},
    parts,
  };
}

export function stockMap() {
  return normaliseMap(FACILITY);
}

/**
 * Every shipped arena. PVE lets the player pick from this list on the title
 * screen; PVP stays on the default until the rooms flow learns about maps.
 */
export const MAP_REGISTRY = Object.freeze({
  facility: Object.freeze({ id: 'facility', data: FACILITY }),
  playland: Object.freeze({ id: 'playland', data: PLAYLAND }),
  ruins: Object.freeze({ id: 'ruins', data: RUINS }), 
  space_president: Object.freeze({ id: 'space_president', data: SPACE_PRESIDENT }),
  parkour: Object.freeze({ id: 'parkour', data: PARKOUR})
});
export const DEFAULT_MAP_ID = 'facility';
export const MAP_IDS = Object.freeze(Object.keys(MAP_REGISTRY));

/** The game's entry point: load one registered map by id. */
export function loadMap(id = DEFAULT_MAP_ID) {
  const entry = MAP_REGISTRY[id];
  return entry ? normaliseMap(entry.data) : stockMap();
}
