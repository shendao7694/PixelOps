// Axis-aligned box collision with per-axis resolution and step-up, which is
// all a blocky arena needs and keeps movement perfectly predictable.

const EPS = 1e-4;

function overlapsXZ(x, z, radius, c) {
  return x + radius > c.min.x && x - radius < c.max.x && z + radius > c.min.z && z - radius < c.max.z;
}

/** Continuous foot height on a ramp collider, or null outside its footprint. */
export function rampSurfaceAt(c, x, z, radius = 0) {
  const ramp = c.ramp;
  if (!ramp || !overlapsXZ(x, z, radius, c)) return null;
  const coordinate = ramp.axis === 'x' ? x : z;
  const along = (coordinate - ramp.start) * ramp.dir;
  const t = Math.max(0, Math.min(1, along / Math.max(EPS, ramp.length)));
  return ramp.baseY + ramp.rise * t;
}

function hasHeadroom(colliders, skip, x, y, z, radius, height) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c === skip || c.ramp || c.rayOnly) continue;
    if (!overlapsXZ(x, z, radius, c)) continue;
    if (y < c.max.y - EPS && y + height > c.min.y + EPS) return false;
  }
  return true;
}

/**
 * Integrate an actor (upright box of 2*radius width, `height` tall, origin at
 * the feet) against the collider list.
 * Returns { grounded, wasGrounded, landed (impact speed), ceiling, blocked }.
 */
export function moveActor(actor, colliders, dt) {
  const pos = actor.position;
  const vel = actor.velocity;
  const r = actor.radius;
  const h = actor.height;
  const step = actor.stepHeight !== undefined ? actor.stepHeight : 0.55;
  const wasGrounded = !!actor.grounded;

  let grounded = false;
  let landed = 0;
  let ceiling = false;
  let blocked = false;

  /* -------- vertical -------- */
  const prevY = pos.y;
  pos.y += vel.y * dt;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.ramp || c.rayOnly) continue;
    if (!overlapsXZ(pos.x, pos.z, r, c)) continue;
    if (pos.y < c.max.y - EPS && pos.y + h > c.min.y + EPS) {
      if (vel.y <= 0 && prevY >= c.max.y - 0.02) {
        pos.y = c.max.y;
        if (vel.y < -3) landed = -vel.y;
        vel.y = 0;
        grounded = true;
      } else if (vel.y > 0 && prevY + h <= c.min.y + 0.02) {
        pos.y = c.min.y - h;
        vel.y = -0.2;
        ceiling = true;
      }
    }
  }
  // Ramp landings use the exact plane height instead of the broad-phase box.
  if (vel.y <= 0) {
    let surface = -Infinity;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c.ramp) continue;
      const y = rampSurfaceAt(c, pos.x, pos.z, r);
      if (y === null || y <= surface) continue;
      if (pos.y <= y + 0.06 && prevY >= y - 0.03) surface = y;
    }
    if (surface > -Infinity) {
      pos.y = surface;
      if (vel.y < -3) landed = Math.max(landed, -vel.y);
      vel.y = 0;
      grounded = true;
    }
  }

  /* -------- horizontal, one axis at a time so we slide along walls -------- */
  for (const axis of ['x', 'z']) {
    const before = pos[axis];
    pos[axis] += vel[axis] * dt;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.rayOnly) continue;
      if (c.ramp) {
        const surface = rampSurfaceAt(c, pos.x, pos.z, r);
        if (surface === null) continue;
        const rise = surface - pos.y;
        if (rise <= EPS || pos.y >= c.max.y - EPS
          || pos.y + h <= c.min.y + EPS) continue;

        const beforeX = axis === 'x' ? before : pos.x;
        const beforeZ = axis === 'z' ? before : pos.z;
        const beforeSurface = rampSurfaceAt(c, beforeX, beforeZ, r);
        const crossedFloor = beforeSurface !== null && pos.y >= beforeSurface - 0.03;
        // A jump travelling uphill can meet the rising floor horizontally
        // before the vertical pass sees it. That is a landing on the ramp,
        // not a collision with the ramp's broad AABB. The old response pushed
        // the player all the way to an end of the staircase.
        if ((rise <= step + EPS || crossedFloor)
          && hasHeadroom(colliders, c, pos.x, surface, pos.z, r, h)) {
          pos.y = surface;
          vel.y = 0;
          grounded = true;
          continue;
        }

        // The actor approached the solid underside, tall end or side. Restore
        // just this axis so movement slides along the boundary without an
        // artificial multi-metre displacement.
        pos[axis] = before;
        vel[axis] = 0;
        blocked = true;
        continue;
      }
      if (pos.y >= c.max.y - EPS || pos.y + h <= c.min.y + EPS) continue;
      if (!overlapsXZ(pos.x, pos.z, r, c)) continue;

      // step up onto low ledges (stairs, kerbs, sandbags)
      const rise = c.max.y - pos.y;
      if (rise > 0 && rise <= step) {
        let headroom = true;
        for (let j = 0; j < colliders.length; j++) {
          const o = colliders[j];
          if (o === c) continue;
          if (!overlapsXZ(pos.x, pos.z, r, o)) continue;
          if (c.max.y + h > o.min.y + EPS && c.max.y < o.max.y - EPS) { headroom = false; break; }
        }
        if (headroom) {
          pos.y = c.max.y;
          grounded = true;
          continue;
        }
      }

      // otherwise push back out along this axis only
      const centre = (c.min[axis] + c.max[axis]) * 0.5;
      if (pos[axis] > centre) pos[axis] = c.max[axis] + r + EPS;
      else pos[axis] = c.min[axis] - r - EPS;
      vel[axis] = 0;
      blocked = true;
      if (Math.abs(pos[axis] - before) > 4) pos[axis] = before; // safety net
    }
  }

  // If the actor was supported before the horizontal move, keep its feet on
  // the continuous ramp plane. This is the key difference from step-up boxes:
  // Y changes every rendered/physics frame rather than once per tread.
  if (vel.y <= 0.001 && (grounded || wasGrounded)) {
    let best = null;
    let bestY = -Infinity;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c.ramp) continue;
      const y = rampSurfaceAt(c, pos.x, pos.z, r);
      if (y === null || y <= bestY) continue;
      const rise = y - pos.y;
      if (rise > step + EPS || rise < -step - 0.35) continue;
      if (!hasHeadroom(colliders, c, pos.x, y, pos.z, r, h)) continue;
      best = c;
      bestY = y;
    }
    if (best) {
      pos.y = bestY;
      vel.y = 0;
      grounded = true;
    }
  }

  // ground probe: keeps `grounded` stable when walking over seams
  if (!grounded && vel.y <= 0.001) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.ramp || c.rayOnly) continue;
      if (!overlapsXZ(pos.x, pos.z, r, c)) continue;
      if (pos.y <= c.max.y + 0.09 && pos.y >= c.max.y - 0.35) {
        pos.y = c.max.y;
        vel.y = 0;
        grounded = true;
        break;
      }
    }
  }

  actor.grounded = grounded;
  return { grounded, wasGrounded, landed, ceiling, blocked };
}

/** Cheap "can I stand here" test used by the AI when picking a destination. */
export function positionFree(colliders, x, y, z, radius, height) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.isGround || c.rayOnly) continue;
    if (c.ramp) {
      const surface = rampSurfaceAt(c, x, z, radius);
      if (surface !== null && y < surface - EPS && y + height > c.min.y + EPS) return false;
      continue;
    }
    if (!overlapsXZ(x, z, radius, c)) continue;
    if (y < c.max.y - EPS && y + height > c.min.y + EPS) return false;
  }
  return true;
}
