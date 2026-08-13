import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { createAircraftTeamMarker } from './uav-drone-view.js';

const B2_URL = new URL('../../assets/glb/b-2_spirit_bomber.glb', import.meta.url).href;
const APACHE_URL = new URL(
  '../../assets/glb/boeing_ah-64d_apache_combat_helicopter.glb',
  import.meta.url
).href;
const B2_WINGSPAN_METRES = 52.4;
const APACHE_LENGTH_METRES = 17.7;
const HIDDEN_INSTANCE_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

let b2TemplatePromise = null;
let apacheTemplatePromise = null;

function box(w, h, d, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function finishTemplate(model, targetLength, axis = 'x') {
  model.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(model);
  const size = initialBox.getSize(new THREE.Vector3());
  const scale = targetLength / Math.max(0.001, size[axis]);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(model);
  const center = box3.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  return model;
}

function fallbackB2() {
  const group = new THREE.Group();
  group.name = 'b2-fallback';
  const hull = new THREE.MeshLambertMaterial({
    color: 0x24282a,
    flatShading: true,
  });
  const glass = new THREE.MeshLambertMaterial({
    color: 0x253b40,
    emissive: 0x091214,
    flatShading: true,
  });
  const shape = new THREE.Shape();
  shape.moveTo(13, 0);
  shape.lineTo(1, 3.2);
  shape.lineTo(-11, 25.5);
  shape.lineTo(-7, 7.5);
  shape.lineTo(-10.5, 4.8);
  shape.lineTo(-12, 2.3);
  shape.lineTo(-10.5, 0);
  shape.lineTo(-12, -2.3);
  shape.lineTo(-10.5, -4.8);
  shape.lineTo(-7, -7.5);
  shape.lineTo(-11, -25.5);
  shape.lineTo(1, -3.2);
  shape.closePath();
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.75,
      bevelEnabled: true,
      bevelSize: 0.32,
      bevelThickness: 0.22,
      bevelSegments: 1,
    }),
    hull
  );
  body.rotation.x = Math.PI / 2;
  body.position.y = -0.3;
  group.add(body);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.65, 2.5), glass);
  cockpit.position.set(4.5, 0.5, 0);
  group.add(cockpit);
  return group;
}

function fallbackApache() {
  const group = new THREE.Group();
  group.name = 'apache-fallback';
  const green = new THREE.MeshLambertMaterial({
    color: 0x394235,
    flatShading: true,
  });
  const dark = new THREE.MeshLambertMaterial({
    color: 0x151a17,
    flatShading: true,
  });
  const glass = new THREE.MeshLambertMaterial({
    color: 0x243d43,
    emissive: 0x071214,
    flatShading: true,
  });
  box(7.0, 2.2, 2.2, green, 1.7, 0, 0, group);
  box(8.4, 0.55, 0.58, green, -5.5, 0.45, 0, group);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.12, 3.0, 6), green);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 6.6;
  group.add(nose);
  box(2.7, 1.35, 1.82, glass, 4.0, 1.05, 0, group);
  box(1.8, 2.2, 0.22, green, -9.2, 1.3, 0, group);
  box(4.0, 0.20, 3.3, green, 0.7, -0.9, 0, group);
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 2.0, 8), dark);
  cannon.rotation.z = -Math.PI / 2;
  cannon.position.set(5.8, -1.25, 0);
  group.add(cannon);
  return group;
}

async function loadB2Template() {
  const gltf = await new GLTFLoader().loadAsync(B2_URL);
  const model = finishTemplate(gltf.scene, B2_WINGSPAN_METRES, 'x');
  // The source aircraft points along +Z. The runtime flight convention is +X.
  model.rotation.y = Math.PI / 2;
  model.name = 'b-2-spirit-bomber';
  return model;
}

async function loadApacheTemplate() {
  const gltf = await new GLTFLoader().loadAsync(APACHE_URL);
  stripStaticApacheRotors(gltf.scene);
  const model = finishTemplate(gltf.scene, APACHE_LENGTH_METRES, 'x');
  model.name = 'ah-64d-apache';
  return model;
}

