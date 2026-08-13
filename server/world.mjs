import * as THREE from 'three';
import { clamp } from '../public/src/core/math.js';
import { positionFree } from '../public/src/core/collision.js';
import { rayCharacterHitboxes } from '../public/src/game/stance-hitboxes.js';
import { UAV_DRONE_WINGSPAN } from '../public/src/game/uav.js';
import { loadMap } from '../public/src/world/mapstore.js';
import { expandPart, MATERIALS } from '../public/src/world/parts.js';
import {
  buildGrenadeCollisionSolids,
  castGrenadeSolids,
} from '../public/src/world/grenade-collision.js';
import { selectRearCenterTeamSpawn } from '../public/src/world/spawns.js';

const AXES = ['x', 'y', 'z'];

export function buildServerLevel(mapId) {
  const map = loadMap(mapId);
  const colliders = [];
  let radius = 38;

  for (const part of map.parts) {
    if (part.kind === 'perimeter') radius = part.radius;
    for (const b of expandPart(part)) {
      const o = b.opts || {};
      if (!o.ghost && o.collide === false && !o.stairVisual) continue;
      colliders.push({
        min: new THREE.Vector3(b.x - b.w / 2, b.y, b.z - b.d / 2),
        max: new THREE.Vector3(b.x + b.w / 2, b.y + b.h, b.z + b.d / 2),
        isGround: !!o.ground,
        rayOnly: !!o.stairVisual,
        ramp: o.ramp ? { ...o.ramp, baseY: b.y } : null,
        surface: o.surface || MATERIALS[b.mat]?.surface || 'concrete',
      });
    }
  }

  const bounds = map.env.bounds
    ? { x: map.env.bounds.x, z: map.env.bounds.z }
    : { x: radius - 2, z: radius - 2 };
  const spawns = buildSpawns(colliders, bounds, map.env);
  const grenadeSolids = buildGrenadeCollisionSolids(map.parts);
  const grenadeRaycaster = new THREE.Raycaster();
  return {
    map,
    colliders,
    bounds,
    spawns,
    grenadeSolids,
    grenadeRaycaster,
  };
}

function buildSpawns(colliders, bounds, mapEnv) {
  const radius = 0.42;
  const height = 1.8;
  const limX = bounds.x - 0.5;
  const limZ = bounds.z - 0.5;
  const standable = (x, z) =>
    Math.abs(x) <= limX && Math.abs(z) <= limZ
    && positionFree(colliders, x, 0.05, z, radius, height);
  const spawns = { blue: [], red: [] };

  // Check for custom spawn points from map config
  const customSpawns = mapEnv?.spawnPoint;
  
  if (customSpawns && typeof customSpawns === 'object') {
    let hasValidBlue = false;
    let hasValidRed = false;
    
    // Process blue team custom spawn points
    if (Array.isArray(customSpawns.blue) && customSpawns.blue.length > 0) {
      for (const pos of customSpawns.blue) {
        const x = Number(pos?.x ?? pos?.[0] ?? 0);
        const y = Number(pos?.y ?? pos?.[1] ?? 0);
        const z = Number(pos?.z ?? pos?.[2] ?? 0);
        // Only check bounds, skip standable check for custom spawns
        if (Math.abs(x) <= limX && Math.abs(z) <= limZ) {
          spawns.blue.push(new THREE.Vector3(x, y, z));
          hasValidBlue = true;
        } 
      }
    }
    
    // Process red team custom spawn points
    if (Array.isArray(customSpawns.red) && customSpawns.red.length > 0) {
      for (const pos of customSpawns.red) {
        const x = Number(pos?.x ?? pos?.[0] ?? 0);
        const y = Number(pos?.y ?? pos?.[1] ?? 0);
        const z = Number(pos?.z ?? pos?.[2] ?? 0);
        if (Math.abs(x) <= limX && Math.abs(z) <= limZ) {
          spawns.red.push(new THREE.Vector3(x, y, z));
          hasValidRed = true;
        }
      }
    }
    
    // Use custom spawn points only if both teams have valid positions
    if (hasValidBlue && hasValidRed) {
      return spawns;
    }
    
    // Fall back to auto-generation if custom spawns are incomplete
    spawns.blue = [];
    spawns.red = [];
  }

  // Auto-generate spawn points if no valid custom ones exist
  for (const [team, sign] of [['blue', 1], ['red', -1]]) {
    const candidates = [];
    if (standable(0, sign * limZ)) {
      candidates.push({ x: 0, z: sign * limZ });
    }
    for (let x = -limX; x <= limX; x += 2) {
      for (let z = limZ * 0.55; z <= limZ; z += 2) {
        if (standable(x, sign * z)) {
          candidates.push({ x, z: sign * z, score: z + Math.abs(x) * 0.1 });
        }
      }
    }
    spawns[team] = selectRearCenterTeamSpawn(candidates)
      .map((candidate) => new THREE.Vector3(candidate.x, 0, candidate.z));
    if (!spawns[team].length) {
      spawns[team].push(new THREE.Vector3(0, 0, sign * limZ * 0.7));
    }
  }
  return spawns;
}

