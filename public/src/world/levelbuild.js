// Turns a list of parts (a map) into renderable meshes, collision boxes and
// AI navigation data. Both the game and the editor go through here.
import * as THREE from '../../vendor/three.module.js';
import { expandPart, MATERIALS } from './parts.js';
import { selectRearCenterTeamSpawn } from './spawns.js';
import { positionFree } from '../core/collision.js';

const TILE = 2.0;

/** Rescale box UVs so the texture tiles at a constant world size. */
function tileBoxUVs(geo, w, h, d, tile = TILE) {
  const uv = geo.attributes.uv;
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (4 verts each)
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const su = spans[f][0] / tile;
    const sv = spans[f][1] / tile;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

class MaterialCache {
  constructor(textures) {
    this.T = textures;
    this.map = new Map();
  }
  get(matKey, tint = 0xffffff) {
    const key = matKey + ':' + tint;
    let m = this.map.get(key);
    if (!m) {
      const def = MATERIALS[matKey] || MATERIALS.concrete;
      const tex = this.T[def.tex] || this.T.concrete;
      m = new THREE.MeshLambertMaterial({ map: tex, color: tint });
      this.map.set(key, m);
    }
    return m;
  }
  dispose() {
    for (const m of this.map.values()) m.dispose();
    this.map.clear();
  }
}

/**
 * Build a level.
 * opts.forEditor keeps per-part metadata on meshes and skips nav generation.
 */
export function buildLevelFromParts(parts, textures, opts = {}) {
  const group = new THREE.Group();
  group.name = 'level';
  const colliders = [];
  const solids = [];
  const cache = new MaterialCache(textures);
  const lights = new THREE.Group();
  lights.name = 'level-lights';
  group.add(lights);

  let radius = 38;

  for (const part of parts) {
    if (part.kind === 'perimeter') radius = part.radius;
    const boxes = expandPart(part);
    for (const b of boxes) {
      const o = b.opts;
      // Collision-only shape hidden inside every staircase. Its bounds are
      // retained for broad-phase tests; `ramp` carries the continuous surface.
      if (o.ghost) {
        colliders.push({
          min: new THREE.Vector3(b.x - b.w / 2, b.y, b.z - b.d / 2),
          max: new THREE.Vector3(b.x + b.w / 2, b.y + b.h, b.z + b.d / 2),
          tall: b.h > 1.4,
          walkway: !!o.walkway,
          ghost: true,
          ramp: o.ramp ? { ...o.ramp, baseY: b.y } : null,
          surface: o.surface || 'metal',
          partId: part.id,
        });
        continue;
      }
      const matDef = MATERIALS[b.mat] || MATERIALS.concrete;
      let mesh;
      if (o.cyl) {
        const geo = new THREE.CylinderGeometry(b.w / 2, b.w / 2, b.h, 8, 1);
        mesh = new THREE.Mesh(geo, cache.get(b.mat, o.tint || 0xffffff));
      } else if (o.lamp) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d),
          new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
        const light = new THREE.PointLight(0xffd79a, o.power || 12, o.range || 16, 2);
        light.position.set(b.x, b.y + b.h / 2 - 0.1, b.z);
        lights.add(light);
      } else {
        const geo = tileBoxUVs(new THREE.BoxGeometry(b.w, b.h, b.d), b.w, b.h, b.d, o.tile || TILE);
        mesh = new THREE.Mesh(geo, cache.get(b.mat, o.tint || 0xffffff));
      }
      mesh.position.set(b.x, b.y + b.h / 2, b.z);
      mesh.castShadow = o.castShadow !== false && !o.lamp;
      mesh.receiveShadow = true;
      mesh.userData.surface = o.surface || matDef.surface || 'concrete';
      mesh.userData.partId = part.id;
      group.add(mesh);
      solids.push(mesh);

      if (o.ground) {
        colliders.push({
          min: new THREE.Vector3(b.x - b.w / 2, b.y, b.z - b.d / 2),
          max: new THREE.Vector3(b.x + b.w / 2, b.y + b.h, b.z + b.d / 2),
          isGround: true, tall: false, walkway: false, partId: part.id,
        });
      } else if (o.collide !== false) {
        colliders.push({
          min: new THREE.Vector3(b.x - b.w / 2, b.y, b.z - b.d / 2),
          max: new THREE.Vector3(b.x + b.w / 2, b.y + b.h, b.z + b.d / 2),
          tall: b.h > 1.4,
          walkway: !!o.walkway,
          partId: part.id,
        });
      }
    }
  }

  /* ------------------------------------------------------------- lighting */
  // Indoors there is no sun to speak of: the ceiling would shadow everything,
  // so lighting comes from the fixtures plus a lifted ambient term.
  const env = opts.env || {};
  const indoor = !!env.indoor;
  let sun = null;
  let clouds = null;

  if (indoor) {
    lights.add(new THREE.HemisphereLight(
      env.skyColor ?? 0x5a6a7a, env.groundColor ?? 0x24282e, env.ambient ?? 0.85));
    // a soft downward fill so flat floors still read as floors
    const fill = new THREE.DirectionalLight(env.fillColor ?? 0xbcd0e0, env.fill ?? 0.45);
    fill.position.set(12, 40, 8);
    lights.add(fill);
    const fill2 = new THREE.DirectionalLight(0x8095ab, 0.22);
    fill2.position.set(-16, 18, -14);
    lights.add(fill2);
    // Hemisphere light gives downward-facing surfaces the (dark) ground
    // colour, which turns the ceiling into a black void. This bounces some
    // light back up so the ceiling reads as a surface.
    const bounce = new THREE.DirectionalLight(env.bounceColor ?? 0x9aa8b8, env.bounce ?? 0.5);
    bounce.position.set(-6, -30, 5);
    lights.add(bounce);
  } else {
    lights.add(new THREE.HemisphereLight(0xa8c0d8, 0x55503e, 1.0));
    sun = new THREE.DirectionalLight(0xffedc4, 1.9);
    sun.position.set(34, 52, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // cover the whole playable area: explicit bounds win over the perimeter
    const sr = Math.max(40, radius * 1.4,
      env.bounds ? Math.hypot(env.bounds.x, env.bounds.z) * 1.05 : 0);
    sun.shadow.camera.left = -sr;
    sun.shadow.camera.right = sr;
    sun.shadow.camera.top = sr;
    sun.shadow.camera.bottom = -sr;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.035;
    lights.add(sun, sun.target);
    sun.target.position.set(0, 0, 0);
    const fill = new THREE.DirectionalLight(0x93b4d8, 0.42);
    fill.position.set(-30, 24, -18);
    lights.add(fill);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 16, 12),
      new THREE.MeshBasicMaterial({ map: textures.sky, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    sky.name = 'sky';
    sky.renderOrder = -2;
    group.add(sky);

    // Minecraft-school sky furniture: a crisp square sun billboard sitting on
    // the directional light's vector...
    const sunQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 52),
      new THREE.MeshBasicMaterial({
        map: textures.sunSprite, transparent: true, fog: false, depthWrite: false,
      })
    );
    sunQuad.position.set(34, 52, 22).normalize().multiplyScalar(262);
    sunQuad.lookAt(0, 0, 0);
    sunQuad.renderOrder = -1;
    group.add(sunQuad);

    // ...and two flat layers of chunky clouds sailing over the arena at
    // different speeds, so the sky visibly moves
    textures.clouds.repeat.set(5, 5);
    const cloudGeo = new THREE.PlaneGeometry(1100, 1100);
    const low = new THREE.Mesh(cloudGeo, new THREE.MeshBasicMaterial({
      map: textures.clouds, transparent: true, opacity: 0.9, fog: false,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    low.rotation.x = -Math.PI / 2;
    low.position.y = 88;
    const highTex = textures.clouds.clone();
    highTex.needsUpdate = true;
    highTex.repeat.set(3.3, 3.3);
    const high = new THREE.Mesh(cloudGeo, new THREE.MeshBasicMaterial({
      map: highTex, transparent: true, opacity: 0.5, fog: false,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    high.rotation.x = -Math.PI / 2;
    high.rotation.z = Math.PI / 2;
    high.position.y = 102;
    group.add(low, high);
    clouds = [low, high];
  }

  // Playable extent: explicit for indoor maps, derived from the perimeter
  // wall otherwise. Kept as separate x/z so rectangular maps work.
  const bounds = env.bounds
    ? { x: env.bounds.x, z: env.bounds.z }
    : { x: radius - 2, z: radius - 2 };

  const level = {
    group, colliders, solids, sun, clouds, lights, bounds, indoor,
    fog: env.fog || null,
    materialCache: cache,
    parts,
  };

  if (!opts.forEditor) Object.assign(level, generateNav(colliders, bounds, opts));
  return level;
}

/**
 * Spawns, patrol waypoints and cover points are sampled from the finished
 * collision data, so they can never end up inside a wall no matter how the
 * map is edited.
 */
export function generateNav(colliders, bounds, opts) {
  const ACTOR_R = 0.42, ACTOR_H = 1.8;
  const limX = bounds.x - 0.5, limZ = bounds.z - 0.5;
  const standable = (x, z) => Math.abs(x) <= limX && Math.abs(z) <= limZ
    && positionFree(colliders, x, 0.05, z, ACTOR_R, ACTOR_H);

  // Distance to the nearest thing that actually obstructs a standing actor.
  // Only geometry inside the body band counts - a floor underfoot or a ceiling
  // overhead spans the whole map and would otherwise read as "always in cover".
  const nearestSolid = (x, z, limit = 3.2) => {
    let best = limit;
    for (const c of colliders) {
      if (c.isGround) continue;
      if (c.max.y < 0.7 || c.min.y > 1.9) continue;
      const dx = Math.max(c.min.x - x, 0, x - c.max.x);
      const dz = Math.max(c.min.z - z, 0, z - c.max.z);
      const d = Math.hypot(dx, dz);
      if (d < best) best = d;
    }
    return best;
  };

  // The grid has to be fine enough that a node lands inside every doorway,
  // otherwise the nav graph fragments into one island per room and nothing can
  // path between them. 1.5 m comfortably fits a 3 m opening.
  const waypoints = [];
  const coverPoints = [];
  for (let x = -limX; x <= limX; x += NAV_GRID) {
    for (let z = -limZ; z <= limZ; z += NAV_GRID) {
      if (!standable(x, z)) continue;
      const near = nearestSolid(x, z);
      if (near > 0.8) waypoints.push(new THREE.Vector3(x, 0, z));
      if (near > 0.62 && near < 1.5) coverPoints.push(new THREE.Vector3(x, 0, z));
    }
  }

  // Teams start at opposite ends: blue in +z, red in -z.
  const spawns = { blue: [], red: [] };
  
  // Check for custom spawn points from map config
  const customSpawns = opts?.env?.spawnPoint;
  
  if (customSpawns && typeof customSpawns === 'object') {
    let hasValidBlue = false;
    let hasValidRed = false;
    
    // Process blue team custom spawn points
    if (Array.isArray(customSpawns.blue) && customSpawns.blue.length > 0) {
      for (const pos of customSpawns.blue) {
        const x = Number(pos?.x ?? pos?.[0] ?? 0);
        const y = Number(pos?.y ?? pos?.[1] ?? 0);
        const z = Number(pos?.z ?? pos?.[2] ?? 0);
        // Validate spawn point is within bounds and standable
        if (Math.abs(x) <= limX && Math.abs(z) <= limZ && standable(x, z)) {
          spawns.blue.push(new THREE.Vector3(x, y, z));
          hasValidBlue = true;
        } else {
          console.warn(`Custom blue spawn point (${x}, ${z}) is invalid or out of bounds, skipping.`);
        }
      }
    }
    
    // Process red team custom spawn points
    if (Array.isArray(customSpawns.red) && customSpawns.red.length > 0) {
      for (const pos of customSpawns.red) {
        const x = Number(pos?.x ?? pos?.[0] ?? 0);
        const y = Number(pos?.y ?? pos?.[1] ?? 0);
        const z = Number(pos?.z ?? pos?.[2] ?? 0);
        if (Math.abs(x) <= limX && Math.abs(z) <= limZ && standable(x, z)) {
          spawns.red.push(new THREE.Vector3(x, y, z));
          hasValidRed = true;
        } else {
          console.warn(`Custom red spawn point (${x}, ${z}) is invalid or out of bounds, skipping.`);
        }
      }
    }
    
    // Use custom spawn points only if both teams have valid positions
    if (hasValidBlue && hasValidRed) {
      console.log(`Using custom spawn points: Blue (${spawns.blue.length}), Red (${spawns.red.length})`);
      const navGraph = buildNavGraph(waypoints, colliders);
      return { waypoints, coverPoints, spawns, navGraph };
    }
    
    // Fall back to auto-generation if custom spawns are incomplete
    console.warn('Custom spawn points incomplete, falling back to auto-generation.');
    spawns.blue = [];
    spawns.red = [];
  }

  // Auto-generate spawn points if no valid custom ones exist
  for (const [team, sign] of [['blue', 1], ['red', -1]]) {
    const candidates = [];
    // Sample the exact edge midpoint explicitly. The regular 2 m grid starts
    // at -limX and does not necessarily pass through x=0 or z=limZ.
    if (standable(0, sign * limZ)) {
      candidates.push({ x: 0, z: sign * limZ });
    }
    for (let x = -limX; x <= limX; x += 2) {
      for (let z = limZ * 0.55; z <= limZ; z += 2) {
        if (standable(x, sign * z)) candidates.push({ x, z: sign * z, score: z + Math.abs(x) * 0.1 });
      }
    }
    spawns[team] = selectRearCenterTeamSpawn(candidates)
      .map((candidate) => new THREE.Vector3(candidate.x, 0, candidate.z));
    // never ship an empty spawn list
    if (!spawns[team].length) {
      const fallback = waypoints.filter((w) => Math.sign(w.z) === sign)
        .sort((a, bb) => Math.abs(bb.z) - Math.abs(a.z));
      spawns[team].push((fallback[0] || new THREE.Vector3(0, 0, sign * limZ * 0.7)).clone());
    }
  }

  const navGraph = buildNavGraph(waypoints, colliders);
  return { waypoints, coverPoints, spawns, navGraph };
}

// export function generateNav(colliders, bounds, opts) {
//   const ACTOR_R = 0.42, ACTOR_H = 1.8;
//   const limX = bounds.x - 0.5, limZ = bounds.z - 0.5;
//   const standable = (x, z) => Math.abs(x) <= limX && Math.abs(z) <= limZ
//     && positionFree(colliders, x, 0.05, z, ACTOR_R, ACTOR_H);

//   Distance to the nearest thing that actually obstructs a standing actor.
//   Only geometry inside the body band counts - a floor underfoot or a ceiling
//   overhead spans the whole map and would otherwise read as "always in cover".
//   const nearestSolid = (x, z, limit = 3.2) => {
//     let best = limit;
//     for (const c of colliders) {
//       if (c.isGround) continue;
//       if (c.max.y < 0.7 || c.min.y > 1.9) continue;
//       const dx = Math.max(c.min.x - x, 0, x - c.max.x);
//       const dz = Math.max(c.min.z - z, 0, z - c.max.z);
//       const d = Math.hypot(dx, dz);
//       if (d < best) best = d;
//     }
//     return best;
//   };

//   The grid has to be fine enough that a node lands inside every doorway,
//   otherwise the nav graph fragments into one island per room and nothing can
//   path between them. 1.5 m comfortably fits a 3 m opening.
//   const waypoints = [];
//   const coverPoints = [];
//   for (let x = -limX; x <= limX; x += NAV_GRID) {
//     for (let z = -limZ; z <= limZ; z += NAV_GRID) {
//       if (!standable(x, z)) continue;
//       const near = nearestSolid(x, z);
//       if (near > 0.8) waypoints.push(new THREE.Vector3(x, 0, z));
//       if (near > 0.62 && near < 1.5) coverPoints.push(new THREE.Vector3(x, 0, z));
//     }
//   }

//   Teams start at opposite ends: blue in +z, red in -z.
//   const spawns = { blue: [], red: [] };
//   for (const [team, sign] of [['blue', 1], ['red', -1]]) {
//     const candidates = [];
//     Sample the exact edge midpoint explicitly. The regular 2 m grid starts
//     at -limX and does not necessarily pass through x=0 or z=limZ.
//     if (standable(0, sign * limZ)) {
//       candidates.push({ x: 0, z: sign * limZ });
//     }
//     for (let x = -limX; x <= limX; x += 2) {
//       for (let z = limZ * 0.55; z <= limZ; z += 2) {
//         if (standable(x, sign * z)) candidates.push({ x, z: sign * z, score: z + Math.abs(x) * 0.1 });
//       }
//     }
//     spawns[team] = selectRearCenterTeamSpawn(candidates)
//       .map((candidate) => new THREE.Vector3(candidate.x, 0, candidate.z));
//     never ship an empty spawn list
//     if (!spawns[team].length) {
//       const fallback = waypoints.filter((w) => Math.sign(w.z) === sign)
//         .sort((a, bb) => Math.abs(bb.z) - Math.abs(a.z));
//       spawns[team].push((fallback[0] || new THREE.Vector3(0, 0, sign * limZ * 0.7)).clone());
//     }
//   }

//   const navGraph = buildNavGraph(waypoints, colliders);
//   return { waypoints, coverPoints, spawns, navGraph };
// }

/* --------------------------------------------------------------- pathing */

const NAV_GRID = 1.5;         // waypoint spacing; must fit inside a doorway
const NAV_RADIUS = 0.5;       // a touch wider than an actor, so paths clear walls
const NAV_LINK = NAV_GRID * 1.5;  // links orthogonal and diagonal neighbours only

/** True if an actor can walk the straight line from a to b. */
export function segmentClear(colliders, ax, az, bx, bz, radius = NAV_RADIUS) {
  const dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.ceil(dist / 0.45));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!positionFree(colliders, ax + dx * t, 0.05, az + dz * t, radius, 1.8)) return false;
  }
  return true;
}

/**
 * Waypoints linked by walkable straight lines. Greedy steering cannot find a
 * doorway when the target is in another room; this graph can.
 */
/**
 * Waypoints linked by walkable straight lines. Waypoints are bucketed into a
 * coarse grid first: this arena has a couple of thousand of them and comparing
 * every pair is 3M distance tests before any of the real work starts.
 */
function bucketNodes(nodes, cell) {
  const map = new Map();
  const key = (ix, iz) => ix * 100003 + iz;
  for (let i = 0; i < nodes.length; i++) {
    const k = key(Math.floor(nodes[i].x / cell), Math.floor(nodes[i].z / cell));
    let list = map.get(k);
    if (!list) map.set(k, (list = []));
    list.push(i);
  }
  return { map, cell, key };
}

/** Indices of every node in the buckets covering a square around (x, z). */
function bucketQuery(grid, x, z, radius, out) {
  out.length = 0;
  const c = grid.cell;
  for (let ix = Math.floor((x - radius) / c); ix <= Math.floor((x + radius) / c); ix++) {
    for (let iz = Math.floor((z - radius) / c); iz <= Math.floor((z + radius) / c); iz++) {
      const list = grid.map.get(grid.key(ix, iz));
      if (list) for (let k = 0; k < list.length; k++) out.push(list[k]);
    }
  }
  return out;
}

export function buildNavGraph(waypoints, colliders) {
  const n = waypoints.length;
  const edges = [];
  for (let i = 0; i < n; i++) edges.push([]);
  const grid = bucketNodes(waypoints, NAV_LINK);
  const hits = [];
  for (let i = 0; i < n; i++) {
    const a = waypoints[i];
    bucketQuery(grid, a.x, a.z, NAV_LINK, hits);
    for (let h = 0; h < hits.length; h++) {
      const j = hits[h];
      if (j <= i) continue;
      const b = waypoints[j];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > NAV_LINK) continue;
      if (!segmentClear(colliders, a.x, a.z, b.x, b.z)) continue;
      edges[i].push(j);
      edges[j].push(i);
    }
  }
  return { nodes: waypoints, edges, colliders, grid };
}

/**
 * Index of the nearest waypoint that is directly reachable from a point.
 * Only the closest handful are line-of-sight tested - checking all of them
 * would cost more than the path search itself.
 */
const _nearScratch = [];
export function nearestNode(graph, x, z) {
  const nodes = graph.nodes;
  if (!nodes.length) return -1;
  // widen the search until the grid gives us something to rank
  let candidates = null;
  if (graph.grid) {
    for (const r of [NAV_LINK, NAV_LINK * 3, NAV_LINK * 8]) {
      bucketQuery(graph.grid, x, z, r, _nearScratch);
      if (_nearScratch.length) { candidates = _nearScratch; break; }
    }
  }
  const ranked = [];
  if (candidates) {
    for (let k = 0; k < candidates.length; k++) {
      const p = nodes[candidates[k]];
      ranked.push([(p.x - x) ** 2 + (p.z - z) ** 2, candidates[k]]);
    }
  } else {
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i];
      ranked.push([(p.x - x) ** 2 + (p.z - z) ** 2, i]);
    }
  }
  ranked.sort((a, b) => a[0] - b[0]);
  const probe = Math.min(ranked.length, 12);
  for (let k = 0; k < probe; k++) {
    const i = ranked[k][1];
    if (segmentClear(graph.colliders, x, z, nodes[i].x, nodes[i].z)) return i;
  }
  return ranked.length ? ranked[0][1] : -1;
}