/**
 * The downloaded Apache has its four main-rotor blades and tail-rotor blades
 * baked into the body mesh. We render animated rotors separately, so retaining
 * those disconnected components produces the visible "one moving, one frozen"
 * duplicate. Remove only the thin, elevated blade components.
 */
function stripStaticApacheRotors(model) {
  model.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    const position = geometry?.attributes?.position;
    const index = geometry?.index;
    if (!position || !index || position.count < 1000) return;

    const parent = Int32Array.from(
      { length: position.count },
      (_, vertex) => vertex
    );
    const find = (vertex) => {
      let root = vertex;
      while (parent[root] !== root) root = parent[root];
      while (parent[vertex] !== vertex) {
        const next = parent[vertex];
        parent[vertex] = root;
        vertex = next;
      }
      return root;
    };
    const unite = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    // Texture seams duplicate vertices. Joining coincident positions keeps a
    // complete blade together instead of leaving isolated textured slivers.
    const coincident = new Map();
    for (let vertex = 0; vertex < position.count; vertex++) {
      const key = `${position.getX(vertex).toFixed(5)},`
        + `${position.getY(vertex).toFixed(5)},`
        + `${position.getZ(vertex).toFixed(5)}`;
      const other = coincident.get(key);
      if (other === undefined) coincident.set(key, vertex);
      else unite(vertex, other);
    }
    for (let offset = 0; offset < index.count; offset += 3) {
      const a = index.getX(offset);
      const b = index.getX(offset + 1);
      const c = index.getX(offset + 2);
      unite(a, b);
      unite(b, c);
    }

    const components = new Map();
    for (let vertex = 0; vertex < position.count; vertex++) {
      const root = find(vertex);
      let component = components.get(root);
      if (!component) {
        component = {
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
        };
        components.set(root, component);
      }
      const values = [
        position.getX(vertex),
        position.getY(vertex),
        position.getZ(vertex),
      ];
      for (let axis = 0; axis < 3; axis++) {
        component.min[axis] = Math.min(component.min[axis], values[axis]);
        component.max[axis] = Math.max(component.max[axis], values[axis]);
      }
    }

    const removed = new Set();
    for (const [root, component] of components) {
      const size = component.max.map((value, axis) =>
        value - component.min[axis]);
      const mainBlade = component.min[2] > 0.10
        && Math.max(size[0], size[1]) > 0.72
        && size[2] < 0.09;
      const tailBlade = component.max[0] < -1.0
        && Math.max(size[0], size[1]) > 0.45
        && size[2] < 0.12;
      if (mainBlade || tailBlade) removed.add(root);
    }
    if (!removed.size) return;

    const kept = [];
    for (let offset = 0; offset < index.count; offset += 3) {
      const a = index.getX(offset);
      if (removed.has(find(a))) continue;
      kept.push(a, index.getX(offset + 1), index.getX(offset + 2));
    }
    const IndexArray = position.count > 0xffff ? Uint32Array : Uint16Array;
    geometry.setIndex(new THREE.BufferAttribute(new IndexArray(kept), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });
}

export function preloadB2Model() {
  if (!b2TemplatePromise) {
    b2TemplatePromise = loadB2Template().catch((error) => {
      console.warn('B-2 model could not be loaded; using fallback geometry.', error);
      return null;
    });
  }
  return b2TemplatePromise;
}

export function preloadApacheModel() {
  if (!apacheTemplatePromise) {
    apacheTemplatePromise = loadApacheTemplate().catch((error) => {
      console.warn('AH-64D model could not be loaded; using fallback geometry.', error);
      return null;
    });
  }
  return apacheTemplatePromise;
}

export function createB2Visual() {
  const root = new THREE.Group();
  root.name = 'firebomb-b2';
  root.userData.active = true;
  const fallback = fallbackB2();
  root.add(fallback);
  preloadB2Model().then((template) => {
    if (!template || !root.userData.active) return;
    root.add(template.clone(true));
    fallback.visible = false;
  });
  return root;
}

