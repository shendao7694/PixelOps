import * as THREE from '../../vendor/three.module.js';
import { UAV_DRONE_WINGSPAN } from './uav.js';

function mesh(parent, geometry, material, name, position = null, rotation = null) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  if (position) part.position.set(...position);
  if (rotation) part.rotation.set(...rotation);
  part.castShadow = false;
  part.receiveShadow = false;
  parent.add(part);
  return part;
}

function box(parent, size, material, name, position = null, rotation = null) {
  return mesh(
    parent,
    new THREE.BoxGeometry(...size),
    material,
    name,
    position,
    rotation
  );
}

function cylinder(
  parent,
  radiusTop,
  radiusBottom,
  length,
  material,
  name,
  position = null,
  rotation = [-Math.PI / 2, 0, 0],
  segments = 12
) {
  return mesh(
    parent,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments),
    material,
    name,
    position,
    rotation
  );
}

function teamDotTexture(colorHex) {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const red = (colorHex >> 16) & 0xff;
  const green = (colorHex >> 8) & 0xff;
  const blue = colorHex & 0xff;
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre);
      if (distance > 13.5) continue;
      const offset = (y * size + x) * 4;
      const inside = distance <= 9.5;
      data[offset] = inside ? red : 0;
      data[offset + 1] = inside ? green : 0;
      data[offset + 2] = inside ? blue : 0;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createAircraftTeamMarker(
  displayTeam = 'blue',
  name = 'aircraft-team-dot',
  scale = 2.10
) {
  const teamColor = displayTeam === 'red' ? 0xff3933 : 0x39aaff;
  const texture = teamDotTexture(teamColor);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.2,
    depthTest: true,
    depthWrite: false,
    fog: false,
  });
  const marker = new THREE.Sprite(material);
  marker.name = name;
  marker.scale.set(scale, scale, 1);
  marker.renderOrder = 2;
  marker.frustumCulled = false;
  marker.userData.ownedTexture = texture;
  return marker;
}

/**
 * Long-wing surveillance aircraft inspired by the supplied high-altitude UAV:
 * pale high-aspect-ratio wings, a charcoal sensor fuselage and a tall tail.
 * It is deliberately procedural so it remains part of the existing art stack.
 */
export function buildUavDroneModel(displayTeam = 'blue') {
  const root = new THREE.Group();
  root.name = 'uav-drone';
  root.rotation.order = 'YXZ';

  const airframe = new THREE.Group();
  airframe.name = 'uav-drone-airframe';
  root.add(airframe);

  const fuselage = new THREE.MeshPhongMaterial({
    color: 0x232a2f,
    shininess: 34,
    specular: 0x64717a,
    flatShading: false,
  });
  const dark = new THREE.MeshPhongMaterial({
    color: 0x11171b,
    shininess: 20,
    specular: 0x39454d,
  });
  const wing = new THREE.MeshPhongMaterial({
    color: 0xd9dfe0,
    emissive: 0x303536,
    shininess: 24,
    specular: 0xffffff,
  });
  const panel = new THREE.MeshPhongMaterial({
    color: 0x899398,
    shininess: 32,
    specular: 0xc6d1d5,
  });
  const glass = new THREE.MeshPhongMaterial({
    color: 0x172f3a,
    emissive: 0x061219,
    shininess: 80,
    specular: 0x7bb6c8,
  });

  const hitboxes = [];
  hitboxes.push(cylinder(
    airframe, 0.57, 0.68, 5.8, fuselage,
    'uav-fuselage', [0, 0, 0.15]
  ));
  hitboxes.push(cylinder(
    airframe, 0.02, 0.57, 1.65, fuselage,
    'uav-nose', [0, 0, -3.57], [-Math.PI / 2, 0, 0], 14
  ));
  cylinder(
    airframe, 0.34, 0.50, 2.0, dark,
    'uav-tail-boom', [0, 0.03, 3.42]
  );

  // Long, almost straight wings are the reference aircraft's defining shape.
  const halfWing = UAV_DRONE_WINGSPAN / 2;
  const wingLength = halfWing - 0.48;
  hitboxes.push(box(
    airframe, [wingLength, 0.14, 1.15], wing,
    'uav-left-wing', [-(wingLength / 2 + 0.42), 0.03, 0.10],
    [0, -0.025, -0.018]
  ));
  hitboxes.push(box(
    airframe, [wingLength, 0.14, 1.15], wing,
    'uav-right-wing', [wingLength / 2 + 0.42, 0.03, 0.10],
    [0, 0.025, 0.018]
  ));
  box(airframe, [0.45, 0.18, 1.18], panel, 'uav-wing-root', [0, 0.02, 0.10]);
  box(
    airframe, [0.34, 0.18, 0.72], panel,
    'uav-left-wingtip', [-halfWing + 0.13, 0.03, 0.10],
    [0, -0.025, -0.018]
  );
  box(
    airframe, [0.34, 0.18, 0.72], panel,
    'uav-right-wingtip', [halfWing - 0.13, 0.03, 0.10],
    [0, 0.025, 0.018]
  );

  // Top-mounted engine, intake lip and exhaust.
  hitboxes.push(cylinder(
    airframe, 0.46, 0.55, 2.15, dark,
    'uav-engine', [0, 0.58, 1.00]
  ));
  cylinder(
    airframe, 0.40, 0.40, 0.16, panel,
    'uav-engine-intake', [0, 0.58, -0.12]
  );
  cylinder(
    airframe, 0.28, 0.34, 0.20, dark,
    'uav-engine-exhaust', [0, 0.58, 2.14]
  );

  hitboxes.push(box(
    airframe, [4.25, 0.13, 0.72], wing,
    'uav-tailplane', [0, 0.12, 3.72]
  ));
  hitboxes.push(box(
    airframe, [0.15, 1.70, 1.24], dark,
    'uav-vertical-tail', [0, 0.84, 3.72],
    [-0.08, 0, 0]
  ));

  // Sensor turret and small dorsal fairings give the silhouette purpose up
  // close, while remaining legible at the game's low internal pixel scale.
  hitboxes.push(mesh(
    airframe,
    new THREE.SphereGeometry(0.47, 12, 8),
    glass,
    'uav-sensor-turret',
    [0, -0.58, -2.05]
  ));
  cylinder(
    airframe, 0.07, 0.07, 0.55, panel,
    'uav-dorsal-antenna', [0, 0.80, -0.68],
    [0, 0, 0], 8
  );
  box(airframe, [0.46, 0.08, 0.85], panel, 'uav-avionics-panel', [0, 0.57, -1.10]);
  box(airframe, [0.24, 0.08, 0.52], panel, 'uav-team-panel', [0, 0.66, 0.02]);

  const navRed = new THREE.MeshBasicMaterial({ color: 0xff2525, fog: false });
  const navGreen = new THREE.MeshBasicMaterial({ color: 0x4dff77, fog: false });
  mesh(
    airframe, new THREE.SphereGeometry(0.12, 8, 6), navRed,
    'uav-left-nav-light', [-halfWing, 0.03, 0.08]
  );
  mesh(
    airframe, new THREE.SphereGeometry(0.12, 8, 6), navGreen,
    'uav-right-nav-light', [halfWing, 0.03, 0.08]
  );

  // A compact black-ringed dot replaces the full-airframe team outline. Sprite
  // billboarding keeps it circular from every orbit angle without hiding the
  // aircraft silhouette underneath.
  const marker = createAircraftTeamMarker(
    displayTeam,
    'uav-team-dot',
    2.10
  );
  // Players always observe this high-altitude aircraft from below. Mount the
  // marker just under the belly so the airframe cannot hide its coloured core,
  // while normal depth testing still lets roofs and walls occlude it.
  marker.position.set(0, -1.18, 0);
  root.add(marker);

  root.userData.hitboxes = hitboxes;
  root.userData.teamMarker = marker;
  root.userData.teamMarkerTexture = marker.userData.ownedTexture;
  root.userData.displayTeam = displayTeam;
  return root;
}