/**
 * A* over the waypoint graph. Returns a list of positions to walk through,
 * or null if the two points are in disconnected parts of the map.
 */
export function findPath(graph, fromX, fromZ, toX, toZ) {
  const start = nearestNode(graph, fromX, fromZ);
  const goal = nearestNode(graph, toX, toZ);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [graph.nodes[goal]];

  const nodes = graph.nodes;
  const n = nodes.length;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const h = (i) => Math.hypot(nodes[i].x - nodes[goal].x, nodes[i].z - nodes[goal].z);

  g[start] = 0;
  f[start] = h(start);

  // Binary heap keyed on f. A linear scan is fine on a few hundred nodes; this
  // graph has a few thousand and a failed search would visit all of them.
  const open = [start];
  const push = (i) => {
    open.push(i);
    let c = open.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f[open[p]] <= f[open[c]]) break;
      const t = open[p]; open[p] = open[c]; open[c] = t;
      c = p;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open.pop();
    if (open.length) {
      open[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let s = p;
        if (l < open.length && f[open[l]] < f[open[s]]) s = l;
        if (r < open.length && f[open[r]] < f[open[s]]) s = r;
        if (s === p) break;
        const t = open[p]; open[p] = open[s]; open[s] = t;
        p = s;
      }
    }
    return top;
  };

  while (open.length) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;         // stale duplicate from a cheaper re-push
    closed[cur] = 1;
    for (const nb of graph.edges[cur]) {
      if (closed[nb]) continue;
      const step = Math.hypot(nodes[nb].x - nodes[cur].x, nodes[nb].z - nodes[cur].z);
      const tentative = g[cur] + step;
      if (tentative >= g[nb]) continue;
      cameFrom[nb] = cur;
      g[nb] = tentative;
      f[nb] = tentative + h(nb);
      push(nb);
    }
  }

  if (cameFrom[goal] < 0 && goal !== start) return null;
  const path = [];
  for (let i = goal; i >= 0; i = cameFrom[i]) {
    path.push(nodes[i]);
    if (i === start) break;
  }
  path.reverse();
  return path;
}

export function disposeLevel(level) {
  level.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  if (level.materialCache) level.materialCache.dispose();
}