// function buildSpawns(colliders, bounds) {
//   const radius = 0.42;
//   const height = 1.8;
//   const limX = bounds.x - 0.5;
//   const limZ = bounds.z - 0.5;
//   const standable = (x, z) =>
//     Math.abs(x) <= limX && Math.abs(z) <= limZ
//     && positionFree(colliders, x, 0.05, z, radius, height);
//   const spawns = { blue: [], red: [] };

//   for (const [team, sign] of [['blue', 1], ['red', -1]]) {
//     const candidates = [];
//     if (standable(0, sign * limZ)) {
//       candidates.push({ x: 0, z: sign * limZ });
//     }
//     for (let x = -limX; x <= limX; x += 2) {
//       for (let z = limZ * 0.55; z <= limZ; z += 2) {
//         if (standable(x, sign * z)) {
//           candidates.push({ x, z: sign * z, score: z + Math.abs(x) * 0.1 });
//         }
//       }
//     }
//     spawns[team] = selectRearCenterTeamSpawn(candidates)
//       .map((candidate) => new THREE.Vector3(candidate.x, 0, candidate.z));
//     if (!spawns[team].length) {
//       spawns[team].push(new THREE.Vector3(0, 0, sign * limZ * 0.7));
//     }
//   }
//   return spawns;
// }

export function serverTeamSpawns(level, team) {
  const list = level.spawns[team] || [];
  return list.slice(0, 1);
}

export function pickServerSpawn(level, team, players = []) {
  const anchor = serverTeamSpawns(level, team)[0];
  const occupants = [...players];
  const inwardZ = team === 'blue' ? -1 : 1;
  // These are occupancy slots around the one canonical spawn, not additional
  // spawn points. They keep a six-player team from materialising inside itself.
  const offsets = [
    [0, 0],
    [-0.9, 0],
    [0.9, 0],
    [0, 0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
    [0, 1.8],
  ];
  const candidates = offsets
    .map(([x, z]) => new THREE.Vector3(
      anchor.x + x,
      anchor.y,
      anchor.z + z * inwardZ
    ))
    .filter((candidate) => positionFree(
      level.colliders,
      candidate.x,
      candidate.y + 0.05,
      candidate.z,
      0.42,
      1.8
    ));
  if (!candidates.length) return anchor.clone();

  let best = candidates[0];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    let nearest = 8;
    for (const player of occupants) {
      if (!player.actor.alive) continue;
      nearest = Math.min(nearest, candidate.distanceTo(player.actor.position));
    }
    // With no nearby teammate, the exact midpoint must win. Once occupied,
    // distance from living actors dominates and selects an adjacent slot.
    const score = nearest - candidate.distanceTo(anchor) * 0.02
      + Math.random() * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best.clone();
}

/** Slab ray/AABB test. Returns the first distance and face normal. */
export function rayAabb(origin, dir, box, maxDistance) {
  let near = 0;
  let far = maxDistance;
  let normal = null;

  for (const axis of AXES) {
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < box.min[axis] || o > box.max[axis]) return null;
      continue;
    }
    let t1 = (box.min[axis] - o) / d;
    let t2 = (box.max[axis] - o) / d;
    let sign = -Math.sign(d);
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > near) {
      near = t1;
      normal = new THREE.Vector3(
        axis === 'x' ? sign : 0,
        axis === 'y' ? sign : 0,
        axis === 'z' ? sign : 0
      );
    }
    far = Math.min(far, t2);
    if (near > far) return null;
  }

  if (far < 0 || near > maxDistance) return null;
  return { distance: Math.max(0, near), normal: normal || dir.clone().negate() };
}

export function rayWorld(level, origin, dir, maxDistance) {
  let best = null;
  for (const collider of level.colliders) {
    // The visible stair treads are represented by ray-only boxes. Testing the
    // ramp's broad-phase box as well would make bullets hit empty air above it.
    if (collider.ramp) continue;
    const hit = rayAabb(origin, dir, collider, maxDistance);
    if (!hit || (best && hit.distance >= best.distance)) continue;
    best = {
      ...hit,
      point: origin.clone().addScaledVector(dir, hit.distance),
      surface: collider.surface,
      kind: 'world',
    };
  }
  return best;
}

export function rayGrenadeWorld(level, origin, dir, maxDistance) {
  return castGrenadeSolids(
    level.grenadeSolids,
    level.grenadeRaycaster,
    origin,
    dir,
    maxDistance
  );
}

export function rayPlayer(player, origin, dir, maxDistance) {
  const actor = player.actor;
  if (!actor.alive) return null;
  const hit = rayCharacterHitboxes(actor, origin, dir, maxDistance);
  if (!hit) return null;
  return {
    ...hit,
    surface: 'flesh',
    kind: 'player',
    player,
  };
}

