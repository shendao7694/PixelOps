// Browser-only presentation for the Juggernaut airdrop. The server never
// imports this module; it owns the shared timeline in juggernaut.js.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {
  AIRDROP_HELICOPTER_END_SECONDS,
  AIRDROP_HELICOPTER_START_SECONDS,
  AIRDROP_IMPACT_SECONDS,
  airdropCratePose,
  airdropHelicopterPose,
} from './juggernaut.js';

// "Animated AW101 helicopter" by Aditya Graphical, CC BY 4.0. The complete
// source and attribution are recorded in AW101-MODEL-LICENSE.md.
const AW101_URL = new URL('../../assets/glb/animated_aw101_helicopter.glb', import.meta.url).href;
const AW101_LENGTH_METRES = 22.8;
let aw101TemplatePromise = null;

function box(parent, w, h, d, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, r1, r2, length, segments, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r1, r2, length, segments),
    material
  );
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function fallbackAw101() {
  const root = new THREE.Group();
  root.name = 'aw101-fallback';
  const olive = new THREE.MeshLambertMaterial({ color: 0x515c4e, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x222923, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({
    color: 0x29434a,
    emissive: 0x0a171b,
    emissiveIntensity: 0.45,
    flatShading: true,
  });

  cylinder(root, 1.42, 1.18, 9.2, 10, olive, 0, 0, -0.8, Math.PI / 2);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.18, 3.1, 10), olive);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -6.9);
  root.add(nose);
  // Cabin glazing and side doors.
  box(root, 1.82, 0.68, 1.65, glass, 0, 0.60, -4.7, -0.18);
  for (const side of [-1, 1]) {
    box(root, 0.05, 1.45, 2.3, dark, side * 1.22, -0.05, -1.3);
    box(root, 0.06, 0.75, 1.45, glass, side * 1.25, 0.43, -2.5);
    cylinder(root, 0.12, 0.10, 1.9, 7, dark, side * 1.7, -1.05, -0.5, 0, 0, Math.PI / 2);
  }
  // Tail boom and stabilisers.
  cylinder(root, 0.45, 0.85, 9.0, 8, olive, 0, 0.15, 6.9, Math.PI / 2);
  box(root, 4.6, 0.18, 1.35, olive, 0, 0.25, 10.35);
  box(root, 0.22, 3.1, 2.0, olive, 0, 1.45, 10.15, 0.18);

  const rotor = new THREE.Group();
  rotor.name = 'fallback-main-rotor';
  rotor.position.set(0, 1.72, -0.25);
  cylinder(rotor, 0.18, 0.18, 0.45, 8, dark, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const blade = box(rotor, 0.24, 0.05, 8.8, dark, 0, 0.18, -4.25);
    blade.rotation.y = i * Math.PI * 2 / 5;
  }
  root.add(rotor);

  const tailRotor = new THREE.Group();
  tailRotor.name = 'fallback-tail-rotor';
  tailRotor.position.set(0.55, 1.75, 10.15);
  for (let i = 0; i < 4; i++) {
    const blade = box(tailRotor, 0.05, 2.7, 0.14, dark, 0, 1.28, 0);
    blade.rotation.z = i * Math.PI / 2;
  }
  root.add(tailRotor);
  root.userData.mainRotor = rotor;
  root.userData.tailRotor = tailRotor;
  return root;
}

function buildCrate() {
  const root = new THREE.Group();
  root.name = 'juggernaut-airdrop-crate';
  const olive = new THREE.MeshLambertMaterial({ color: 0x46513d, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1e241d, flatShading: true });
  const metal = new THREE.MeshPhongMaterial({
    color: 0x6f7769,
    shininess: 24,
    specular: 0x31372f,
    flatShading: true,
  });
  const amber = new THREE.MeshBasicMaterial({ color: 0xffc84f, fog: false });

  box(root, 1.34, 0.82, 1.02, olive, 0, 0.44, 0);
  // Reinforced lid, floor, ribs and corner impact shoes.
  box(root, 1.42, 0.12, 1.10, dark, 0, 0.88, 0);
  box(root, 1.40, 0.10, 1.08, dark, 0, 0.06, 0);
  for (const x of [-0.60, 0.60]) {
    box(root, 0.09, 0.88, 1.08, metal, x, 0.45, 0);
    for (const z of [-0.44, 0.44]) {
      box(root, 0.18, 0.16, 0.18, dark, x, 0.10, z);
    }
  }
  for (const z of [-0.45, 0.45]) {
    box(root, 1.35, 0.08, 0.08, metal, 0, 0.28, z);
    box(root, 1.35, 0.08, 0.08, metal, 0, 0.67, z);
  }
  // Front latches, recessed handles and readable warning chevrons.
  for (const x of [-0.32, 0.32]) {
    box(root, 0.13, 0.26, 0.05, metal, x, 0.60, -0.535);
    box(root, 0.07, 0.08, 0.04, dark, x, 0.58, -0.568);
  }
  box(root, 0.34, 0.06, 0.05, dark, 0, 0.36, -0.54);
  for (let i = -2; i <= 2; i++) {
    box(root, 0.075, 0.035, 0.03, amber, i * 0.105, 0.77, -0.565, 0, 0, -0.58);
  }
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return root;
}

