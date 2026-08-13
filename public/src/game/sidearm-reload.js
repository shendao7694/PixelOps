// Visible reload components for the code-built guns. Gameplay ammunition
// remains authoritative elsewhere; this module moves the detachable
// magazines of the rifle and both sidearms so a reload physically pulls the
// old box out and seats a fresh one instead of only tilting the weapon.
import * as THREE from '../../vendor/three.module.js';

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smoothStep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const REST_POSE = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  visible: true,
});

function movingPose(amount, {
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
} = {}) {
  return {
    offsetX: x * amount,
    offsetY: y * amount,
    offsetZ: z * amount,
    rotationX: rx * amount,
    rotationY: ry * amount,
    rotationZ: rz * amount,
    visible: true,
  };
}

function mixPose(from, to, amount) {
  const a = movingPose(1, from);
  const b = movingPose(1, to);
  const t = clamp01(amount);
  return {
    offsetX: a.offsetX + (b.offsetX - a.offsetX) * t,
    offsetY: a.offsetY + (b.offsetY - a.offsetY) * t,
    offsetZ: a.offsetZ + (b.offsetZ - a.offsetZ) * t,
    rotationX: a.rotationX + (b.rotationX - a.rotationX) * t,
    rotationY: a.rotationY + (b.rotationY - a.rotationY) * t,
    rotationZ: a.rotationZ + (b.rotationZ - a.rotationZ) * t,
    visible: true,
  };
}

function exchangePose(progress, extraction, handoff) {
  if (!Number.isFinite(progress)) return REST_POSE;
  const u = clamp01(progress);
  if (u < 0.16) return REST_POSE;
  if (u < 0.31) return mixPose({}, extraction, smoothStep((u - 0.16) / 0.15));
  if (u < 0.41) return mixPose(extraction, handoff, smoothStep((u - 0.31) / 0.10));
  if (u < 0.46) return movingPose(1, handoff);
  if (u < 0.51) return { ...movingPose(1, handoff), visible: false };
  if (u < 0.61) return movingPose(1, handoff);
  if (u < 0.72) return mixPose(handoff, {}, smoothStep((u - 0.61) / 0.11));
  return REST_POSE;
}

export function machinePistolMagazineReloadPose(progress) {
  return exchangePose(
    progress,
    {
      x: -0.030,
      y: -0.205,
      z: -0.060,
      rx: -0.10,
      ry: 0.04,
      rz: -0.05,
    },
    {
      x: -0.300,
      y: 0.050,
      z: 0.070,
      rx: -0.18,
      ry: 0.10,
      rz: -0.16,
    }
  );
}

export function desertEagleMagazineReloadPose(progress) {
  return exchangePose(
    progress,
    {
      // straight pull out of the grip, slight forward cant
      x: -0.020,
      y: -0.170,
      z: 0.020,
      rx: -0.06,
      ry: 0.02,
      rz: -0.04,
    },
    {
      x: -0.280,
      y: 0.040,
      z: 0.060,
      rx: -0.14,
      ry: 0.08,
      rz: -0.14,
    }
  );
}

export function rifleMagazineReloadPose(progress) {
  return exchangePose(
    progress,
    {
      // rock-and-lock: the bottom of the magazine swings forward off the
      // front lug, then the whole box drops clear of the magwell
      x: 0.000,
      y: -0.090,
      z: -0.055,
      rx: 0.62,
      ry: 0.00,
      rz: 0.00,
    },
    {
      // carried off to the left while the fresh magazine comes up
      x: -0.220,
      y: -0.050,
      z: 0.030,
      rx: 0.28,
      ry: 0.05,
      rz: -0.18,
    }
  );
}

export function railgunBatteryReloadPose(progress) {
  return exchangePose(
    progress,
    {
      // the spent power cell drops straight out of the receiver belly,
      // canting forward as its rear lug clears the well
      x: 0.000,
      y: -0.175,
      z: -0.045,
      rx: 0.22,
      ry: 0.00,
      rz: 0.00,
    },
    {
      // carried off to the left while the fresh cell comes up
      x: -0.240,
      y: -0.060,
      z: 0.040,
      rx: 0.10,
      ry: 0.06,
      rz: -0.14,
    }
  );
}

export function sidearmReloadComponentPose(id, progress) {
  if (id === 'machine_pistol') return machinePistolMagazineReloadPose(progress);
  if (id === 'desert_eagle') return desertEagleMagazineReloadPose(progress);
  if (id === 'rifle') return rifleMagazineReloadPose(progress);
  if (id === 'railgun') return railgunBatteryReloadPose(progress);
  return REST_POSE;
}

export const sidearmMagazineReloadPose = sidearmReloadComponentPose;

const reloadComponentNames = Object.freeze({
  machine_pistol: 'machine-pistol-magazine',
  desert_eagle: 'deagle-magazine',
  rifle: 'rifle-magazine',
  railgun: 'railgun-battery',
});

/**
 * Apply the current visual exchange pose to a named procedural component.
 * Rest transforms are captured directly from the generated model so cancelled
 * reloads and weapon switches always snap back to a valid seated component.
 */
export function updateSidearmReloadComponent(root, id, progress = null) {
  const name = reloadComponentNames[id];
  if (!root || !name) return;
  const component = root.getObjectByName(name);
  if (!component) return;
  if (!component.userData.reloadRest) {
    component.userData.reloadRest = {
      position: component.position.clone(),
      quaternion: component.quaternion.clone(),
    };
  }
  const rest = component.userData.reloadRest;
  const pose = sidearmReloadComponentPose(id, progress);
  component.position.copy(rest.position).add(new THREE.Vector3(
    pose.offsetX,
    pose.offsetY,
    pose.offsetZ
  ));
  component.quaternion.copy(rest.quaternion).multiply(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      pose.rotationX,
      pose.rotationY,
      pose.rotationZ
    ))
  );
  component.visible = pose.visible;
}

export const updateSidearmMagazineReload = updateSidearmReloadComponent;