export class UavDroneView {
  constructor(scene, state, displayTeam = 'blue', camera = null) {
    this.id = state.id;
    this.team = state.team;
    this.displayTeam = displayTeam;
    this.health = Number(state.health) || 0;
    this.maxHealth = Number(state.maxHealth) || 500;
    this.alive = true;
    this.isUavDrone = true;
    this.camera = camera;
    this.model = buildUavDroneModel(displayTeam);
    this.position = this.model.position;
    this.hitboxes = this.model.userData.hitboxes;
    this.teamMarker = this.model.userData.teamMarker;
    this._markerWorld = new THREE.Vector3();
    this._markerUp = new THREE.Vector3();
    this._markerToward = new THREE.Vector3();
    scene.add(this.model);
  }

  setPose(pose) {
    this.model.position.set(pose.x, pose.y, pose.z);
    this.model.rotation.set(0, pose.yaw, pose.bank, 'YXZ');
    if (this.camera && this.teamMarker) {
      // Keep the dot a little above the aircraft in screen space. This makes
      // its black ring readable against the sky rather than against the dark
      // fuselage, and the small camera-facing offset prevents self-occlusion.
      this._markerUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();
      this._markerToward.subVectors(this.camera.position, this.model.position);
      if (this._markerToward.lengthSq() > 1e-8) this._markerToward.normalize();
      else this._markerToward.set(0, -1, 0);
      this._markerWorld.copy(this.model.position)
        .addScaledVector(this._markerUp, 6.20)
        .addScaledVector(this._markerToward, 0.45);
      this.model.updateMatrixWorld(true);
      this.teamMarker.position.copy(this.model.worldToLocal(this._markerWorld));
    }
  }

  applyState(state) {
    this.team = state.team;
    this.health = Number(state.health) || 0;
    this.maxHealth = Number(state.maxHealth) || this.maxHealth;
  }

  dispose(scene) {
    this.alive = false;
    scene.remove(this.model);
    const geometries = new Set();
    const materials = new Set();
    this.model.traverse((part) => {
      if (part.geometry) geometries.add(part.geometry);
      if (part.material) {
        for (const material of Array.isArray(part.material)
          ? part.material
          : [part.material]) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.model.userData.teamMarkerTexture?.dispose();
  }
}