export function createFirebombBombVisual() {
  const root = new THREE.Group();
  root.name = 'firebomb-air-bomb';
  const bodyMaterial = new THREE.MeshLambertMaterial({
    color: 0x292d2c,
    flatShading: true,
  });
  const bandMaterial = new THREE.MeshBasicMaterial({ color: 0x9d2b1f });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.30, 1.8, 8),
    bodyMaterial
  );
  body.rotation.z = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.62, 8), bodyMaterial);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 1.18;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.14, 8), bandMaterial);
  band.rotation.z = Math.PI / 2;
  band.position.x = 0.15;
  root.add(body, nose, band);
  for (const z of [-0.42, 0.42]) {
    box(0.55, 0.08, 0.42, bodyMaterial, -0.88, 0, z, root);
  }
  root.scale.setScalar(1.35);
  root.visible = false;
  return root;
}

/**
 * All falling B-2 bombs share four instanced draws. A complete bomb used to be
 * a separate five-mesh scene graph, so a pass could add roughly sixty draw
 * calls while the persistent fire was also being created.
 */
export function createFirebombBombBatch(count = 12) {
  const capacity = Math.max(1, Math.floor(Number(count) || 12));
  const root = new THREE.Group();
  root.name = 'firebomb-air-bomb-batch';
  const bodyMaterial = new THREE.MeshLambertMaterial({
    color: 0x292d2c,
    flatShading: true,
  });
  const bandMaterial = new THREE.MeshBasicMaterial({ color: 0x9d2b1f });
  const scale = 1.35;

  const bodyGeometry = new THREE.CylinderGeometry(0.23, 0.30, 1.8, 8);
  bodyGeometry.rotateZ(Math.PI / 2);
  bodyGeometry.scale(scale, scale, scale);
  const noseGeometry = new THREE.ConeGeometry(0.23, 0.62, 8);
  noseGeometry.rotateZ(-Math.PI / 2);
  noseGeometry.translate(1.18, 0, 0);
  noseGeometry.scale(scale, scale, scale);
  const bandGeometry = new THREE.CylinderGeometry(0.305, 0.305, 0.14, 8);
  bandGeometry.rotateZ(Math.PI / 2);
  bandGeometry.translate(0.15, 0, 0);
  bandGeometry.scale(scale, scale, scale);
  const finGeometry = new THREE.BoxGeometry(
    0.55 * scale,
    0.08 * scale,
    0.42 * scale
  );

  const body = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, capacity);
  const nose = new THREE.InstancedMesh(noseGeometry, bodyMaterial, capacity);
  const band = new THREE.InstancedMesh(bandGeometry, bandMaterial, capacity);
  const fins = new THREE.InstancedMesh(finGeometry, bodyMaterial, capacity * 2);
  for (const mesh of [body, nose, band, fins]) {
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
  }

  const world = new THREE.Matrix4();
  const finLocal = new THREE.Matrix4();
  const finWorld = new THREE.Matrix4();
  const poseQuaternion = new THREE.Quaternion();
  const rollQuaternion = new THREE.Quaternion();
  const unitScale = new THREE.Vector3(1, 1, 1);
  const localX = new THREE.Vector3(1, 0, 0);
  const posePosition = new THREE.Vector3();
  const poseDirection = new THREE.Vector3();

  function hide(index) {
    body.setMatrixAt(index, HIDDEN_INSTANCE_MATRIX);
    nose.setMatrixAt(index, HIDDEN_INSTANCE_MATRIX);
    band.setMatrixAt(index, HIDDEN_INSTANCE_MATRIX);
    fins.setMatrixAt(index * 2, HIDDEN_INSTANCE_MATRIX);
    fins.setMatrixAt(index * 2 + 1, HIDDEN_INSTANCE_MATRIX);
  }

  function setPose(index, {
    visible = true,
    position = null,
    direction = null,
    roll = 0,
  } = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= capacity) return;
    if (!visible || !position || !direction) {
      hide(index);
      return;
    }
    posePosition.set(position.x, position.y, position.z);
    poseDirection.set(direction.x, direction.y, direction.z).normalize();
    poseQuaternion.setFromUnitVectors(localX, poseDirection);
    rollQuaternion.setFromAxisAngle(localX, Number(roll) || 0);
    poseQuaternion.multiply(rollQuaternion);
    world.compose(posePosition, poseQuaternion, unitScale);
    body.setMatrixAt(index, world);
    nose.setMatrixAt(index, world);
    band.setMatrixAt(index, world);
    for (let side = 0; side < 2; side++) {
      finLocal.makeTranslation(
        -0.88 * scale,
        0,
        (side === 0 ? -0.42 : 0.42) * scale
      );
      finWorld.multiplyMatrices(world, finLocal);
      fins.setMatrixAt(index * 2 + side, finWorld);
    }
  }

  function commit() {
    body.instanceMatrix.needsUpdate = true;
    nose.instanceMatrix.needsUpdate = true;
    band.instanceMatrix.needsUpdate = true;
    fins.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    root.removeFromParent();
    bodyGeometry.dispose();
    noseGeometry.dispose();
    bandGeometry.dispose();
    finGeometry.dispose();
    bodyMaterial.dispose();
    bandMaterial.dispose();
  }

  for (let i = 0; i < capacity; i++) hide(i);
  commit();
  root.userData.count = capacity;
  root.userData.drawCalls = 4;
  return { root, setPose, commit, hide, dispose };
}

