import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AudioEngine, SAMPLE_URLS } from '../src/core/audio.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

function audioParam(value = 0) {
  return {
    value,
    cancelScheduledValues() {},
    setTargetAtTime(next) { this.value = next; },
  };
}

function audioNode(extra = {}) {
  return {
    connect() {},
    ...extra,
  };
}

function fakeContext() {
  const sources = [];
  return {
    currentTime: 10,
    sources,
    createBufferSource() {
      const source = audioNode({
        nodeKind: 'buffer',
        buffer: null,
        playbackRate: audioParam(1),
        loop: false,
        started: null,
        stopped: null,
        addEventListener(type, callback) {
          if (type === 'ended') this.onEnded = callback;
        },
        start(...args) { this.started = args; },
        stop(...args) { this.stopped = args; },
      });
      sources.push(source);
      return source;
    },
    createOscillator() {
      const source = audioNode({
        nodeKind: 'oscillator',
        type: 'sine',
        frequency: audioParam(440),
        started: null,
        stopped: null,
        start(...args) { this.started = args; },
        stop(...args) { this.stopped = args; },
      });
      sources.push(source);
      return source;
    },
    createBiquadFilter() {
      return audioNode({
        type: '',
        frequency: audioParam(20000),
        Q: audioParam(1),
      });
    },
    createStereoPanner() {
      return audioNode({ pan: audioParam(0) });
    },
    createGain() {
      return audioNode({ gain: audioParam(1) });
    },
  };
}

console.log('\nphysical audio and managed vehicle-loop audit\n');

const required = [
  'matchAmbience',
  'casFlyby',
  'casCannon',
  'bomberFlyby',
  'helicopterLoop',
  'streakEnemyUavInbound',
  'streakEnemyTvMissileInbound',
  'desertEagleShot',
];
check('all supplied ambience, vehicle and warning recordings are mapped',
  required.every((name) =>
    SAMPLE_URLS[name] && existsSync(fileURLToPath(SAMPLE_URLS[name]))));

const ctx = fakeContext();
const audio = new AudioEngine({ volume: 1 });
audio.ready = true;
audio.ctx = ctx;
audio.master = audioNode();
audio.samples.set('helicopterLoop', { duration: 58.4 });
audio.listener = {
  x: 0, y: 0, z: 0,
  rx: 1, ry: 0, rz: 0,
  fx: 0, fy: 0, fz: -1,
};

const started = audio.startManagedLoop('apache:test', 'helicopterLoop', {
  gain: 0.7,
  pos: { x: 10, y: 20, z: 0 },
  maxDistance: 400,
  fadeIn: 1,
});
const active = audio.managedLoops.get('apache:test');
const nearGain = active?.gainNode.gain.value;
audio.updateManagedLoop('apache:test', {
  pos: { x: 390, y: 0, z: 0 },
});
const farGain = active?.gainNode.gain.value;
check('vehicle loops follow entity position and become quieter with distance',
  started && nearGain > farGain && farGain > 0);

const stopped = audio.stopManagedLoop('apache:test', 1.2);
check('vehicle departure removes the live controller and schedules a fade stop',
  stopped
    && !audio.managedLoops.has('apache:test')
    && Array.isArray(ctx.sources[0]?.stopped)
    && ctx.sources[0].stopped[0] > ctx.currentTime);

const pending = audio.startManagedLoop('cas:test', 'casFlyby', {
  gain: 0.8,
  pos: { x: 0, y: 200, z: 0 },
});
audio.samples.set('casFlyby', { duration: 8.33 });
audio._flushPendingManagedLoops('casFlyby');
check('a vehicle spawned during decoding starts exactly once after its sample is ready',
  pending
    && !audio.pendingManagedLoops.has('cas:test')
    && audio.managedLoops.has('cas:test'));