export function raySentry(sentry, origin, dir, maxDistance) {
  if (!sentry.alive) return null;
  const p = sentry.position;
  const box = {
    min: new THREE.Vector3(p.x - 0.48, p.y, p.z - 0.48),
    max: new THREE.Vector3(p.x + 0.48, p.y + 1.82, p.z + 0.48),
  };
  const hit = rayAabb(origin, dir, box, maxDistance);
  if (!hit) return null;
  return {
    ...hit,
    point: origin.clone().addScaledVector(dir, hit.distance),
    surface: 'metal',
    kind: 'sentry',
    sentry,
    part: 'chest',
    mult: 1,
  };
}

/**
 * Three yaw-oriented boxes approximate the long-wing UAV. Testing in local
 * aircraft space avoids the enormous phantom corners an axis-aligned 18 m
 * wing box would create while it circles the map.
 */
export function rayUavDrone(drone, origin, dir, maxDistance) {
  if (!drone.alive || drone.health <= 0) return null;
  const p = drone.position;
  const yaw = drone.yaw || 0;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const dx = origin.x - p.x;
  const dz = origin.z - p.z;
  const localOrigin = new THREE.Vector3(
    c * dx - s * dz,
    origin.y - p.y,
    s * dx + c * dz
  );
  const localDir = new THREE.Vector3(
    c * dir.x - s * dir.z,
    dir.y,
    s * dir.x + c * dir.z
  );
  const halfWing = UAV_DRONE_WINGSPAN / 2;
  const boxes = [
    {
      min: new THREE.Vector3(-halfWing, -0.24, -0.62),
      max: new THREE.Vector3(halfWing, 0.28, 0.78),
    },
    {
      min: new THREE.Vector3(-0.76, -0.72, -4.45),
      max: new THREE.Vector3(0.76, 1.12, 4.25),
    },
    {
      min: new THREE.Vector3(-2.25, -0.10, 3.24),
      max: new THREE.Vector3(2.25, 1.78, 4.35),
    },
  ];
  let closest = null;
  for (const box of boxes) {
    const hit = rayAabb(localOrigin, localDir, box, maxDistance);
    if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
  }
  if (!closest) return null;
  const n = closest.normal;
  const normal = new THREE.Vector3(
    c * n.x + s * n.z,
    n.y,
    -s * n.x + c * n.z
  ).normalize();
  return {
    distance: closest.distance,
    normal,
    point: origin.clone().addScaledVector(dir, closest.distance),
    surface: 'metal',
    kind: 'uav',
    drone,
    part: 'airframe',
    mult: 1,
  };
}

/** Three oriented hull boxes approximate the Apache without counting rotors. */
export function rayAttackHelicopter(heli, origin, dir, maxDistance) {
  if (!heli?.alive || heli.health <= 0 || !heli.position) return null;
  const p = heli.position.isVector3
    ? heli.position
    : new THREE.Vector3(...heli.position);
  const yaw = Number(heli.yaw) || 0;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const dx = origin.x - p.x;
  const dz = origin.z - p.z;
  const localOrigin = new THREE.Vector3(
    c * dx - s * dz,
    origin.y - p.y,
    s * dx + c * dz
  );
  const localDir = new THREE.Vector3(
    c * dir.x - s * dir.z,
    dir.y,
    s * dir.x + c * dir.z
  );
  const boxes = [
    {
      min: new THREE.Vector3(-2.6, -1.7, -1.55),
      max: new THREE.Vector3(7.1, 2.25, 1.55),
    },
    {
      min: new THREE.Vector3(-8.8, -0.55, -0.52),
      max: new THREE.Vector3(-2.35, 1.15, 0.52),
    },
    {
      min: new THREE.Vector3(-1.7, -1.05, -5.1),
      max: new THREE.Vector3(3.4, 0.18, 5.1),
    },
  ];
  let closest = null;
  for (const box of boxes) {
    const hit = rayAabb(localOrigin, localDir, box, maxDistance);
    if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
  }
  if (!closest) return null;
  const n = closest.normal;
  const normal = new THREE.Vector3(
    c * n.x + s * n.z,
    n.y,
    -s * n.x + c * n.z
  ).normalize();
  return {
    distance: closest.distance,
    normal,
    point: origin.clone().addScaledVector(dir, closest.distance),
    surface: 'metal',
    kind: 'attack_helicopter',
    heli,
    part: 'airframe',
    mult: 1,
  };
}

export function coneDirection(dir, spread, out = new THREE.Vector3()) {
  out.copy(dir);
  if (spread <= 0) return out;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * spread;
  const up = Math.abs(dir.y) > 0.95
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const realUp = new THREE.Vector3().crossVectors(right, dir).normalize();
  return out
    .addScaledVector(right, Math.cos(a) * r)
    .addScaledVector(realUp, Math.sin(a) * r)
    .normalize();
}

export function aimDirection(yaw, pitch, out = new THREE.Vector3()) {
  const p = clamp(pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  return out.set(
    -Math.sin(yaw) * Math.cos(p),
    Math.sin(p),
    -Math.cos(yaw) * Math.cos(p)
  ).normalize();
}