export function releaseB2Visual(root) {
  if (!root) return;
  root.userData.active = false;
  root.removeFromParent();
}

export function createApacheVisual(displayTeam = 'blue') {
  const root = new THREE.Group();
  root.name = 'attack-helicopter-apache';
  root.userData.active = true;
  const fallback = fallbackApache();
  root.add(fallback);
  const hitboxes = [];
  fallback.traverse((object) => {
    if (object.isMesh) hitboxes.push(object);
  });

  const rotorMaterial = new THREE.MeshBasicMaterial({
    color: 0x101311,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const mainRotor = new THREE.Group();
  mainRotor.name = 'apache-main-rotor';
  mainRotor.position.set(-0.4, 2.4, 0);
  box(0.20, 0.045, 20.5, rotorMaterial, 0, 0, 0, mainRotor);
  box(20.5, 0.045, 0.20, rotorMaterial, 0, 0, 0, mainRotor);
  root.add(mainRotor);
  const tailRotor = new THREE.Group();
  tailRotor.name = 'apache-tail-rotor';
  tailRotor.position.set(-8.7, 1.25, -0.24);
  box(0.08, 3.0, 0.10, rotorMaterial, 0, 0, 0, tailRotor);
  const tailBlade = box(0.08, 3.0, 0.10, rotorMaterial, 0, 0, 0, tailRotor);
  tailBlade.rotation.x = Math.PI / 2;
  root.add(tailRotor);
  const marker = createAircraftTeamMarker(
    displayTeam,
    'apache-team-dot',
    2.45
  );
  marker.position.set(0, 5.6, 0);
  root.add(marker);
  const muzzle = new THREE.Object3D();
  muzzle.name = 'apache-cannon-muzzle';
  muzzle.position.set(7.0, -1.2, 0);
  root.add(muzzle);
  root.userData.mainRotor = mainRotor;
  root.userData.tailRotor = tailRotor;
  root.userData.muzzle = muzzle;
  root.userData.hitboxes = hitboxes;
  root.userData.teamMarker = marker;
  root.userData.teamMarkerTexture = marker.userData.ownedTexture;
  root.userData.displayTeam = displayTeam;

  preloadApacheModel().then((template) => {
    if (!template || !root.userData.active) return;
    const clone = template.clone(true);
    const loadedHitboxes = [];
    clone.traverse((object) => {
      if (object.isMesh) loadedHitboxes.push(object);
    });
    root.add(clone);
    fallback.removeFromParent();
    hitboxes.splice(0, hitboxes.length, ...loadedHitboxes);
  });
  return root;
}

export function updateApacheRotors(root, rotorAngle) {
  if (!root) return;
  if (root.userData.mainRotor) root.userData.mainRotor.rotation.y = rotorAngle;
  if (root.userData.tailRotor) root.userData.tailRotor.rotation.x = rotorAngle * 1.7;
}

export function releaseApacheVisual(root) {
  if (!root) return;
  root.userData.active = false;
  root.userData.teamMarker?.material?.dispose?.();
  root.userData.teamMarkerTexture?.dispose?.();
  root.removeFromParent();
}