const audioSource = readFileSync(new URL('../src/core/audio.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
check('physical game cues no longer invoke oscillator-tone layers',
  !/this\.tone\(/.test(audioSource));
check('match ambience and each aircraft class use managed lifecycle audio',
  /startManagedLoop\('match-ambience', 'matchAmbience'/.test(mainSource)
    && /`cas:\$\{run\.id\}:\$\{pass\}`/.test(mainSource)
    && /`bomber:\$\{run\.id\}`/.test(mainSource)
    && /`attack-heli:\$\{heli\.id\}`/.test(mainSource)
    && /`transport-heli:\$\{drop\.id\}`/.test(mainSource)
    && !/audio\.(casFlyby|helicopterFlyby)\(/.test(mainSource));
check('the supplied A-10 cannon recording is played in full',
  /_sample\('casCannon'[\s\S]{0,120}distanceAttenuation: false/.test(audioSource));
const deagleAudio = new AudioEngine({ volume: 1 });
deagleAudio.ready = true;
let deagleSample = null;
deagleAudio._sample = (name, options) => {
  deagleSample = { name, options };
  return true;
};
deagleAudio.shot({ kind: 'magnum' }, { x: 2, y: 1, z: -4 });
check('the Desert Eagle uses only its supplied full gunshot recording',
  deagleSample?.name === 'desertEagleShot'
    && deagleSample.options.pos.x === 2
    && deagleSample.options.gain === 0.90);

const chargeCtx = fakeContext();
const chargeAudio = new AudioEngine({ volume: 1 });
chargeAudio.ready = true;
chargeAudio.ctx = chargeCtx;
chargeAudio.master = audioNode();
chargeAudio._noise = { duration: 2 };
const chargeStarted = chargeAudio.updateRailgunCharge(0.12);
const activeCharge = chargeAudio.railgunCharge;
const earlyPitch = activeCharge?.whine.frequency.value;
const earlyArcGain = activeCharge?.arcGain.gain.value;
chargeAudio.updateRailgunCharge(0.92);
check('ARC-7 charge audio rises with the exact normalized charge progress',
  chargeStarted
    && activeCharge === chargeAudio.railgunCharge
    && activeCharge.whine.frequency.value > earlyPitch
    && activeCharge.arcGain.gain.value > earlyArcGain
    && chargeCtx.sources.filter((source) => source.nodeKind === 'oscillator').length === 2
    && chargeCtx.sources.some((source) => source.nodeKind === 'buffer' && source.loop));
const chargeStopped = chargeAudio.stopRailgunCharge(0.05);
check('cancelled charge fades and stops every electrical source',
  chargeStopped
    && chargeAudio.railgunCharge === null
    && chargeCtx.sources.length === 3
    && chargeCtx.sources.every((source) => Array.isArray(source.stopped)));

const railShotAudio = new AudioEngine({ volume: 1 });
railShotAudio.ready = true;
const railBursts = [];
let chargeCancelledByShot = false;
railShotAudio.burst = (options) => railBursts.push(options);
railShotAudio.stopRailgunCharge = () => {
  chargeCancelledByShot = true;
  return true;
};
const railShotPos = { x: 18, y: 2, z: -11 };
railShotAudio.shot({ kind: 'railgun' }, railShotPos);
check('the rail cannon discharge is a large spatial pressure event, not a rifle report',
  chargeCancelledByShot
    && railBursts.length === 7
    && railBursts.every((burst) => burst.pos === railShotPos)
    && railBursts.some((burst) =>
      burst.type === 'highpass' && burst.dur <= 0.03 && burst.gain >= 1)
    && railBursts.some((burst) =>
      burst.type === 'lowpass' && burst.dur >= 0.5 && burst.gain >= 1.5)
    && railBursts.some((burst) =>
      burst.type === 'bandpass' && burst.delay >= 0.15 && burst.dur >= 0.8));
check('pause, death and reward exit explicitly silence an unfinished ARC-7 charge',
  /syncRailgunChargeAudio\(\)/.test(mainSource)
    && /endLaserCannon[\s\S]{0,240}stopRailgunCharge\(\)/.test(mainSource));
check('sentry operator speech receives its dedicated gain lift',
  /action === 'sentry' \? 1\.35 : 1/.test(mainSource));

if (failures) {
  console.log(`\n${failures} physical audio check(s) failed\n`);
  process.exit(1);
}
console.log('\nphysical audio, ambience and aircraft lifecycles verified\n');