async function loadAw101Template() {
  const gltf = await new GLTFLoader().loadAsync(AW101_URL);
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const initial = new THREE.Box3().setFromObject(model);
  const size = initial.getSize(new THREE.Vector3());
  const horizontalLength = Math.max(size.x, size.z);
  model.scale.setScalar(AW101_LENGTH_METRES / Math.max(0.001, horizontalLength));
  model.updateMatrixWorld(true);
  const boxBounds = new THREE.Box3().setFromObject(model);
  const center = boxBounds.getCenter(new THREE.Vector3());
  model.position.sub(center);
  // The downloaded AW101's nose points +Z; the game uses -Z as forward.
  model.rotation.y = Math.PI;
  model.name = 'animated-aw101';
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  return { model, clips: gltf.animations || [] };
}

export function preloadTransportHelicopterModel() {
  if (!aw101TemplatePromise) {
    aw101TemplatePromise = loadAw101Template().catch((error) => {
      console.warn('AW101 model could not be loaded; using the built-in transport silhouette.', error);
      return null;
    });
  }
  return aw101TemplatePromise;
}

export class JuggernautAirdropView {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.root = new THREE.Group();
    this.root.name = `juggernaut-airdrop-${state.id}`;
    scene.add(this.root);

    this.helicopter = new THREE.Group();
    this.helicopter.name = 'juggernaut-transport-helicopter';
    this.fallback = fallbackAw101();
    this.helicopter.add(this.fallback);
    this.root.add(this.helicopter);

    this.crate = buildCrate();
    this.root.add(this.crate);
    this.mixer = null;
    this.impactPlayed = false;
    this.flybyPlayed = false;
    this.active = true;
    this.seenAt = 0;

    preloadTransportHelicopterModel().then((template) => {
      if (!template || !this.active) return;
      const model = template.model.clone(true);
      this.helicopter.add(model);
      this.fallback.visible = false;
      if (template.clips.length) {
        this.mixer = new THREE.AnimationMixer(model);
        for (const clip of template.clips) this.mixer.clipAction(clip).play();
      }
    });
  }

  setState(state) {
    this.state = state;
  }

  update(age, dt) {
    const heli = airdropHelicopterPose(this.state, age);
    this.helicopter.visible = heli.visible;
    this.helicopter.position.set(heli.x, heli.y, heli.z);
    this.helicopter.rotation.set(heli.pitch, heli.yaw, heli.roll, 'YXZ');
    if (this.fallback.visible) {
      this.fallback.userData.mainRotor.rotation.y += dt * 16;
      this.fallback.userData.tailRotor.rotation.z += dt * 23;
    }
    if (this.mixer) this.mixer.update(dt);

    const crate = airdropCratePose(this.state, age);
    this.crate.visible = crate.visible;
    this.crate.position.set(crate.x, crate.y, crate.z);
    this.crate.rotation.set(crate.rotationX, crate.rotationY, crate.rotationZ);

    const flyby = !this.flybyPlayed
      && age >= AIRDROP_HELICOPTER_START_SECONDS
      && age <= AIRDROP_HELICOPTER_END_SECONDS;
    if (flyby) this.flybyPlayed = true;
    const impacted = !this.impactPlayed && age >= AIRDROP_IMPACT_SECONDS;
    if (impacted) this.impactPlayed = true;
    return {
      flyby,
      impacted,
      helicopterPosition: this.helicopter.position,
      cratePosition: this.crate.position,
      landed: crate.landed,
    };
  }

  dispose() {
    this.active = false;
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
