import { installDomStub } from './domstub.mjs';

installDomStub();

const THREE = await import('three');
const { buildTextures } = await import('../src/world/textures.js');
const { CharacterRig } = await import('../src/game/character.js');
const { RemotePlayer } = await import('../src/game/remoteplayer.js');
const {
  CHARACTER_HITBOX_PROFILES,
  characterHitboxesForState,
  rayCharacterHitboxes,
} = await import('../src/game/stance-hitboxes.js');
const { rayPlayer } = await import('../server/world.mjs');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`  FAIL ${name}\n       ${error.stack || error}`);
  }
}

function near(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected.toFixed(3)} +/- ${tolerance}, got ${actual.toFixed(3)}`);
  }
}

const textures = buildTextures();
const baseState = {
  position: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  speed: 0,
  moveX: 0,
  moveZ: 0,
  aiming: true,
  grounded: true,
  firing: false,
  sprinting: false,
};

function settledRig(flags) {
  const rig = new CharacterRig(textures, { team: 'red' });
  for (let frame = 0; frame < 240; frame++) {
    // Measure the authored neutral stance, not a random frame of the cosmetic
    // idle weight shift. Runtime animation-envelope coverage is checked
    // separately by the ray cases below.
    rig.idleT = -1 / 60;
    rig.update(1 / 60, { ...baseState, ...flags });
  }
  rig.root.updateMatrixWorld(true);
  return rig;
}

function headBounds(rig) {
  const head = rig.hitboxes.find((box) => box.userData.hitPart === 'head');
  return new THREE.Box3().setFromObject(head);
}

function animatedHeadEnvelope(flags) {
  const rig = new CharacterRig(textures, { team: 'red' });
  const envelope = new THREE.Box3();
  for (let frame = 0; frame < 900; frame++) {
    rig.idleT = -1 / 60;
    rig.update(1 / 60, { ...baseState, ...flags });
    rig.root.updateMatrixWorld(true);
    // Let both the posture damping and sprint blend settle before measuring
    // several complete left/right gait cycles.
    if (frame >= 240) envelope.union(headBounds(rig));
  }
  return envelope;
}

function visibleBounds(root) {
  const bounds = new THREE.Box3();
  root.traverseVisible((object) => {
    if (object.isMesh && object.visible) {
      bounds.union(new THREE.Box3().setFromObject(object));
    }
  });
  return bounds;
}

console.log('\nPIXEL OPS stance hitbox check\n');

for (const [name, flags] of Object.entries({
  stand: { crouch: false, sliding: false },
  crouch: { crouch: true, sliding: false },
  slide: { crouch: true, sliding: true },
})) {
  check(`${name} authoritative head volume follows the rendered head`, () => {
    const rig = settledRig(flags);
    const rendered = headBounds(rig);
    const profile = CHARACTER_HITBOX_PROFILES[name][0];
    for (let axis = 0; axis < 3; axis++) {
      near(
        rendered.min.getComponent(axis),
        profile.center[axis] - profile.half[axis],
        0.035,
        `${name} head min axis ${axis}`
      );
      near(
        rendered.max.getComponent(axis),
        profile.center[axis] + profile.half[axis],
        0.035,
        `${name} head max axis ${axis}`
      );
    }
  });
}

for (const [name, flags] of Object.entries({
  run: { speed: 5.4, moveZ: -1, aiming: false, sprinting: false },
  sprint: { speed: 7, moveZ: -1, aiming: false, sprinting: true },
})) {
  check(`${name} authoritative head volume covers the animated gait`, () => {
    const rendered = animatedHeadEnvelope(flags);
    const profile = CHARACTER_HITBOX_PROFILES[name][0];
    for (let axis = 0; axis < 3; axis++) {
      const min = profile.center[axis] - profile.half[axis];
      const max = profile.center[axis] + profile.half[axis];
      if (rendered.min.getComponent(axis) < min - 0.025
        || rendered.max.getComponent(axis) > max + 0.025) {
        throw new Error(
          `${name} head axis ${axis}: rendered ${rendered.min.getComponent(axis).toFixed(3)}..${rendered.max.getComponent(axis).toFixed(3)}, volume ${min.toFixed(3)}..${max.toFixed(3)}`
        );
      }
    }
  });
}

check('crouch, run and sprint keep the upper body over or ahead of the hips', () => {
  for (const [name, flags] of Object.entries({
    crouch: { crouch: true, sliding: false },
    run: { speed: 5.4, moveZ: -1, aiming: false },
    sprint: { speed: 7, moveZ: -1, aiming: false, sprinting: true },
  })) {
    const center = headBounds(settledRig(flags)).getCenter(new THREE.Vector3());
    if (center.z >= -0.03) {
      throw new Error(`${name} head remains behind the hips at z=${center.z.toFixed(3)}`);
    }
  }
});

check('analytical running and sprinting volumes move forward with the rendered pose', () => {
  const run = characterHitboxesForState({ speed2D: 5.4, sprinting: false })[0];
  const sprint = characterHitboxesForState({ speed2D: 7, sprinting: true })[0];
  if (run.center[2] >= -0.03 || sprint.center[2] >= run.center[2] - 0.05) {
    throw new Error(`run z=${run.center[2]}, sprint z=${sprint.center[2]}`);
  }
});

check('slide pose stays low without sinking through the floor', () => {
  const rig = settledRig({ crouch: true, sliding: true });
  // Hidden hit volumes and the dormant Juggernaut overlay are authored on the
  // same rig, but neither is part of the normal soldier's rendered silhouette.
  const bounds = visibleBounds(rig.root);
  if (bounds.min.y < -0.08) throw new Error(`slide model sinks to ${bounds.min.y.toFixed(3)}m`);
  if (bounds.max.y > 1.24) throw new Error(`slide model remains too tall at ${bounds.max.y.toFixed(3)}m`);
});

const position = new THREE.Vector3(0, 0, 0);
const frontOrigin = (y) => new THREE.Vector3(0, y, -5);
const forwardRay = new THREE.Vector3(0, 0, 1);
const cast = (state, y) => rayCharacterHitboxes(
  { position, yaw: 0, ...state },
  frontOrigin(y),
  forwardRay,
  20
);

check('standing sniper ray hits visible upper head', () => {
  const hit = cast({ crouchBlend: 0, slideBlend: 0 }, 1.88);
  if (hit?.part !== 'head' || hit.mult !== 2.2) throw new Error(`unexpected hit: ${hit?.part || 'miss'}`);
});

check('standing chest ray cannot be misclassified as a headshot', () => {
  const hit = cast({ crouchBlend: 0, slideBlend: 0 }, 1.30);
  if (hit?.part !== 'chest' || hit.mult !== 1) throw new Error(`unexpected hit: ${hit?.part || 'miss'}`);
});

check('ray above the standing model misses', () => {
  if (cast({ crouchBlend: 0, slideBlend: 0 }, 2.03)) throw new Error('empty space registered a hit');
});

check('crouching head and chest use their lowered rendered positions', () => {
  if (cast({ crouchBlend: 1, slideBlend: 0 }, 1.40)?.part !== 'head') {
    throw new Error('crouching head missed');
  }
  if (cast({ crouchBlend: 1, slideBlend: 0 }, 0.80)?.part !== 'chest') {
    throw new Error('crouching chest missed');
  }
});

check('sliding head and body follow the forward low pose', () => {
  if (cast({ crouchBlend: 1, slideBlend: 1 }, 0.90)?.part !== 'head') {
    throw new Error('sliding head missed');
  }
  if (cast({ crouchBlend: 1, slideBlend: 1 }, 0.40)?.part !== 'chest') {
    throw new Error('sliding body missed');
  }
  if (cast({ crouchBlend: 1, slideBlend: 1 }, 1.25)) {
    throw new Error('ray above sliding model registered a hit');
  }
});

check('yaw-oriented volume still hits the side-facing rendered head', () => {
  const hit = rayCharacterHitboxes(
    { position, yaw: Math.PI / 2, crouchBlend: 0, slideBlend: 0 },
    new THREE.Vector3(-5, 1.88, 0),
    new THREE.Vector3(1, 0, 0),
    20
  );
  if (hit?.part !== 'head') throw new Error(`unexpected hit: ${hit?.part || 'miss'}`);
});

check('server rayPlayer delegates to the shared stance volumes', () => {
  const player = {
    actor: {
      alive: true,
      position,
      yaw: 0,
      crouchBlend: 0,
      slideBlend: 0,
    },
  };
  const head = rayPlayer(player, frontOrigin(1.88), forwardRay, 20);
  const chest = rayPlayer(player, frontOrigin(1.30), forwardRay, 20);
  if (head?.player !== player || head.part !== 'head') throw new Error('server head ray diverged');
  if (chest?.player !== player || chest.part !== 'chest') throw new Error('server chest ray diverged');
});

check('remote snapshot drives the visible slide pose', () => {
  const scene = new THREE.Scene();
  const snapshot = {
    id: 'slider',
    name: 'SLIDER',
    team: 'red',
    weapon: 'rifle',
    p: [0, 0, 0],
    v: [0, 0, -7],
    yaw: 0,
    pitch: 0,
    alive: true,
    health: 100,
    armor: 50,
    kills: 0,
    deaths: 0,
    score: 0,
    firing: 0,
    crouch: true,
    sliding: false,
    grounded: true,
  };
  const remote = new RemotePlayer(scene, textures, snapshot, 'red');
  remote.applySnapshot({ ...snapshot, sliding: true });
  for (let frame = 0; frame < 120; frame++) remote.update(1 / 60);
  remote.rig.root.updateMatrixWorld(true);
  // Ignore invisible ray volumes and the dormant Juggernaut armor mounted on
  // the shared skeleton; neither is part of this ordinary remote's silhouette.
  const bounds = visibleBounds(remote.rig.root);
  if (remote.rig.slideBlend < 0.98) throw new Error('slide state never reached the rig');
  if (bounds.max.y > 1.24) throw new Error(`remote still renders crouched at ${bounds.max.y.toFixed(3)}m`);
  remote.dispose();
});

if (failures) {
  console.log(`\n${failures} stance hitbox check(s) failed.\n`);
  process.exit(1);
}

console.log('\nAll stance hitbox checks passed.\n');
