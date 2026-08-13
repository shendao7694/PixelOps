import * as THREE from '../../vendor/three.module.js';
import { expandPart, MATERIALS } from './parts.js';

const SERVER_RAY_MATERIAL = new THREE.MeshBasicMaterial();

function grenadeGeometry(box) {
  if (box.opts?.cyl) {
    return new THREE.CylinderGeometry(
      box.w / 2,
      box.w / 2,
      box.h,
      8,
      1
    );
  }
  return new THREE.BoxGeometry(box.w, box.h, box.d);
}

/**
 * Builds the exact invisible geometry used by the browser's visible level
 * meshes. This lets the authoritative server trace grenades against the same
 * boxes, cylinders and decorative surfaces as PVE.
 */
export function buildGrenadeCollisionSolids(parts) {
  const solids = [];
  for (const part of parts || []) {
    for (const box of expandPart(part)) {
      if (box.opts?.ghost) continue;
      const mesh = new THREE.Mesh(grenadeGeometry(box), SERVER_RAY_MATERIAL);
      mesh.position.set(box.x, box.y + box.h / 2, box.z);
      mesh.userData.surface = box.opts?.surface
        || MATERIALS[box.mat]?.surface
        || 'concrete';
      mesh.updateMatrixWorld(true);
      solids.push(mesh);
    }
  }
  return solids;
}

/** Casts a grenade ray through either the visible PVE meshes or their exact
 * server-side twins. */
export function castGrenadeSolids(
  solids,
  raycaster,
  origin,
  direction,
  maxDistance
) {
  raycaster.set(origin, direction);
  raycaster.near = 0;
  raycaster.far = maxDistance;
  const hit = raycaster.intersectObjects(solids, false)[0];
  if (!hit) return null;
  const normal = hit.face?.normal
    ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    : direction.clone().negate();
  return {
    distance: hit.distance,
    normal,
    point: hit.point,
    surface: hit.object.userData.surface || 'concrete',
    kind: 'world',
  };
}
