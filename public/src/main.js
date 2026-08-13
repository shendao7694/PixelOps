// PIXEL OPS - boot, match logic, combat resolution and the main loop.
// Hit-registration debugging: load with ?shotdebug=1 to trace the local
// (non-authoritative) side of every shot, to pair with server PVP_SHOT_DEBUG.
const SHOT_DEBUG = typeof location !== 'undefined'
  && new URLSearchParams(location.search).has('shotdebug');
function localShotLog(event, detail) {
  if (!SHOT_DEBUG) return;
  console.log(`[PVP-LOCAL] ${performance.now().toFixed(0)} ${event} ${detail}`);
}
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, damp, rand, randInt, pick, TAU, angleDamp, angleDelta } from './core/math.js';
import { loadSettings, saveSettings, adjustSetting } from './core/settings.js';
import { applyDocumentLanguage, localizeText } from './core/i18n.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { PixelPipeline } from './render/pixelpipeline.js';
import { buildTextures } from './world/textures.js';
import { buildLevelFromParts, disposeLevel } from './world/levelbuild.js';
import { castGrenadeSolids } from './world/grenade-collision.js';
import { loadMap, MAP_IDS, MAP_REGISTRY, DEFAULT_MAP_ID } from './world/mapstore.js';
import { Player } from './game/player.js';
import { Bot } from './game/bot.js';
import { RemotePlayer } from './game/remoteplayer.js';
import {
  advanceKillerCamera,
  createKillerCamera,
  killerCameraHandoffReady,
} from './game/killer-camera.js';
import { automaticRespawnReady } from './game/respawn.js';
import { rayCharacterHitboxes } from './game/stance-hitboxes.js';
import { createMartyrdomGrenade } from './game/martyrdom.js';
import {
  readyForActionActive,
  readyForActionMovementMultiplier,
  readyForActionUntil,
} from './game/ready-for-action.js';
import { ViewModel } from './game/viewmodel.js';
import {
  PASSIVE_IDS,
  loadSavedLoadout,
  loadoutArmorCapacity,
  loadoutExplosiveDamage,
  loadoutHasPassive,
  loadoutHasStreak,
  loadoutHealthRegenDelay,
  loadoutMovementMultiplier,
  loadoutOption,
  loadoutSecondaryOption,
  loadoutStreakCrossings,
  loadoutStreakKey,
  sanitizeLoadout,
  saveLoadout,
} from './game/loadout.js';
import { pressedEquipmentSlot } from './game/equipment-hotkeys.js';
import {
  createStreakWheelState,
  resetStreakWheelState,
  streakWheelBlocksCombat,
  updateStreakWheelState,
} from './game/streak-wheel.js';
import {
  createUavDroneState,
  UAV_CALL_COMMIT_SECONDS,
  UAV_CALL_DURATION_SECONDS,
  UAV_DRONE_HEALTH,
  UAV_DURATION_SECONDS,
  UAV_FIRST_SWEEP_SECONDS,
  UAV_REVEAL_SECONDS,
  UAV_SWEEP_INTERVAL_SECONDS,
  uavDronePose,
  uavRevealAlpha,
} from './game/uav.js';
import { UavDroneView } from './game/uav-drone-view.js';
import { keepsPvpSimulationRunning, shouldPauseOnUnlock } from './game/pausepolicy.js';
import { WEAPON_ORDER, WEAPON_DEFS } from './game/weapons.js';
import {
  LASER_CANNON_ID,
  LASER_CANNON_SHOTS,
  LASER_CANNON_THERMAL_LAYER,
} from './game/laser-cannon.js';
import {
  chooseCombatKnifeTarget,
  combatKnifeTargetPoint,
} from './game/melee.js';
import { SENTRY_CONFIG, buildSentryModel } from './game/sentry.js';
import {
  GRENADES_PER_LIFE,
  GRENADE_BLAST_RADIUS,
  GRENADE_FUSE_SECONDS,
  GRENADE_PHYSICS_STEP,
  GrenadeTrajectory,
  GrenadeView,
  advanceGrenade,
  buildGrenadeModel,
  grenadeBlastOccluded,
  grenadeDamage,
  grenadeCreatesFire,
  grenadeDetonationAudioCue,
  grenadeDetonatesOnImpact,
  grenadeInputAction,
  grenadeKind,
  grenadeThrowVelocity,
} from './game/grenade.js';
import {
  operatorVoiceActionForGrenade,
  operatorVoiceGain,
  operatorVoiceLine,
  operatorVoiceShouldTrigger,
  randomOperatorVoiceSeed,
  teammateOperatorVoiceReady,
} from './game/operator-voice.js';
import {
  casOutcomeVoiceCue,
  randomStreakVoiceSeed,
  streakVoiceLineFor,
} from './game/streak-voice.js';
import {
  AIRSTRIKE_INCENDIARY_DURATION_SECONDS,
  AIRSTRIKE_INCENDIARY_KIND,
  INCENDIARY_DURATION_SECONDS,
  INCENDIARY_TICK_SECONDS,
  MOLOTOV_DURATION_SECONDS,
  buildIncendiaryFieldModel,
  conformIncendiaryFieldToGround,
  incendiaryDamage,
  incendiaryDuration,
  incendiaryOccluded,
  incendiaryRadius,
  normalizeIncendiaryKind,
  updateIncendiaryFieldModel,
} from './game/incendiary.js';
import {
  applyTvMissileMouseSteering,
  advanceTvMissile,
  createTvMissile,
  syncTvMissileControlFrame,
  triggerTvMissileBoost,
  tvMissileCameraUp,
  tvMissileDirection,
} from './game/tvmissile.js';
import {
  CAS_DELAY_SECONDS,
  CAS_FLIGHT_SECONDS,
  CAS_PASS_COUNT,
  CAS_ROUNDS,
  CAS_RUN_LENGTH,
  CAS_RUN_WIDTH,
  casDamage,
  casFlightPose,
  casImpactPoint,
  casRoundPass,
  casRoundTime,
  normalizeCasPlan,
} from './game/close-air-support.js';
import {
  FIREBOMB_BLAST_RADIUS,
  FIREBOMB_BOMB_COUNT,
  FIREBOMB_ALTITUDE,
  FIREBOMB_OFFMAP_DISTANCE,
  firebombBlastOccluded,
  firebombDamage,
  firebombFallingBombPose,
  firebombFlightPose,
  firebombImpactPoint,
  firebombImpactTime,
  firebombRunLifetimeSeconds,
  normalizeFirebombPlan,
} from './game/firebomb-airstrike.js';
import { FirebombFieldRenderer } from './game/firebomb-field-renderer.js';
import {
  ATTACK_HELICOPTER_APPROACH_SECONDS,
  ATTACK_HELICOPTER_BURST_COOLDOWN_SECONDS,
  ATTACK_HELICOPTER_BURST_ROUNDS,
  ATTACK_HELICOPTER_DAMAGE,
  ATTACK_HELICOPTER_FIRE_ALIGNMENT,
  ATTACK_HELICOPTER_HEALTH,
  ATTACK_HELICOPTER_LIFETIME_SECONDS,
  ATTACK_HELICOPTER_ON_STATION_SECONDS,
  ATTACK_HELICOPTER_SHOT_INTERVAL_SECONDS,
  attackHelicopterLockDelay,
  attackHelicopterOnStation,
  attackHelicopterPose,
  attackHelicopterTargetEligible,
  attackHelicopterYaw,
  turnAttackHelicopterYaw,
} from './game/attack-helicopter.js';
import {
  CasTabletView,
  UavRadioView,
  createA10Visual,
  preloadA10Model,
  releaseA10Visual,
} from './game/close-air-support-view.js';
import {
  createApacheVisual,
  createB2Visual,
  createFirebombBombBatch,
  preloadApacheModel,
  preloadB2Model,
  releaseApacheVisual,
  releaseB2Visual,
  updateApacheRotors,
} from './game/air-support-view.js';
import {
  AIRDROP_IMPACT_SECONDS,
  JUGGERNAUT_CALL_COMMIT_SECONDS,
  JUGGERNAUT_CALL_DURATION_SECONDS,
  JUGGERNAUT_CRATE_LIFETIME_SECONDS,
  JUGGERNAUT_INTERACT_SECONDS,
  JUGGERNAUT_MAX_ARMOR,
  JUGGERNAUT_MAX_HEALTH,
  characterHitIsHeadshot,
  characterHitMultiplier,
  createJuggernautAirdrop,
  airdropHelicopterPose,
  juggernautCanUseKillstreak,
  shouldPlayJuggernautBreathing,
  withinAirdropInteraction,
} from './game/juggernaut.js';
import {
  JuggernautAirdropView,
  preloadTransportHelicopterModel,
} from './game/juggernaut-view.js';
import { PvpClient } from './net/pvp-client.js';
import {
  PVP_MOVEMENT_SUBSTEPS,
  PVP_MATCH_SCORE_LIMIT,
  PVP_TICK_MS,
  PVP_TICK_RATE,
  hasPvpChatMessage,
  sanitizePlayerName,
} from './net/protocol.js';
import {
  absorbViewCorrection,
  capturePvpShotAim,
  decayViewCorrection,
  movementCorrection,
  pvpShotAimForInput,
  reconcilePredictedAmmo,
  ReloadCycleGuard,
  samplePoseHistory,
} from './net/pvp-sync.js';
import { Effects } from './fx/effects.js';
import { Hud } from './ui/hud.js';
import { LoadoutScreen } from './ui/loadout-screen.js';
import { MapVoteScreen } from './ui/map-vote-screen.js';
import { customConfig } from './fx/custom.js'

// import  './safe/safe.js';
(async() => {(async() => {(async() => {(async() => {(async() => {(async() => {

const MAX_TICKETS = customConfig.max_ticket;
const RESPAWN_TIME = 4.5;
// Bots hit for less than their weapon says. Combined with the loose aim in
// bot.js this is what keeps a five-a-side firefight survivable.
const BOT_DAMAGE = 0.68;
const STRIKE_RADIUS = 32;      // missile blast radius
const STRIKE_SPEED = 38;       // slow enough to watch it come in
const SENTRY_WEAPON = Object.freeze({ ...WEAPON_DEFS.rifle, id: 'sentry' });
const HUD_RETICLE_RADIUS = 0.18;
const ENEMY_VITAL_HIT_HOLD = 0.32;
const ENEMY_VITAL_DEATH_HOLD = 2.8;
const PVP_GRENADE_ACK_TIMEOUT = 1.25;
const MATCH_AMBIENCE_MODES = new Set([
  'loadout',
  'playing',
  'dead',
  'paused',
  'votekick',
  'gameover',
  'mapvote',
]);
const STREAK_CALL_TIMING = Object.freeze({
  uav: Object.freeze({
    commit: UAV_CALL_COMMIT_SECONDS,
    duration: UAV_CALL_DURATION_SECONDS,
  }),
  strike: Object.freeze({ commit: 0.72, duration: 1.18 }),
  juggernaut: Object.freeze({
    commit: JUGGERNAUT_CALL_COMMIT_SECONDS,
    duration: JUGGERNAUT_CALL_DURATION_SECONDS,
  }),
  attack_helicopter: Object.freeze({
    commit: UAV_CALL_COMMIT_SECONDS,
    duration: UAV_CALL_DURATION_SECONDS,
  }),
});
const PVP_STREAK_ANNOUNCEMENTS = Object.freeze({
  uav: Object.freeze({
    title: 'UAV ONLINE',
    label: 'UAV',
    duration: 2.4,
    color: '#7de08a',
  }),
  strike: Object.freeze({
    title: 'MISSILE AWAY',
    label: 'TV MISSILE',
    duration: 1.8,
    color: '#ff5b4c',
  }),
  juggernaut: Object.freeze({
    title: 'AW101 INBOUND',
    label: 'JUGGERNAUT',
    duration: 2.5,
    color: '#e5d788',
  }),
  sentry: Object.freeze({
    title: 'SENTRY DEPLOYED',
    label: 'SENTRY GUN',
    duration: 1.8,
    color: '#8ecbff',
  }),
  cas: Object.freeze({
    title: 'PRECISION AIRSTRIKE',
    label: 'A-10 STRIKE',
    duration: 2.1,
    color: '#ff9f55',
  }),
  firebomb: Object.freeze({
    title: 'INCENDIARY AIRSTRIKE INBOUND',
    label: 'INCENDIARY AIRSTRIKE',
    duration: 2.2,
    color: '#ff8a45',
  }),
  attack_helicopter: Object.freeze({
    title: 'AH-64D INBOUND',
    label: 'ATTACK HELICOPTER',
    duration: 2.2,
    color: '#ffb35a',
  }),
  railgun: Object.freeze({
    title: 'LASER CANNON ONLINE',
    label: 'LASER CANNON',
    duration: 2.0,
    color: '#ff5347',
  }),
});

class Game_ { ohp = 100; settings = null; stage = null; sceneCanvas = null; hudCanvas = null; chatLayer = null; chatLog = null; chatEntry = null; chatInput = null; chatOpen = false; systemDialog = null; systemDialogTitle = null; systemDialogMessage = null; systemDialogConfirm = null; systemDialogOpen = false; systemDialogCopy = null; loadoutLayer = null; mapVoteLayer = null; input = null; audio = null; pipeline = null; hud = null; loadout = null; readyForActionUntil = 0; loadoutInitial = false; pvpDeployPending = false; loadoutScreen = null; mapVoteScreen = null; pvpMapVote = null; pvpMapVoteResume = false; textures = null; scene = null; mapId = null; map = null; level = null; camera = null; effects = null; firebombFields = null; strikeFlash = null; player = null; viewModel = null; casTabletView = null; uavRadioView = null; grenadeView = null; grenadeTrajectory = null; grenadesRemaining = 0; grenadeSelected = false; grenadePinAt = 0; grenadeThrowAiming = false; grenadeImpactThrowHeld = false; grenadeProjectiles = null; incendiaryZones = null; pvpGrenadeThrowQueued = false; pvpGrenadePinQueued = false; pvpMeleeQueued = false; pvpGrenadeCountPending = false; pvpGrenadePendingUntil = 0; bots = []; raycaster = null; killerCamera = null; killerCameraViewActive = false; mode = 'title'; time = 0; fps = 60; fpsAcc = 0; fpsFrames = 0; respawnTimer = 0; killStreak = 0; streakScore = 0; multiKillTimer = 0; multiKillCount = 0; totalScore = 0; match = null; uav = null; uavDrones = null; pvpUavClockServerTime = 0; pvpUavClockReceivedAt = 0; strikeCharges = 0; missile = null; tvMissile = null; tvMissileCam = 0; pvpMissileBoostQueued = false; sentryCharges = 0; sentry = null; casCharges = 0; firebombCharges = 0; attackHelicopterCharges = 0; juggernautCharges = 0; railgunCharges = 0; railgunActive = false; railgunReturnWeapon = null; airdrops = null; airdropInteraction = null; localAirdropSeq = 0; casTargeting = null; casRuns = null; firebombTargeting = null; firebombRuns = null; attackHelicopters = null; streakCall = null; pendingSelfOperatorVoices = []; pendingStreakVoices = []; dialogueSequence = 0; lastSelfOperatorVoice = null; teammateOperatorVoiceAt = null; streakWheel = null; weaponReturnDelay = 0; pvpCasPending = false; pvpCasPendingUntil = 0; pvpFirebombPending = false; pvpFirebombPendingUntil = 0; pvpRailgunPending = false; pvpRailgunFireCommitUntil = 0; pvpShotAim = null; gameType = 'pve'; pvpRemotes = null; pvpSentries = null; pvpMissiles = null; pvpSnapshot = null; pvpStatus = 'offline'; pvpRooms = []; pvpLatency = 0; pvpRoom = null; pvpInputSeq = 0; pvpSendAcc = 0; pvpPoseHistory = []; pvpJumpQueued = false; pvpJumpBuffer = 0; pvpSlideQueued = false; pvpReloadQueued = false; pvpReadyForActionActive = false; pvpViewCorrection = null; pvpReloadCycles = null; pvpPredictedReload = null; pvpServerReloading = null; pvpActiveReloadCycle = null; pvpAmmoAuthority = null; pvpAmmoObserved = null; pvpAmmoPredictUntil = null; pvpLastHealth = 0; pvpLastArmor = 0; pvpVoteKick = null; pvpVoteKickCooldown = 0; pvpVoteKickMenuOpenedAt = 0; pvpBanUntil = 0; pvpRegionCheckSeq = 0; pvpRegionCheckPending = false; pvpAuthPending = false; pvpOwnSentryId = null; pvpUavSweepSeq = 0; pvpUavRevealTime = 0; pvpUavMarks = []; enemyHudActor = null; enemyHudHeldTargets = null; enemyHudMode = null; enemyHudScanAt = 0; teammateHudStates = null; teammateHudMode = null; teammateHudScanAt = 0; pvpName = ''; pvp = null; fireLock = false; jumpLock = false; _v1 = null; _v2 = null; _v3 = null; _dir = null; _coneUp = null; _coneRight = null; _coneRealUp = null; _box = null; _ray = null; _hotCache = false; frameParity = 0; flashTimer = 0; prevMode = 'title'; pvpDamageAudioAt = 0; constructor() { this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3(); this._dir = new THREE.Vector3(); this._coneUp = new THREE.Vector3(); this._coneRight = new THREE.Vector3(); this._coneRealUp = new THREE.Vector3(); this._box = new THREE.Box3(); this._ray = new THREE.Ray(); this.match = { blueTickets: 0, redTickets: 0, maxTickets: 0, over: false, winner: null }; this.uav = { charges: 0, time: 0, ping: 0 }; this.uavDrones = new Map(); this.grenadeProjectiles = new Map(); this.incendiaryZones = new Map(); this.pvpRemotes = new Map(); this.pvpSentries = new Map(); this.pvpMissiles = new Map(); this.pvpViewCorrection = new THREE.Vector3(); this.pvpReloadCycles = new ReloadCycleGuard(); this.pvpAmmoAuthority = new Map(); this.pvpAmmoObserved = new Map(); this.pvpAmmoPredictUntil = new Map(); this.enemyHudHeldTargets = new Map(); this.teammateHudStates = new Map(); this.lastSelfOperatorVoice = new Map(); this.teammateOperatorVoiceAt = new Map(); this.streakWheel = createStreakWheelState(); this.airdrops = new Map(); this.casRuns = new Map(); this.firebombRuns = new Map(); this.attackHelicopters = new Map(); this.pvp = { status: () => {}, rooms: () => {}, latency: () => {}, joined: () => {}, snapshot: () => {}, event: () => {}, disconnected: () => {}, authRequired: () => {}, error: () => {} }; this.last = performance.now(); this.loop = () => {}; }}
const game_ = new Game_();

class Game {
  ohp = customConfig.hp;
  constructor() {
    this.settings = loadSettings();
    this.stage = document.getElementById('stage');
    this.sceneCanvas = document.getElementById('scene');
    this.hudCanvas = document.getElementById('hud');
    this.chatLayer = document.getElementById('chat-layer');
    this.chatLog = document.getElementById('chat-log');
    this.chatEntry = document.getElementById('chat-entry');
    this.chatInput = document.getElementById('chat-input');
    this.chatOpen = false;
    this.systemDialog = document.getElementById('system-dialog');
    this.systemDialogTitle = document.getElementById('system-dialog-title');
    this.systemDialogMessage = document.getElementById('system-dialog-message');
    this.systemDialogConfirm = document.getElementById('system-dialog-confirm');
    this.systemDialogOpen = false;
    this.systemDialogCopy = null;
    this.loadoutLayer = document.getElementById('loadout-layer');
    this.mapVoteLayer = document.getElementById('map-vote-layer');

    this.input = new Input(this.stage);
    const hudCanvas = document.getElementById('hud');
    hudCanvas.addEventListener('touchstart', function(e) {
      e.preventDefault();
    }, { passive: false });
    hudCanvas.addEventListener('touchmove', function(e) {
      e.preventDefault();
    }, { passive: false });
    hudCanvas.addEventListener('touchend', function(e) {
      e.preventDefault();
      const touch = e.changedTouches[0];
      if (!touch) return;
      
      const rect = this.getBoundingClientRect();
      const nx = (touch.clientX - rect.left) / rect.width;
      const ny = (touch.clientY - rect.top) / rect.height;
      
      if (typeof this.input.onPress === 'function') {
        this.input.onPress(nx, ny, 0);
      }
      const mouseEvent = new MouseEvent('click', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
        cancelable: true,
      });
      this.dispatchEvent(mouseEvent);
    }.bind(this), { passive: false });
    this.audio = new AudioEngine(this.settings);
    this.pipeline = new PixelPipeline(this.sceneCanvas, this.settings);
    this.hud = new Hud(this.hudCanvas, this.settings);
    this.hud.onStreakReadyShown = () => this.audio.streakReady();
    this.loadout = loadSavedLoadout();
    this.readyForActionUntil = 0;
    this.loadoutInitial = false;
    this.pvpDeployPending = false;
    this.loadoutScreen = new LoadoutScreen(this.loadoutLayer, {
      change: (loadout) => {
        this.loadout = saveLoadout(loadout);
        this.grenadeView?.setKind(this.loadout.grenade);
        this.audio.uiClick();
      },
      deploy: (loadout) => {
        this.loadout = saveLoadout(loadout);
        this.deployLoadout();
      },
      exit: () => this.exitLoadout(),
    }, this.settings.language);
    this.mapVoteScreen = new MapVoteScreen(this.mapVoteLayer, {
      onVote: (mapId) => {
        if (this.pvpMapVote) this.pvpMapVote.selected = mapId;
        this.pvp.castMapVote(mapId);
      },
    });
    this.pvpMapVote = null;
    this.pvpMapVoteResume = false;
    this.applyLanguage();

    this.textures = buildTextures();
    this.scene = new THREE.Scene();
    this.mapId = DEFAULT_MAP_ID;
    this.map = null;
    this.level = null;
    this.applyMap(DEFAULT_MAP_ID);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 16 / 9, 0.05, 600);
    this.camera.rotation.order = 'YXZ';

    this.effects = new Effects(this.scene, this.textures);
    this.firebombFields = new FirebombFieldRenderer(this.scene, {
      pixelScale: this.pipeline.height
        / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5)),
    });
    // one shared light for missile-strike blasts
    this.strikeFlash = new THREE.PointLight(0xffc07a, 0, 46, 2);
    this.scene.add(this.strikeFlash);
    this.player = new Player({
      camera: this.camera, level: this.level, settings: this.settings, audio: this.audio,
    });
    this.player.name = 'YOU';
    this.player.team = 'blue';
    this.player.kills = 0;
    this.player.deaths = 0;
    this.player.score = 0;

    this.viewModel = new ViewModel({
      textures: this.textures, audio: this.audio, settings: this.settings, team: 'blue',
    });
    this.viewModel.equip('rifle', true);
    this.hookWeapon();
    this.casTabletView = new CasTabletView(this.viewModel.scene, this.settings);
    this.uavRadioView = new UavRadioView(this.viewModel.scene);
    this.grenadeView = new GrenadeView(this.viewModel.scene, {
      textures: this.textures,
      kind: this.loadout.grenade,
    });
    this.grenadeTrajectory = new GrenadeTrajectory(this.scene);
    this.grenadesRemaining = GRENADES_PER_LIFE;
    this.grenadeSelected = false;
    this.grenadePinAt = 0;
    this.grenadeThrowAiming = false;
    this.grenadeImpactThrowHeld = false;
    this.grenadeProjectiles = new Map();
    this.incendiaryZones = new Map();
    this.pvpGrenadeThrowQueued = false;
    this.pvpGrenadePinQueued = false;
    this.pvpMeleeQueued = false;
    this.pvpGrenadeCountPending = false;
    this.pvpGrenadePendingUntil = 0;

    this.bots = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.enableAll();
    this.killerCamera = null;
    this.killerCameraViewActive = false;

    this.mode = 'title';
    this.time = 0;
    this.fps = 60;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    this.respawnTimer = 0;
    this.killStreak = 0;
    this.streakScore = 0;
    this.multiKillTimer = 0;
    this.multiKillCount = 0;
    this.totalScore = 0;
    this.match = { blueTickets: MAX_TICKETS, redTickets: MAX_TICKETS, maxTickets: MAX_TICKETS, over: false, winner: null };

    /* ---- killstreak rewards ---- */
    this.uav = { charges: 0, time: 0, ping: 0 };
    this.uavDrones = new Map();
    this.pvpUavClockServerTime = 0;
    this.pvpUavClockReceivedAt = 0;
    this.strikeCharges = 0;
    this.missile = null;       // live missile entity
    // TV-guided missile: while this is set the player is flying the warhead
    // instead of their body, and the camera rides its nose.
    this.tvMissile = null;
    this.tvMissileCam = 0;     // 0..1 blend into the monochrome downlink
    this.pvpMissileBoostQueued = false;
    this.sentryCharges = 0;
    this.sentry = null;        // deployed sentry gun
    this.casCharges = 0;
    this.firebombCharges = 0;
    this.attackHelicopterCharges = 0;
    this.juggernautCharges = 0;
    this.railgunCharges = 0;
    this.railgunActive = false;
    this.railgunReturnWeapon = this.loadout.primary;
    this.airdrops = new Map();
    this.airdropInteraction = null;
    this.localAirdropSeq = 0;
    this.casTargeting = null;
    this.casRuns = new Map();
    this.firebombTargeting = null;
    this.firebombRuns = new Map();
    this.attackHelicopters = new Map();
    this.streakCall = null;
    this.pendingSelfOperatorVoices = [];
    this.pendingStreakVoices = [];
    this.dialogueSequence = 0;
    this.lastSelfOperatorVoice = new Map();
    this.teammateOperatorVoiceAt = new Map();
    this.streakWheel = createStreakWheelState();
    this.weaponReturnDelay = 0;
    this.pvpCasPending = false;
    this.pvpCasPendingUntil = 0;
    this.pvpFirebombPending = false;
    this.pvpFirebombPendingUntil = 0;
    this.pvpRailgunPending = false;
    // A charged ARC-7 shot is predicted locally for immediate recoil/audio.
    // Keep its aim/trigger intent alive until the authoritative shot event
    // arrives; otherwise the locally-started battery reload can release the
    // trigger one network tick before the server completes its own charge.
    this.pvpRailgunFireCommitUntil = 0;
    this.pvpShotAim = null;

    /* ---- online PVP ---- */
    this.gameType = 'pve';
    this.pvpRemotes = new Map();
    this.pvpSentries = new Map();
    this.pvpMissiles = new Map();
    this.pvpSnapshot = null;
    this.pvpStatus = 'offline';
    this.pvpRooms = [];
    this.pvpLatency = 0;
    this.pvpRoom = null;
    this.pvpInputSeq = 0;
    this.pvpSendAcc = 0;
    this.pvpPoseHistory = [];
    this.pvpJumpQueued = false;
    this.pvpJumpBuffer = 0;
    this.pvpSlideQueued = false;
    this.pvpReloadQueued = false;
    this.pvpReadyForActionActive = false;
    // Physics stays authoritative, but routine reconciliation is absorbed by
    // this render-only offset so the local first-person camera never snaps at
    // the 45 Hz snapshot cadence.
    this.pvpViewCorrection = new THREE.Vector3();
    this.pvpReloadCycles = new ReloadCycleGuard();
    this.pvpPredictedReload = null;
    this.pvpServerReloading = null;
    this.pvpActiveReloadCycle = null;
    this.pvpAmmoAuthority = new Map();
    this.pvpAmmoObserved = new Map();
    this.pvpAmmoPredictUntil = new Map();
    this.pvpLastHealth = this.player.health;
    this.pvpLastArmor = this.player.armor;
    this.pvpVoteKick = null;
    this.pvpVoteKickCooldown = 0;
    this.pvpVoteKickMenuOpenedAt = 0;
    this.pvpBanUntil = 0;
    this.pvpRegionCheckSeq = 0;
    this.pvpRegionCheckPending = false;
    this.pvpAuthPending = false;
    this.pvpOwnSentryId = null;
    this.pvpUavSweepSeq = 0;
    this.pvpUavRevealTime = 0;
    this.pvpUavMarks = [];
    this.enemyHudActor = null;
    this.enemyHudHeldTargets = new Map();
    this.enemyHudMode = null;
    this.enemyHudScanAt = 0;
    this.teammateHudStates = new Map();
    this.teammateHudMode = null;
    this.teammateHudScanAt = 0;
    this.pvpName = this.loadPvpName();
    this.pvp = new PvpClient({
      status: (status) => { this.pvpStatus = status; },
      rooms: (rooms) => { this.pvpRooms = rooms; },
      latency: (latency) => { this.pvpLatency = latency; },
      joined: (message) => this.enterPvpRoom(message),
      snapshot: (snapshot) => this.applyPvpSnapshot(snapshot),
      event: (message) => this.handlePvpEvent(message),
      disconnected: (details) => this.handlePvpDisconnect(details),
      authRequired: () => this.beginLinuxDoLogin(),
      error: (message) => {
        this.pvpStatus = 'error';
        if (this.mode === 'rooms') this.input.releaseLock();
        this.hud.notice(message);
      },
    });
    window.addEventListener('keydown', (event) => this.handleLoadoutKey(event), true);
    window.addEventListener('keydown', (event) => this.handlePvpChatKey(event), true);
    this.systemDialog?.addEventListener('mousedown', (event) => event.stopPropagation());
    this.systemDialog?.addEventListener('keydown', (event) => event.stopPropagation());
    this.systemDialogConfirm?.addEventListener('click', () => this.hideSystemDialog());

    // One-shot input latches: a click that confirms a fire mission or a
    // respawn must not carry through as a trigger pull or a jump. Each lock
    // holds until its button is released.
    this.fireLock = false;
    this.jumpLock = false;

    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._coneUp = new THREE.Vector3();
    this._coneRight = new THREE.Vector3();
    this._coneRealUp = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._ray = new THREE.Ray();

    this.spawnTeams();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.input.onLockChange = (locked) => {
      this.stage.classList.toggle('locked', locked);
      if (!locked && this.chatOpen) {
        this.sendPvpNeutralInput();
        return;
      }
      if (!locked && (this.mode === 'playing' || this.mode === 'dead')) {
        this.cancelCasTargeting(false);
        this.sendPvpNeutralInput();
        if (this.gameType === 'pvp') {
          // Chromium may report pointer-lock loss just before window.blur.
          // Defer one task so Alt-Tab is not mistaken for an intentional ESC.
          const unlockedMode = this.mode;
          setTimeout(() => {
            if (this.gameType !== 'pvp' || this.input.locked || this.mode !== unlockedMode) return;
            const focused = typeof document.hasFocus !== 'function' || document.hasFocus();
            if (shouldPauseOnUnlock(this.gameType, this.mode, focused)) this.mode = 'paused';
          }, 0);
        } else {
          this.mode = 'paused';
        }
      }
    };

    // menu clicks are handled straight from the DOM event so the browser still
    // counts them as a user gesture for pointer lock / audio
    this.input.onPress = (nx, ny, button) => {
      if (this.input.locked || button !== 0) return;
      this.audio.resume();
      const id = this.hud.pick(nx, ny);
      if (this.handleMenuClick(id)) return;
      if (this.mode === 'paused') this.deploy();
      else if (this.gameType === 'pvp' && this.mode === 'playing') {
        // Focus loss intentionally leaves PVP live without a menu. The first
        // click after returning simply captures the mouse again.
        this.deploy();
      }
    };

    this.world = {
      time: 0,
      findTarget: (b) => this.findTarget(b),
      botShoot: (b, spread) => this.botShoot(b, spread),
    };

    this.last = performance.now();
    requestAnimationFrame(this.loop);

    const boot = document.getElementById('boot');
    if (boot) {
      boot.classList.add('hidden');
      setTimeout(() => boot.remove(), 400);
    }
    const launchParams = new URLSearchParams(window.location.search);
    if (launchParams.get('pvp') === '1') {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('pvp');
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      setTimeout(() => this.openPvpRooms(), 0);
    }
  }

  /* ------------------------------------------------------------ set-up */

  hookWeapon() {
    const vm = this.viewModel;
    vm.onCameraKick = (vert, _horiz, punch) => {
      // Weapon recoil is deliberately vertical: the spring supplies readable
      // camera motion while aimKickUp changes the real PVE/PVP firing angle.
      // Preserve the reticle direction first. Otherwise the same predicted
      // shot reaches PVP authority with its pitch already kicked upward.
      if (this.gameType === 'pvp' && this.player.alive) {
        this.pvpShotAim = capturePvpShotAim(
          vm.def?.id,
          this.player.yaw,
          this.player.pitch,
          performance.now()
        );
      }
      this.player.applyRecoil(vert, 0, punch);
      this.player.applyAimKick(vm.def?.aimKickUp || 0);
    };
    vm.onShoot = (def, spread, pellets) => this.playerShoot(def, spread, pellets);
    vm.onEjectShell = (camSpacePos, weaponId) => {
      const world = this.vmToWorld(camSpacePos, new THREE.Vector3());
      const fwd = this._v1.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const right = this._v2.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = this._v3.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.effects.ejectShell(world, fwd, right, up, weaponId === 'shotgun' ? 'shotgun' : 'normal');
      this.audio.shell(world);
    };
    vm.onReloadStart = () => {
      // PVP waits for the authoritative start event so rejected predictions
      // never speak. PVE can announce the actual local ViewModel transition.
      if (this.gameType === 'pve' && this.player.alive) {
        this.playOperatorVoice({
          action: 'reload',
          actorId: 'player',
          speakerName: this.player.name,
          team: this.player.team,
        });
      }
    };
  }

  spawnTeams() {
    for (const b of this.bots) this.scene.remove(b.rig.root);
    this.bots.length = 0;
    const perTeam = Math.round(this.settings.botCount);
    for (let i = 0; i < perTeam; i++) {
      this.addBot('red', i);
      if (i < perTeam - 1) this.addBot('blue', i);
    }
    for (const b of this.bots) b.spawn(this.pickSpawn(b.team));
  }

  addBot(team, index) {
    const bot = new Bot({ team, level: this.level, textures: this.textures, index });
    bot.onBodyImpact = (b) => this.audio.bodyFall(b.position);
    bot.onReloadStart = (b) => {
      if (this.gameType !== 'pve' || !this.player.alive) return;
      this.playOperatorVoice({
        action: 'reload',
        actorId: `bot:${b.id}`,
        speakerName: b.name,
        team: b.team,
        position: b.position,
      });
    };
    this.scene.add(bot.rig.root);
    this.bots.push(bot);
    return bot;
  }

  pickSpawn(team) {
    const list = this.level.spawns[team].slice(0, 1);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 5; i++) {
      const p = list[randInt(0, list.length - 1)];
      let score = rand(0, 4);
      for (const a of this.actors()) {
        if (!a.alive) continue;
        const d = a.position.distanceTo(p);
        score += a.team === team ? Math.min(d, 14) * 0.15 : Math.min(d, 45) * 0.6;
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best.clone();
  }

  actors() {
    return [this.player, ...this.bots];
  }

  resize() {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    this.pipeline.applySettings();
    this.pipeline.resize(w, h);
    const rw = this.pipeline.width, rh = this.pipeline.height;
    this.hud.resize(rw, rh);
    this.camera.aspect = rw / rh;
    this.camera.updateProjectionMatrix();
    this.viewModel.resize(rw / rh);
    this.effects.setViewportScale(rh, this.camera.fov * Math.PI / 180);
  }

  /* -------------------------------------------------------------- combat */

  /** Cast a bullet through the world; returns the closest hit or null. */
  castBullet(origin, dir, maxDist, shooter) {
    this.raycaster.set(origin, dir);
    this.raycaster.near = 0;
    this.raycaster.far = maxDist;

    let best = null;
    const worldHits = this.raycaster.intersectObjects(this.level.solids, false);
    if (worldHits.length) {
      const h = worldHits[0];
      best = {
        distance: h.distance,
        point: h.point.clone(),
        normal: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate(),
        surface: h.object.userData.surface || 'concrete',
        actor: null,
      };
    }

    // bots
    for (const b of this.bots) {
      if (!b.alive || b === shooter) continue;
      if (b.position.distanceTo(origin) > maxDist + 2) continue;
      const hits = this.raycaster.intersectObjects(b.rig.hitboxes, false);
      if (!hits.length) continue;
      const h = hits[0];
      if (best && h.distance >= best.distance) continue;
      best = {
        distance: h.distance,
        point: h.point.clone(),
        normal: dir.clone().negate(),
        surface: 'flesh',
        actor: b,
        part: h.object.userData.hitPart,
        mult: h.object.userData.hitMult,
      };
    }

    // the deployed sentry is fair game for enemy fire
    if (this.sentry && this.sentry.alive && shooter !== this.sentry
      && shooter.team !== this.sentry.team) {
      const hits = this.raycaster.intersectObjects(this.sentry.hitboxes, false);
      if (hits.length && (!best || hits[0].distance < best.distance)) {
        best = {
          distance: hits[0].distance, point: hits[0].point.clone(),
          normal: dir.clone().negate(), surface: 'metal',
          actor: this.sentry, part: 'chest', mult: 1,
        };
      }
    }

    // UAVs are ordinary metal geometry for bullets but never actors for HUD
    // vitals. Friendly rounds may strike the airframe without reducing its HP.
    for (const drone of this.uavDrones.values()) {
      if (!drone.alive || !drone.view) continue;
      const hits = this.raycaster.intersectObjects(drone.view.hitboxes, false);
      if (!hits.length || (best && hits[0].distance >= best.distance)) continue;
      const h = hits[0];
      best = {
        distance: h.distance,
        point: h.point.clone(),
        normal: dir.clone().negate(),
        surface: 'metal',
        actor: drone.view,
        uav: drone,
        part: 'airframe',
        mult: 1,
      };
    }

    for (const heli of this.attackHelicopters.values()) {
      if (!heli.alive || !heli.root.visible) continue;
      const hitboxes = heli.root.userData.hitboxes || [];
      const hits = this.raycaster.intersectObjects(hitboxes, false);
      if (!hits.length || (best && hits[0].distance >= best.distance)) continue;
      const h = hits[0];
      best = {
        distance: h.distance,
        point: h.point.clone(),
        normal: dir.clone().negate(),
        surface: 'metal',
        actor: heli,
        attackHelicopter: heli,
        part: 'airframe',
        mult: 1,
      };
    }

    // The local player has no rendered mesh, so use the same stance-aware
    // volumes as the PVP authority and remote rigs.
    if (shooter !== this.player && this.playerTargetable()) {
      const hit = rayCharacterHitboxes(this.player, origin, dir, maxDist);
      if (hit && (!best || hit.distance < best.distance)) {
        best = {
          distance: hit.distance,
          point: hit.point,
          normal: hit.normal,
          surface: 'flesh',
          actor: this.player,
          part: hit.part,
          mult: hit.mult,
        };
      }
    }
    return best;
  }

  /** Every hostile intersected by the ARC-7 beam, deliberately ignoring all
   * level solids. One target contributes at most one hit even when several
   * body hitboxes overlap the ray. */
  castLaserCannonHits(origin, dir, maxDist, shooter = this.player) {
    this.raycaster.set(origin, dir);
    this.raycaster.near = 0;
    this.raycaster.far = maxDist;
    const hits = [];
    for (const actor of this.bots) {
      if (!actor.alive || actor === shooter || actor.team === shooter.team) continue;
      const intersections = this.raycaster.intersectObjects(actor.rig.hitboxes, false);
      if (!intersections.length) continue;
      const hit = intersections[0];
      hits.push({
        distance: hit.distance,
        point: hit.point.clone(),
        normal: dir.clone().negate(),
        surface: 'flesh',
        actor,
        part: hit.object.userData.hitPart,
        mult: hit.object.userData.hitMult,
      });
    }
    if (this.sentry?.alive && this.sentry.team !== shooter.team) {
      const intersections = this.raycaster.intersectObjects(this.sentry.hitboxes, false);
      if (intersections.length) {
        const hit = intersections[0];
        hits.push({
          distance: hit.distance,
          point: hit.point.clone(),
          normal: dir.clone().negate(),
          surface: 'metal',
          actor: this.sentry,
          part: 'chest',
          mult: 1,
        });
      }
    }
    for (const drone of this.uavDrones.values()) {
      if (!drone.alive || !drone.view || drone.team === shooter.team) continue;
      const intersections = this.raycaster.intersectObjects(drone.view.hitboxes, false);
      if (!intersections.length) continue;
      const hit = intersections[0];
      hits.push({
        distance: hit.distance,
        point: hit.point.clone(),
        normal: dir.clone().negate(),
        surface: 'metal',
        actor: drone.view,
        uav: drone,
        part: 'airframe',
        mult: 1,
      });
    }
    for (const heli of this.attackHelicopters.values()) {
      if (!heli.alive || !heli.root.visible || heli.team === shooter.team) continue;
      const intersections = this.raycaster.intersectObjects(
        heli.root.userData.hitboxes || [],
        false
      );
      if (!intersections.length) continue;
      const hit = intersections[0];
      hits.push({
        distance: hit.distance,
        point: hit.point.clone(),
        normal: dir.clone().negate(),
        surface: 'metal',
        actor: heli,
        attackHelicopter: heli,
        part: 'airframe',
        mult: 1,
      });
    }
    return hits.sort((a, b) => a.distance - b.distance);
  }

  coneDir(dir, spread, out) {
    out.copy(dir);
    if (spread <= 0) return out;
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * spread;
    // build a basis around the aim direction
    const up = Math.abs(dir.y) > 0.95 ? this._coneUp.set(1, 0, 0) : this._coneUp.set(0, 1, 0);
    const right = this._coneRight.crossVectors(dir, up).normalize();
    const realUp = this._coneRealUp.crossVectors(right, dir).normalize();
    out.addScaledVector(right, Math.cos(a) * r).addScaledVector(realUp, Math.sin(a) * r).normalize();
    return out;
  }

  playerShoot(def, spread, pellets) {
    if (def.melee) {
      this.playerKnifeAttack(def);
      return;
    }
    if (this.gameType === 'pvp') {
      this.pvpLocalShoot(def, spread, pellets);
      return;
    }
    // Fire exactly along the reticle: the camera's true forward includes the
    // bob, punch and recoil terms that player.aimDirection() leaves out, and
    // the reticle *is* the centre of the camera.
    const origin = this.camera.position.clone();
    const aim = this.camera.getWorldDirection(new THREE.Vector3());
    // tracer starts at the muzzle so it reads as coming from the gun
    const muzzleWorld = this.muzzleWorld();
    let anyHit = false;
    let anyHead = false;
    let anyArmorBreak = false;
    let killed = 0;

    for (let i = 0; i < pellets; i++) {
      const dir = this.coneDir(aim, spread, new THREE.Vector3());
      const maxDistance = def.range * 2.2;
      const hits = def.piercesWorld
        ? this.castLaserCannonHits(origin, dir, maxDistance, this.player)
        : [this.castBullet(origin, dir, maxDistance, this.player)].filter(Boolean);
      const end = def.piercesWorld
        ? origin.clone().addScaledVector(dir, maxDistance)
        : hits[0]?.point || origin.clone().addScaledVector(dir, def.range * 1.6);
      if (i === 0 || pellets <= 3 || Math.random() < 0.45) {
        if (def.id === 'railgun') {
          this.effects.laserCannonBeam(muzzleWorld, end);
        } else {
          this.effects.tracer(muzzleWorld, end, def.id === 'sniper' ? 0xfff0c0 : 0xffd98a, def.id === 'sniper' ? 1.6 : 1);
        }
      }
      for (const hit of hits) {
        if (hit.attackHelicopter) {
          this.effects.impact(hit.point, hit.normal, 'metal', def.id === 'shotgun' ? 0.6 : 1);
          this.audio.impact('metal', hit.point);
          if (hit.attackHelicopter.team !== this.player.team) {
            const res = this.damageLocalAttackHelicopter(
              hit.attackHelicopter,
              hit,
              def
            );
            anyHit ||= res.damage > 0;
            if (res.killed) killed++;
          }
        } else if (hit.uav) {
          this.effects.impact(hit.point, hit.normal, 'metal', def.id === 'shotgun' ? 0.6 : 1);
          this.audio.impact('metal', hit.point);
          if (hit.uav.team !== this.player.team) {
            const res = this.damageLocalUavDrone(hit.uav, hit, def);
            anyHit ||= res.damage > 0;
            if (res.killed) killed++;
          }
        } else if (hit.actor) {
          const res = this.damageActor(this.player, hit, def, dir);
          anyHit = true;
          if (hit.part === 'head') anyHead = true;
          if (res.armorBroke) anyArmorBreak = true;
          if (res.killed) killed++;
        } else {
          this.effects.impact(hit.point, hit.normal, hit.surface, def.id === 'shotgun' ? 0.6 : 1);
          this.audio.impact(hit.surface, hit.point);
        }
      }
    }

    this.effects.muzzleSmoke(muzzleWorld, aim);
    if (anyHit) {
      this.hud.hit(killed > 0 ? (anyHead ? 'killHead' : 'kill') : anyHead ? 'head' : 'hit');
      // onActorKilled emits the kill cue. For survivors, an armor break takes
      // priority over the normal hit cue so the three samples never stack.
      if (killed === 0) {
        if (anyArmorBreak) this.audio.armorCrack();
        else this.audio.hitmarker(anyHead);
      }
    }
  }

  /**
   * A knife swing is a short body-sized sweep, not a zero-width bullet. PVP
   * sends only the one-shot attack request; target choice and damage remain
   * entirely authoritative on the server.
   */
  playerKnifeAttack(def) {
    if (this.gameType === 'pvp') {
      this.pvpMeleeQueued = true;
      return;
    }

    const origin = this.camera.position.clone();
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const candidates = [];
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      candidates.push({
        actor: bot,
        point: combatKnifeTargetPoint(bot, new THREE.Vector3()),
        radius: 0.43,
        surface: 'flesh',
      });
    }
    if (this.sentry?.alive && this.sentry.team !== this.player.team) {
      candidates.push({
        actor: this.sentry,
        point: this.sentry.position.clone().add(new THREE.Vector3(0, 0.92, 0)),
        radius: 0.50,
        surface: 'metal',
      });
    }

    const target = chooseCombatKnifeTarget(
      origin,
      forward,
      candidates,
      (from, point, distance) => {
        const direction = point.clone().sub(from).normalize();
        this.raycaster.set(from, direction);
        this.raycaster.near = 0;
        this.raycaster.far = distance;
        const worldHit = this.raycaster.intersectObjects(this.level.solids, false)[0];
        return Boolean(worldHit && worldHit.distance < distance - 0.10);
      }
    );
    if (!target) return;

    const direction = target.point.clone().sub(origin).normalize();
    const result = this.damageActor(this.player, {
      distance: target.distance,
      point: target.point.clone(),
      normal: direction.clone().negate(),
      surface: target.surface,
      actor: target.actor,
      part: 'chest',
      mult: 1,
    }, def, direction);
    this.hud.hit(result.killed ? 'kill' : 'hit');
    if (!result.killed) {
      if (result.armorBroke) this.audio.armorCrack();
      else this.audio.hitmarker(false);
    }
  }

  /** Immediate local-only PVP weapon feedback; the server owns every hit. */
  pvpLocalShoot(def, spread, pellets) {
    if (def.id === LASER_CANNON_ID && this.railgunActive) {
      // This does not grant a shot: the authority still validates ADS,
      // continuous charge time, ammunition and player state. It only preserves
      // the completed local trigger intent across client-side prediction.
      this.pvpRailgunFireCommitUntil = performance.now() + 2500;
    }
    const origin = this.camera.position.clone();
    const aim = this.camera.getWorldDirection(new THREE.Vector3());
    const muzzleWorld = this.muzzleWorld();
    let localHit = null;
    for (let i = 0; i < pellets; i++) {
      const dir = this.coneDir(aim, spread, new THREE.Vector3());
      const maxDistance = def.range * 2.2;
      const hit = def.piercesWorld
        ? null
        : this.castPvpVisual(origin, dir, maxDistance);
      if (i === 0) localHit = hit;
      const end = def.piercesWorld
        ? origin.clone().addScaledVector(dir, maxDistance)
        : hit?.point || origin.clone().addScaledVector(dir, def.range * 1.6);
      if (i === 0 || pellets <= 3 || Math.random() < 0.45) {
        if (def.id === LASER_CANNON_ID) {
          this.effects.laserCannonBeam(muzzleWorld, end);
        } else {
          this.effects.tracer(
            muzzleWorld,
            end,
            def.id === 'sniper' ? 0xfff0c0 : 0xffd98a,
            def.id === 'sniper' ? 1.6 : 1
          );
        }
      }
      if (hit && !hit.actor) {
        this.effects.impact(hit.point, hit.normal, hit.surface, def.id === 'shotgun' ? 0.6 : 1);
        this.audio.impact(hit.surface, hit.point);
      }
    }
    if (SHOT_DEBUG) {
      const h = localHit;
      const target = h
        ? (h.actor ? (h.actor.id || 'actor') : (h.uav ? 'uav' : h.attackHelicopter ? 'heli' : h.surface || 'world'))
        : 'miss';
      localShotLog('local', `weapon=${def.id} spread=${spread.toFixed(4)} pellets=${pellets} hit=${target} dist=${h ? h.distance.toFixed(2) : '-'} part=${h?.part || '-'} aim=(${aim.x.toFixed(3)},${aim.y.toFixed(3)},${aim.z.toFixed(3)})`);
    }
    this.effects.muzzleSmoke(muzzleWorld, aim);
  }

  castPvpVisual(origin, dir, maxDist) {
    this.raycaster.set(origin, dir);
    this.raycaster.near = 0;
    this.raycaster.far = maxDist;
    let best = null;
    const worldHits = this.raycaster.intersectObjects(this.level.solids, false);
    if (worldHits.length) {
      const h = worldHits[0];
      best = {
        distance: h.distance,
        point: h.point.clone(),
        normal: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate(),
        surface: h.object.userData.surface || 'concrete',
        actor: null,
      };
    }
    for (const remote of this.pvpRemotes.values()) {
      if (!remote.alive) continue;
      const h = rayCharacterHitboxes({
        position: remote.position,
        yaw: remote.yaw,
        crouchBlend: remote.rig.crouchBlend,
        slideBlend: remote.rig.slideBlend,
        speed2D: Math.hypot(remote.velocity.x, remote.velocity.z),
        sprinting: remote.state?.sprinting,
        juggernaut: remote.juggernaut,
      }, origin, dir, maxDist);
      if (!h || (best && h.distance >= best.distance)) continue;
      best = {
        distance: h.distance,
        point: h.point.clone(),
        normal: h.normal,
        surface: 'flesh',
        actor: remote,
        part: h.part,
      };
    }
    for (const sentry of this.pvpSentries.values()) {
      if (sentry.team === this.player.team) continue;
      const hits = this.raycaster.intersectObjects(sentry.hitboxes, false);
      if (!hits.length || (best && hits[0].distance >= best.distance)) continue;
      const h = hits[0];
      best = {
        distance: h.distance,
        point: h.point.clone(),
        normal: dir.clone().negate(),
        surface: 'metal',
        actor: sentry,
        part: 'chest',
      };
    }
    for (const drone of this.uavDrones.values()) {
      if (!drone.alive || !drone.view) continue;
      const hits = this.raycaster.intersectObjects(drone.view.hitboxes, false);
      if (!hits.length || (best && hits[0].distance >= best.distance)) continue;
      const h = hits[0];
      best = {
        distance: h.distance,
        point: h.point.clone(),
        normal: dir.clone().negate(),
        surface: 'metal',
        actor: drone.view,
        uav: drone,
        part: 'airframe',
      };
    }
    for (const heli of this.attackHelicopters.values()) {
      if (!heli.alive || !heli.root.visible) continue;
      const hits = this.raycaster.intersectObjects(
        heli.root.userData.hitboxes || [],
        false
      );
      if (!hits.length || (best && hits[0].distance >= best.distance)) continue;
      const h = hits[0];
      best = {
        distance: h.distance,
        point: h.point.clone(),
        normal: dir.clone().negate(),
        surface: 'metal',
        actor: heli,
        attackHelicopter: heli,
        part: 'airframe',
      };
    }
    return best;
  }

  /**
   * Map a point from viewmodel-scene space to the main-scene world point that
   * lands on the same screen pixel. The two scenes render through different
   * cameras (the viewmodel FOV is fixed while the world FOV follows settings
   * and ADS), so a raw localToWorld puts tracers and shells visibly off the
   * gun. Going through both projections keeps them glued to it.
   */
  vmToWorld(p, out = new THREE.Vector3()) {
    const dist = p.length() / this.viewModel.holder.scale.x;
    out.copy(p).project(this.viewModel.camera).unproject(this.camera);
    return out.sub(this.camera.position).normalize().multiplyScalar(dist).add(this.camera.position);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    const vm = this.viewModel;
    if (!vm.anchors || !vm.model) return this.player.eyePosition(out);
    out.copy(vm.anchors.muzzle);
    vm.model.updateMatrixWorld(true);
    vm.model.localToWorld(out);       // -> viewmodel scene (its camera's space)
    return this.vmToWorld(out, out);
  }

  botShoot(bot, spread) {
    const def = bot.def;
    const origin = bot.muzzlePosition(new THREE.Vector3());
    const eye = bot.eyePosition(new THREE.Vector3());
    const target = bot.target;
    if (!target) return;
    const aim = this._dir.copy(target.position);
    aim.y += target.isSentry ? 0.8 : 1.35;
    aim.sub(eye).normalize();

    this.audio.shot(def.sound, origin);
    const pellets = def.pellets;
    for (let i = 0; i < pellets; i++) {
      const dir = this.coneDir(aim, spread, new THREE.Vector3());
      const hit = this.castBullet(eye, dir, def.range * 2, bot);
      const end = hit ? hit.point : eye.clone().addScaledVector(dir, def.range);
      if (i === 0) this.effects.tracer(origin, end, 0xffb35a, 1);
      this.whizzCheck(eye, dir, hit ? hit.distance : def.range);
      if (!hit) continue;
      if (hit.attackHelicopter) {
        this.effects.impact(hit.point, hit.normal, 'metal', 0.7);
        this.audio.impact('metal', hit.point);
        if (hit.attackHelicopter.team !== bot.team) {
          this.damageLocalAttackHelicopter(
            hit.attackHelicopter,
            hit,
            def,
            BOT_DAMAGE,
            bot.team
          );
        }
      } else if (hit.uav) {
        this.effects.impact(hit.point, hit.normal, 'metal', 0.7);
        this.audio.impact('metal', hit.point);
        if (hit.uav.team !== bot.team) {
          this.damageLocalUavDrone(hit.uav, hit, def, BOT_DAMAGE, bot.team);
        }
      } else if (hit.actor) this.damageActor(bot, hit, def, dir);
      else {
        this.effects.impact(hit.point, hit.normal, hit.surface, 0.7);
        this.audio.impact(hit.surface, hit.point);
      }
    }
  }

  /** Plays a supersonic crack if the round passes close to the player. */
  whizzCheck(origin, dir, dist) {
    if (!this.player.alive) return;
    const eye = this.player.eyePosition(this._v1);
    const to = this._v2.subVectors(eye, origin);
    const along = clamp(to.dot(dir), 0, dist);
    if (along < 1.5) return;
    const closest = this._v3.copy(origin).addScaledVector(dir, along);
    const d = closest.distanceTo(eye);
    if (d < 2.6 && Math.random() < 0.6) this.audio.whizz(closest);
  }

  /* --------------------------------------------------------- sentry gun */


  placeSentry() {
    if (this.sentry) this.destroySentry(false);
    const p = this.player;
    const fwd = p.forwardFlat(new THREE.Vector3());
    const pos = new THREE.Vector3().copy(p.position).addScaledVector(fwd, 1.5);
    const B = this.level.bounds;
    pos.x = clamp(pos.x, -B.x, B.x);
    pos.z = clamp(pos.z, -B.z, B.z);
    // drop it onto whatever surface is under the player's feet
    this.raycaster.set(this._v1.set(pos.x, p.position.y + 1.6, pos.z), this._v2.set(0, -1, 0));
    this.raycaster.near = 0;
    this.raycaster.far = 30;
    const hits = this.raycaster.intersectObjects(this.level.solids, false);
    pos.y = hits.length ? hits[0].point.y : p.position.y;

    const model = buildSentryModel();
    model.position.copy(pos);
    this.scene.add(model);
    const laser = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.012, 1),
      new THREE.MeshBasicMaterial({
        color: 0xff2525, transparent: true, opacity: 0.55,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    const laserDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3030 })
    );
    laser.frustumCulled = false;
    laserDot.frustumCulled = false;
    this.scene.add(laser, laserDot);
    model.updateMatrixWorld(true);
    const sentryMuzzles = [
      model.getObjectByName('sentry-muzzle'),
      model.getObjectByName('sentry-muzzle-secondary'),
    ].filter(Boolean);
    const game = this;
    this.sentry = {
      isSentry: true, name: 'SENTRY', team: p.team,
      position: pos, velocity: new THREE.Vector3(),
      alive: true, health: SENTRY_CONFIG.health, maxHealth: SENTRY_CONFIG.health,
      age: 0,
      yaw: p.yaw, pitch: -0.04, fireTimer: 0, scanTimer: 0, target: null,
      model, head: model.getObjectByName('sentry-head'),
      pitchGroup: model.getObjectByName('sentry-pitch'),
      muzzle: sentryMuzzles[0],
      muzzles: sentryMuzzles,
      barrelIndex: 0,
      laserOrigin: model.getObjectByName('sentry-laser-origin'),
      ejectionPort: model.getObjectByName('sentry-ejection-port'),
      laser, laserDot,
      hitboxes: model.userData.hitboxes,
      hit(amount) {
        if (!this.alive) return false;
        this.health -= amount;
        if (this.health <= 0) { this.health = 0; game.destroySentry(true); return true; }
        return false;
      },
    };
    this.hud.banner('SENTRY DEPLOYED', '', 1.6, '#8ecbff');
    this.audio.sentryDeploy();
    this.playOperatorVoice({
      action: 'sentry',
      actorId: 'player',
      speakerName: this.player.name,
      team: this.player.team,
    });
  }

  destroySentry(explode, reason = 'destroyed') {
    const s = this.sentry;
    if (!s) return;
    s.alive = false;
    this.scene.remove(s.model);
    this.scene.remove(s.laser, s.laserDot);
    const materials = new Set();
    s.model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) materials.add(mat);
      }
    });
    for (const mat of materials) mat.dispose();
    s.laser.geometry.dispose();
    s.laser.material.dispose();
    s.laserDot.geometry.dispose();
    s.laserDot.material.dispose();
    this.sentry = null;
    if (explode) {
      this.effects.explosion(s.position, 0.5);
      this.audio.sentryDown(s.position);
      this.hud.notice(reason === 'timeout' ? 'SENTRY SELF-DESTRUCT' : 'SENTRY DESTROYED');
    }
  }

  updateSentry(dt) {
    const s = this.sentry;
    if (!s || !s.alive) return;
    s.age += dt;
    if (s.age >= SENTRY_CONFIG.lifetimeSeconds) {
      this.destroySentry(true, 'timeout');
      return;
    }
    s.scanTimer -= dt;
    if (s.scanTimer <= 0) {
      s.scanTimer = 0.25;
      let best = null;
      let bestD = SENTRY_CONFIG.range;
      const eye = s.muzzle
        ? s.muzzle.getWorldPosition(this._v1)
        : this._v1.set(s.position.x, s.position.y + 1.4, s.position.z);
      for (const b of this.bots) {
        if (!b.alive || b.team === s.team) continue;
        const d = b.position.distanceTo(s.position);
        if (d > bestD) continue;
        const tgt = this._v2.set(b.position.x, b.position.y + 1.2, b.position.z);
        if (!this.hasLineOfSight(eye, tgt)) continue;
        best = b;
        bestD = d;
      }
      s.target = best;
    }
    if (s.target && s.target.alive) {
      const tx = s.target.position.x;
      const ty = s.target.position.y + 1.2;
      const tz = s.target.position.z;
      const want = Math.atan2(-(tx - s.position.x), -(tz - s.position.z));
      s.yaw = angleDamp(s.yaw, want, 10, dt);
      if (s.head) s.head.rotation.y = s.yaw;
      const pivot = s.pitchGroup
        ? s.pitchGroup.getWorldPosition(new THREE.Vector3())
        : new THREE.Vector3(s.position.x, s.position.y + 1.4, s.position.z);
      const horizontal = Math.hypot(tx - pivot.x, tz - pivot.z);
      const wantPitch = clamp(
        Math.atan2(ty - pivot.y, Math.max(horizontal, 0.01)),
        SENTRY_CONFIG.pitchMin, SENTRY_CONFIG.pitchMax
      );
      s.pitch = damp(s.pitch, wantPitch, 12, dt);
      if (s.pitchGroup) s.pitchGroup.rotation.x = s.pitch;
      s.fireTimer -= dt;
      if (Math.abs(angleDelta(s.yaw, want)) < 0.12
        && Math.abs(s.pitch - wantPitch) < 0.06
        && s.fireTimer <= 0) {
        s.fireTimer = 60 / WEAPON_DEFS.rifle.rpm;
        this.sentryShoot(s);
      }
    } else {
      s.yaw += dt * 0.5;         // idle sweep
      s.pitch = damp(s.pitch, -0.04, 5, dt);
      s.fireTimer = Math.max(s.fireTimer - dt, 0.06);
    }
    if (s.head) s.head.rotation.y = s.yaw;
    if (s.pitchGroup) s.pitchGroup.rotation.x = s.pitch;
    this.updateSentryLaser(s);
  }

  updateSentryLaser(s) {
    if (!s.laser || !s.laserOrigin) return;
    const origin = s.laserOrigin.getWorldPosition(new THREE.Vector3());
    const q = s.muzzle
      ? s.muzzle.getWorldQuaternion(new THREE.Quaternion())
      : s.pitchGroup.getWorldQuaternion(new THREE.Quaternion());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
    this.raycaster.set(origin, dir);
    this.raycaster.near = 0.02;
    this.raycaster.far = SENTRY_CONFIG.range;
    const worldHit = this.raycaster.intersectObjects(this.level.solids, false)[0];
    let distance = worldHit ? worldHit.distance : SENTRY_CONFIG.range;
    if (s.target && s.target.alive) {
      const actorHit = this.raycaster.intersectObjects(s.target.rig.hitboxes, false)[0];
      if (actorHit && actorHit.distance < distance) distance = actorHit.distance;
    }
    const end = origin.clone().addScaledVector(dir, distance);
    s.laser.position.copy(origin).add(end).multiplyScalar(0.5);
    s.laser.lookAt(end);
    s.laser.scale.set(1, 1, distance);
    s.laser.material.opacity = s.target ? 0.62 : 0.24;
    s.laserDot.position.copy(end);
    s.laserDot.visible = Boolean(worldHit || s.target);
  }

  sentryShoot(s) {
    const t = s.target;
    if (!t || !t.alive) return;
    // Use the model's true muzzle transform. Fresh vectors are intentional:
    // coneDir owns separate scratch space, so spread can never corrupt the
    // tracer origin and pull a line in from the world origin.
    const muzzleNode = s.muzzles?.length
      ? s.muzzles[s.barrelIndex++ % s.muzzles.length]
      : s.muzzle;
    const muzzle = muzzleNode
      ? muzzleNode.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(s.position.x, s.position.y + 1.4, s.position.z);
    const aim = muzzleNode
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(
        muzzleNode.getWorldQuaternion(new THREE.Quaternion())
      ).normalize()
      : new THREE.Vector3(t.position.x, t.position.y + 1.2, t.position.z)
        .sub(muzzle).normalize();
    const dir = this.coneDir(aim, SENTRY_CONFIG.spread, new THREE.Vector3());
    this.audio.sentryShot(muzzle);
    if (s.ejectionPort) {
      const ejectionAt = s.ejectionPort.getWorldPosition(new THREE.Vector3());
      const ejectionQ = s.ejectionPort.getWorldQuaternion(new THREE.Quaternion());
      const ejectionOut = new THREE.Vector3(-1, 0, 0).applyQuaternion(ejectionQ);
      const ejectionUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ejectionQ);
      this.effects.ejectShell(ejectionAt, aim, ejectionOut, ejectionUp, 'sentry');
    }
    const hit = this.castBullet(muzzle, dir, SENTRY_WEAPON.range, s);
    const end = hit ? hit.point : muzzle.clone().addScaledVector(dir, SENTRY_WEAPON.range);
    this.effects.tracer(
      muzzle.clone().addScaledVector(dir, 0.18),
      end,
      SENTRY_CONFIG.tracerColor,
      1
    );
    if (hit && !hit.actor) {
      this.effects.impact(hit.point, hit.normal, hit.surface, 0.6);
      this.audio.impact(hit.surface, hit.point);
    } else if (hit && hit.actor) {
      const result = this.damageActor(s, hit, SENTRY_WEAPON, dir);
      if (result.armorBroke && !result.killed) this.audio.armorCrack();
    }
  }

  /* ------------------------------------------------------------- grenades */

  playOperatorVoice({
    action,
    actorId = 'player',
    speakerName = '',
    team = this.player.team,
    position = null,
    seed = randomOperatorVoiceSeed(),
    chanceRoll = Math.random(),
    teamWide = false,
  } = {}) {
    const localId = this.gameType === 'pvp' ? this.pvp.playerId : 'player';
    const self = actorId === localId;
    if (!self && team !== this.player.team) return false;
    const audience = self ? 'self' : 'teammate';
    if (!operatorVoiceShouldTrigger(audience, chanceRoll)) return false;
    if (!self && !teamWide) {
      const lastAt = this.teammateOperatorVoiceAt.get(actorId);
      if (!teammateOperatorVoiceReady(lastAt, this.time)) return false;
    }

    let source = null;
    let gain = 1;
    if (!self && !teamWide) {
      if (position?.isVector3) source = position;
      else if (Array.isArray(position) && position.length >= 3) {
        source = new THREE.Vector3(
          Number(position[0]) || 0,
          Number(position[1]) || 0,
          Number(position[2]) || 0
        );
      } else {
        source = this.pvpRemotes.get(actorId)?.position || null;
      }
      if (!source) return false;
      gain = operatorVoiceGain(this.player.position.distanceTo(source));
      if (gain <= 0) return false;
    }

    const line = operatorVoiceLine(
      action,
      audience,
      seed,
      self ? this.lastSelfOperatorVoice.get(action) : null
    );
    if (!line) return false;
    const lineGain = action === 'sentry' ? 1.35 : 1;
    if (self) {
      // Commit the chosen variant as soon as it enters the FIFO. That keeps
      // adjacent actions different even if several are queued behind a radio
      // message before any of them actually starts playing.
      this.lastSelfOperatorVoice.set(action, line.sample);
      this.pendingSelfOperatorVoices.push({
        line,
        speakerName: this.player.name,
        gain: lineGain,
        at: this.time,
        sequence: ++this.dialogueSequence,
      });
      this.updatePendingDialogueVoices();
      return true;
    }

    const played = this.audio.operatorVoice(line.sample, {
      pos: source,
      gain: gain * lineGain,
    });
    if (!played) return false;
    this.teammateOperatorVoiceAt.set(actorId, this.time);
    this.hud.pushOperatorSubtitle({
      self: false,
      speakerName: speakerName || this.pvpRemotes.get(actorId)?.name || actorId,
      captions: line.captions,
    });
    return true;
  }

  tryPlaySelfOperatorVoice(pending) {
    const line = pending?.line;
    if (!line || !this.audio.operatorVoice(line.sample, {
      pos: null,
      gain: pending.gain || 1,
    })) return false;
    this.hud.pushOperatorSubtitle({
      self: true,
      speakerName: pending.speakerName || this.player.name,
      captions: line.captions,
    });
    return true;
  }

  tryPlayStreakVoice(cue, seed = randomStreakVoiceSeed()) {
    const line = streakVoiceLineFor(cue, seed);
    if (!line || !this.audio.streakVoice(line.sample)) return false;
    this.hud.pushOperatorSubtitle({
      speakerNames: line.speaker,
      speakerColor: '#ffcc66',
      captions: line.captions,
      duration: Math.max(3.1, line.duration + 0.45),
    });
    return true;
  }

  /**
   * Radio traffic and the local operator share one chronological FIFO. Neither
   * category can overlap or discard another line while the dialogue channel is
   * busy. Nearby teammate callouts remain opportunistic and independently
   * rate-limited.
   */
  playStreakVoice(cue, seed = randomStreakVoiceSeed()) {
    return this.scheduleStreakVoice(cue, 0, seed);
  }

  scheduleStreakVoice(cue, delay = 0, seed = randomStreakVoiceSeed()) {
    if (!streakVoiceLineFor(cue, seed)) return false;
    this.pendingStreakVoices.push({
      cue,
      seed,
      at: this.time + Math.max(0, Number(delay) || 0),
      sequence: ++this.dialogueSequence,
    });
    return true;
  }

  updatePendingDialogueVoices() {
    let next = null;
    const consider = (kind, queue) => {
      for (let index = 0; index < queue.length; index++) {
        const pending = queue[index];
        if (pending.at > this.time) continue;
        if (!next
          || pending.at < next.pending.at
          || (pending.at === next.pending.at
            && pending.sequence < next.pending.sequence)) {
          next = { kind, queue, index, pending };
        }
      }
    };
    consider('operator', this.pendingSelfOperatorVoices);
    consider('streak', this.pendingStreakVoices);
    if (!next) return false;
    const played = next.kind === 'operator'
      ? this.tryPlaySelfOperatorVoice(next.pending)
      : this.tryPlayStreakVoice(next.pending.cue, next.pending.seed);
    if (!played) return false;
    next.queue.splice(next.index, 1);
    return true;
  }

  resetDialogueState() {
    this.pendingSelfOperatorVoices.length = 0;
    this.pendingStreakVoices.length = 0;
    this.dialogueSequence = 0;
    this.lastSelfOperatorVoice.clear();
    this.teammateOperatorVoiceAt.clear();
    this.audio.stopDialogue();
    this.audio.stopJuggernautBreathing();
    this.hud.clearStreakReady();
  }

  resetGrenadeLoadout() {
    this.grenadesRemaining = GRENADES_PER_LIFE;
    this.grenadeSelected = false;
    this.grenadePinAt = 0;
    this.grenadeThrowAiming = false;
    this.grenadeImpactThrowHeld = false;
    this.pvpGrenadeThrowQueued = false;
    this.pvpGrenadePinQueued = false;
    this.pvpGrenadeCountPending = false;
    this.pvpGrenadePendingUntil = 0;
    this.grenadeView.setKind(this.loadout.grenade);
    this.grenadeView.reset();
    this.grenadeTrajectory.hide();
  }

  clearGrenadeProjectiles() {
    for (const grenade of this.grenadeProjectiles.values()) {
      this.scene.remove(grenade.model);
      grenade.model.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.grenadeProjectiles.clear();
    this.clearIncendiaryZones();
  }

  clearIncendiaryZones() {
    for (const id of [...this.incendiaryZones.keys()]) {
      this.removeIncendiaryZone(id);
    }
    this.firebombFields.clear();
  }

  toggleGrenade() {
    if (!this.player.alive || this.player.juggernaut
      || this.railgunActive
      || this.tvMissile || this.grenadePinAt > 0) return;
    if (!this.grenadeSelected && this.grenadesRemaining <= 0) {
      this.hud.notice('NO GRENADES');
      return;
    }
    this.grenadeSelected = !this.grenadeSelected;
    this.grenadeThrowAiming = false;
    this.grenadeImpactThrowHeld = false;
    if (this.grenadeSelected) {
      this.grenadeView.setKind(this.loadout.grenade);
      this.viewModel.cancelReload();
      this.audio.uiClick();
    }
    this.grenadeView.setSelected(this.grenadeSelected);
  }

  stowGrenade() {
    if (this.grenadePinAt > 0) return false;
    this.grenadeSelected = false;
    this.grenadeThrowAiming = false;
    this.grenadeImpactThrowHeld = false;
    this.grenadeView.setSelected(false);
    this.grenadeTrajectory.hide();
    return true;
  }

  beginGrenadePin({ animate = true, signalServer = true } = {}) {
    if (!this.grenadeSelected || this.grenadePinAt > 0 || this.grenadesRemaining <= 0) return false;
    this.grenadePinAt = this.time;
    this.grenadesRemaining--;
    this.pvpGrenadeCountPending = this.gameType === 'pvp';
    this.pvpGrenadePendingUntil = this.gameType === 'pvp'
      ? this.time + PVP_GRENADE_ACK_TIMEOUT
      : 0;
    this.pvpGrenadePinQueued = this.gameType === 'pvp' && signalServer;
    this.grenadeView.setPinned(true, animate);
    this.audio.grenadePin();
    return true;
  }

  primeImpactGrenade() {
    if (!this.grenadeSelected || this.grenadePinAt > 0 || this.grenadesRemaining <= 0) {
      return false;
    }
    this.grenadePinAt = this.time;
    this.grenadesRemaining--;
    this.pvpGrenadeCountPending = this.gameType === 'pvp';
    this.pvpGrenadePendingUntil = this.gameType === 'pvp'
      ? this.time + PVP_GRENADE_ACK_TIMEOUT
      : 0;
    // Impact-fused bottles have no safety pin and cannot be cooked. The throw
    // command alone authoritatively consumes one on the server.
    this.pvpGrenadePinQueued = false;
    return true;
  }

  requestGrenadeThrow({ direct = false } = {}) {
    if (!this.grenadeSelected || (this.grenadesRemaining <= 0 && this.grenadePinAt <= 0)) return;
    if (direct) {
      if (this.grenadePinAt > 0) return;
      if (grenadeDetonatesOnImpact(this.loadout.grenade)) {
        if (!this.primeImpactGrenade()) return;
      } else if (!this.beginGrenadePin({ animate: false, signalServer: false })) {
        return;
      }
    } else if (this.grenadePinAt <= 0) {
      return;
    }
    if (this.gameType === 'pvp') {
      this.pvpGrenadeThrowQueued = true;
      this.grenadeSelected = false;
      this.grenadeThrowAiming = false;
      this.grenadeImpactThrowHeld = false;
      this.grenadeView.playThrow();
      this.grenadeTrajectory.hide();
      return;
    }
    this.throwLocalGrenade();
  }

  throwLocalGrenade() {
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const position = this.grenadeHandOrigin(direction, new THREE.Vector3());
    const grenade = {
      id: `pve-${this.time}-${Math.random()}`,
      ownerId: 'player',
      team: this.player.team,
      kind: grenadeKind(this.loadout.grenade),
      position,
      velocity: grenadeThrowVelocity(direction, this.player.velocity),
      detonateAt: this.grenadePinAt + GRENADE_FUSE_SECONDS,
      impactFused: grenadeDetonatesOnImpact(this.loadout.grenade),
      bounces: 0,
      pvp: false,
    };
    this.grenadePinAt = 0;
    this.grenadeSelected = false;
    this.grenadeThrowAiming = false;
    this.grenadeImpactThrowHeld = false;
    this.grenadeView.playThrow();
    this.grenadeTrajectory.hide();
    this.spawnGrenadeVisual(grenade);
    this.audio.grenadeThrow(this.camera.position, grenade.kind);
    this.playOperatorVoice({
      action: operatorVoiceActionForGrenade(grenade.kind),
      actorId: 'player',
      speakerName: this.player.name,
      team: this.player.team,
      position: grenade.position,
    });
  }

  dropLocalPinnedGrenade() {
    if (this.grenadePinAt <= 0) return;
    const grenade = {
      id: `pve-drop-${this.time}-${Math.random()}`,
      ownerId: 'player',
      team: this.player.team,
      kind: grenadeKind(this.loadout.grenade),
      position: this.camera.position.clone(),
      velocity: this.player.velocity.clone().multiplyScalar(0.3),
      detonateAt: this.grenadePinAt + GRENADE_FUSE_SECONDS,
      impactFused: grenadeDetonatesOnImpact(this.loadout.grenade),
      bounces: 0,
      pvp: false,
    };
    this.grenadePinAt = 0;
    this.spawnGrenadeVisual(grenade);
  }

  dropLocalMartyrdomGrenade() {
    const grenade = createMartyrdomGrenade({
      id: `pve-martyrdom-${this.time}-${Math.random()}`,
      ownerId: 'player',
      team: this.player.team,
      position: this.player.position,
      loadout: this.loadout,
      now: this.time,
    });
    if (!grenade) return false;
    grenade.pvp = false;
    this.spawnGrenadeVisual(grenade);
    return true;
  }

  grenadeHandOrigin(direction, out = new THREE.Vector3()) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    return out.copy(this.camera.position)
      .addScaledVector(direction, 0.42)
      .addScaledVector(right, 0.3)
      .addScaledVector(up, -0.18);
  }

  updateGrenadeTrajectory() {
    const visible = this.player.alive
      && this.mode === 'playing'
      && this.input.locked
      && this.grenadeSelected
      && this.grenadeThrowAiming;
    if (!visible) {
      this.grenadeTrajectory.hide();
      return;
    }
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const origin = this.grenadeHandOrigin(direction, new THREE.Vector3());
    const velocity = grenadeThrowVelocity(direction, this.player.velocity);
    this.grenadeTrajectory.update({
      visible,
      origin,
      velocity,
      time: this.time,
      cast: (from, rayDirection, distance) =>
        this.castGrenadeWorld(from, rayDirection, distance),
    });
  }

  spawnGrenadeVisual(state) {
    const existing = this.grenadeProjectiles.get(state.id);
    if (existing) return existing;
    const grenade = {
      ...state,
      position: state.position instanceof THREE.Vector3
        ? state.position.clone()
        : new THREE.Vector3(...state.position),
      velocity: state.velocity instanceof THREE.Vector3
        ? state.velocity.clone()
        : new THREE.Vector3(...state.velocity),
      kind: grenadeKind(state.kind),
      impactFused: grenadeDetonatesOnImpact(state.kind),
      model: buildGrenadeModel(false, { kind: state.kind }),
      spin: new THREE.Vector3(rand(-10, 10), rand(-13, 13), rand(-10, 10)),
      bounces: state.bounces || 0,
      physicsRemainder: clamp(
        Number(state.physicsRemainder) || 0,
        0,
        GRENADE_PHYSICS_STEP
      ),
      physicsLifeRemaining: Number.isFinite(Number(state.physicsLifeRemaining))
        ? Math.max(0, Number(state.physicsLifeRemaining))
        : undefined,
      resting: Boolean(state.resting),
    };
    for (const part of grenade.model.userData.pinParts || []) part.visible = false;
    grenade.model.position.copy(grenade.position);
    this.scene.add(grenade.model);
    this.grenadeProjectiles.set(grenade.id, grenade);
    return grenade;
  }

  catchUpPvpGrenade(grenade, serverTime, receivedAt = Date.now()) {
    if (!grenade?.pvp || !Number.isFinite(Number(serverTime))) return 0;
    const serverEpoch = this.pvp.clientEpochForServerTime(
      Number(serverTime),
      receivedAt
    );
    const elapsed = clamp((receivedAt - serverEpoch) / 1000, 0, 0.75);
    if (elapsed <= 0 || grenade.resting || grenade.impactLocked) return 0;
    advanceGrenade(grenade, elapsed, (origin, direction, distance) =>
      this.castGrenadeWorld(origin, direction, distance));
    grenade.model.position.copy(grenade.position);
    return elapsed;
  }

  syncPvpGrenadeState(message) {
    const grenade = this.grenadeProjectiles.get(message.id);
    if (!grenade?.pvp || !Array.isArray(message.p) || !Array.isArray(message.v)) {
      return false;
    }
    // Moving PVP grenades use the same continuous browser simulation as PVE.
    // Only accept the authority's settled result so rebounds are never snapped
    // backwards by an in-flight network update.
    if (!message.resting) return false;
    grenade.position.set(...message.p);
    grenade.velocity.set(...message.v);
    grenade.bounces = Math.max(
      grenade.bounces || 0,
      Math.round(Number(message.bounces) || 0)
    );
    grenade.physicsRemainder = clamp(
      Number(message.remainder) || 0,
      0,
      GRENADE_PHYSICS_STEP
    );
    grenade.resting = Boolean(message.resting);
    grenade.impactLocked = false;
    this.catchUpPvpGrenade(grenade, Number(message.serverTime));
    grenade.model.position.copy(grenade.position);
    return true;
  }

  removeGrenadeVisual(id) {
    const grenade = this.grenadeProjectiles.get(id);
    if (!grenade) return;
    this.scene.remove(grenade.model);
    grenade.model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.grenadeProjectiles.delete(id);
  }

  castGrenadeWorld(origin, direction, distance) {
    return castGrenadeSolids(
      this.level.solids,
      this.raycaster,
      origin,
      direction,
      distance
    );
  }

  updateGrenades(dt) {
    if (this.gameType === 'pve' && this.grenadePinAt > 0
      && this.time >= this.grenadePinAt + GRENADE_FUSE_SECONDS) {
      const at = this.camera.position.clone();
      const kind = grenadeKind(this.loadout.grenade);
      this.grenadePinAt = 0;
      this.grenadeSelected = false;
      this.grenadeThrowAiming = false;
      this.grenadeView.reset();
      this.grenadeTrajectory.hide();
      this.explodeLocalGrenade(at, kind, `pve-hand-${this.time}`);
    }
    for (const grenade of [...this.grenadeProjectiles.values()]) {
      advanceGrenade(grenade, dt, (origin, direction, distance) =>
        this.castGrenadeWorld(origin, direction, distance));
      grenade.model.position.copy(grenade.position);
      // Physics is fixed at 70 Hz on both client and server. Extrapolating only
      // the unconsumed fraction keeps high-refresh rendering smooth without
      // feeding frame-rate-dependent positions back into collision state.
      if (!grenade.resting && !grenade.impactLocked) {
        grenade.model.position.addScaledVector(
          grenade.velocity,
          Math.min(
            GRENADE_PHYSICS_STEP,
            Math.max(0, Number(grenade.physicsRemainder) || 0)
          )
        );
      }
      grenade.model.userData.updateVisual?.(this.time);
      grenade.model.rotation.x += grenade.spin.x * dt;
      grenade.model.rotation.y += grenade.spin.y * dt;
      grenade.model.rotation.z += grenade.spin.z * dt;
      if (grenade.pvp) continue;
      if (!grenade.impactThisStep && this.time < grenade.detonateAt) continue;
      this.removeGrenadeVisual(grenade.id);
      this.explodeLocalGrenade(grenade.position, grenade.kind, grenade.id);
    }
    this.updateIncendiaryZones(dt);
  }

  explodeGrenadeVisual(at, kind = 'frag') {
    const grenadeType = grenadeKind(kind);
    this.audio[grenadeDetonationAudioCue(grenadeType)](at);
    if (grenadeType === 'molotov') this.effects.molotovBreak(at);
    else if (grenadeCreatesFire(grenadeType)) this.effects.incendiaryIgnite(at);
    else this.effects.explosion(at, 0.72);
    this.strikeFlash.position.set(at.x, at.y + 1.2, at.z);
    this.strikeFlash.intensity = Math.max(
      this.strikeFlash.intensity,
      grenadeCreatesFire(grenadeType) ? 34 : 82
    );
    const distance = this.player.position.distanceTo(at);
    if (distance < 34 && this.player.alive) {
      const k = clamp(1 - distance / 34, 0, 1);
      this.player.recoilPitch.kick(rand(-1.8, 1.8) * k);
      this.player.recoilYaw.kick(rand(-1.2, 1.2) * k);
      this.player.hurtRoll.kick(rand(-2.2, 2.2) * k);
      this.player.punch.kick(4.5 * k);
      this.flashTimer = Math.max(this.flashTimer || 0, 0.16 * k);
    }
  }

  explodeLocalGrenade(at, kind = 'frag', id = null) {
    const grenadeType = grenadeKind(kind);
    if (grenadeCreatesFire(grenadeType)) {
      const position = this.incendiaryGroundPoint(at);
      this.explodeGrenadeVisual(position, grenadeType);
      const duration = incendiaryDuration(grenadeType);
      this.spawnIncendiaryZone({
        id: id || `pve-fire-${this.time}-${Math.random()}`,
        ownerId: 'player',
        team: this.player.team,
        kind: grenadeType,
        position,
        expiresAt: this.time + duration,
        nextDamageAt: this.time,
        pvp: false,
      });
      return;
    }
    this.explodeGrenadeVisual(at, 'frag');
    let hits = 0;
    let kills = 0;
    let brokeArmor = false;
    for (const actor of this.actors()) {
      if (!actor.alive) continue;
      if (actor !== this.player && actor.team === this.player.team) continue;
      const targetPoint = new THREE.Vector3(
        actor.position.x,
        actor.position.y + 0.9,
        actor.position.z
      );
      const distance = targetPoint.distanceTo(at);
      const occluded = actor !== this.player && grenadeBlastOccluded(
        at,
        targetPoint,
        (origin, direction, maxDistance) =>
          this.castGrenadeWorld(origin, direction, maxDistance)
      );
      const damage = grenadeDamage(distance, occluded);
      if (damage <= 0.01) continue;
      if (actor === this.player) {
        const reducedDamage = loadoutExplosiveDamage(this.loadout, damage);
        const killed = this.player.takeDamage(reducedDamage, at, this.player);
        if (killed) this.onPlayerKilled(this.player, { id: 'grenade' });
        continue;
      }
      const beforeHealth = actor.health;
      const beforeArmor = actor.armor;
      const direction = actor.position.clone().sub(at).setY(0).normalize();
      const killed = actor.hit(damage, direction, 'chest', this.player);
      hits++;
      kills += killed ? 1 : 0;
      brokeArmor ||= beforeArmor > 0 && actor.armor <= 0;
      this.hud.damageNumber(actor.position.clone().add(new THREE.Vector3(0, 1.1, 0)), damage, false);
      this.rememberEnemyHudDamage(actor, beforeHealth, beforeArmor);
      if (killed) this.onActorKilled(this.player, actor, { id: 'grenade' }, false, distance);
    }
    if (hits > 0) {
      this.hud.hit(kills > 0 ? 'kill' : 'hit');
      if (kills === 0) {
        if (brokeArmor) this.audio.armorCrack();
        else this.audio.hitmarker(false);
      }
    }
  }

  incendiaryGroundPoint(at) {
    const origin = at.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.raycaster.set(origin, new THREE.Vector3(0, -1, 0));
    this.raycaster.near = 0;
    this.raycaster.far = 24;
    const hit = this.raycaster.intersectObjects(this.level.solids, false)[0];
    return hit ? hit.point.clone().add(new THREE.Vector3(0, 0.025, 0)) : at.clone();
  }

  incendiarySurfaceAt(position, localX, localZ) {
    const origin = new THREE.Vector3(
      position.x + localX,
      position.y + 2.25,
      position.z + localZ
    );
    this.raycaster.set(origin, new THREE.Vector3(0, -1, 0));
    this.raycaster.near = 0;
    this.raycaster.far = 5.5;
    const hits = this.raycaster.intersectObjects(this.level.solids, false);
    const hit = hits.find((candidate) =>
      candidate.point.y <= position.y + 0.90
        && candidate.point.y >= position.y - 3.10);
    if (!hit) return null;
    const normal = hit.face?.normal
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : new THREE.Vector3(0, 1, 0);
    if (normal.y < 0) normal.negate();
    return {
      y: hit.point.y - position.y,
      normal,
    };
  }

  prepareIncendiaryZoneModel(position, kind) {
    const radius = incendiaryRadius(kind);
    if (normalizeIncendiaryKind(kind) === AIRSTRIKE_INCENDIARY_KIND) {
      return this.firebombFields.prepareZone(
        position,
        (localX, localZ) => this.incendiarySurfaceAt(position, localX, localZ)
      );
    }
    const pixelScale = this.pipeline.height
      / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5));
    const model = buildIncendiaryFieldModel({ pixelScale, radius });
    model.position.copy(position);
    conformIncendiaryFieldToGround(
      model,
      (localX, localZ) => this.incendiarySurfaceAt(position, localX, localZ)
    );
    model.visible = false;
    return model;
  }

  disposeIncendiaryZoneModel(model) {
    if (!model) return;
    // Batched B-2 prewarm results are packed CPU arrays, not scene objects.
    if (model.type === 'firebomb-field-prepared') return;
    model.removeFromParent();
    model.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
    });
    for (const material of model.userData.ownedMaterials || []) {
      material.dispose();
    }
    for (const texture of model.userData.ownedTextures || []) {
      texture.dispose();
    }
  }

  spawnIncendiaryZone(state) {
    const id = String(state.id || `fire-${this.time}-${Math.random()}`);
    const existing = this.incendiaryZones.get(id);
    if (existing) {
      existing.expiresAt = Math.max(existing.expiresAt, Number(state.expiresAt) || 0);
      if (existing.batched) {
        existing.batchSlot = this.firebombFields.addZone({
          id,
          position: existing.position,
          expiresAt: existing.expiresAt,
        });
      }
      this.disposeIncendiaryZoneModel(state.preparedModel);
      return existing;
    }
    const position = state.position instanceof THREE.Vector3
      ? state.position.clone()
      : new THREE.Vector3(...state.position);
    const kind = normalizeIncendiaryKind(state.kind);
    const radius = incendiaryRadius(kind);
    const batched = kind === AIRSTRIKE_INCENDIARY_KIND;
    let model = null;
    let batchSlot = null;
    if (batched) {
      batchSlot = this.firebombFields.addZone({
        id,
        position,
        expiresAt: Number(state.expiresAt) || this.time + INCENDIARY_DURATION_SECONDS,
        prepared: state.preparedModel || null,
        sampleGround: (localX, localZ) =>
          this.incendiarySurfaceAt(position, localX, localZ),
      });
    } else {
      model = state.preparedModel
        || this.prepareIncendiaryZoneModel(position, kind);
      model.position.copy(position);
      model.visible = true;
      if (!model.parent) this.scene.add(model);
    }
    const zone = {
      id,
      ownerId: state.ownerId,
      team: state.team,
      kind,
      radius,
      position,
      expiresAt: Number(state.expiresAt) || this.time + INCENDIARY_DURATION_SECONDS,
      nextDamageAt: Number(state.nextDamageAt) || this.time,
      particleAt: 0,
      pvp: Boolean(state.pvp),
      batched,
      batchSlot,
      model,
    };
    this.incendiaryZones.set(id, zone);
    return zone;
  }

  syncPvpIncendiaryZone(message) {
    const deadline = this.pvp.clientEpochForServerTime(Number(message.expiresAt));
    const fallbackDuration = incendiaryDuration(message.kind);
    const remaining = Number.isFinite(deadline)
      ? Math.max(0, (deadline - Date.now()) / 1000)
      : fallbackDuration;
    if (remaining <= 0) return null;
    return this.spawnIncendiaryZone({
      id: message.id,
      ownerId: message.ownerId,
      team: message.team,
      kind: message.kind,
      position: message.p,
      expiresAt: this.time + remaining,
      pvp: true,
      preparedModel: message.preparedModel || null,
    });
  }

  removeIncendiaryZone(id) {
    const zone = this.incendiaryZones.get(id);
    if (!zone) return;
    if (zone.batched) this.firebombFields.removeZone(zone.id);
    else this.disposeIncendiaryZoneModel(zone.model);
    this.incendiaryZones.delete(id);
  }

  updateIncendiaryZones(dt) {
    for (const zone of [...this.incendiaryZones.values()]) {
      const remaining = zone.expiresAt - this.time;
      if (remaining <= 0) {
        this.removeIncendiaryZone(zone.id);
        continue;
      }
      if (!zone.batched) {
        updateIncendiaryFieldModel(zone.model, this.time, Math.min(1, remaining));
        zone.particleAt -= dt;
        if (zone.particleAt <= 0) {
          zone.particleAt += 0.045;
          const angle = Math.random() * TAU;
          const radius = Math.pow(Math.random(), 0.68) * zone.radius * 0.84;
          this.effects.incendiaryFlame(new THREE.Vector3(
            zone.position.x + Math.cos(angle) * radius,
            zone.position.y + 0.08,
            zone.position.z + Math.sin(angle) * radius
          ));
        }
      }
      if (!zone.pvp && this.time >= zone.nextDamageAt) {
        zone.nextDamageAt = this.time + INCENDIARY_TICK_SECONDS;
        this.applyLocalIncendiaryTick(zone);
      }
    }
    this.firebombFields.update(this.time, this.camera.position);
  }

  applyLocalIncendiaryTick(zone) {
    let hits = 0;
    let kills = 0;
    let brokeArmor = false;
    for (const actor of this.actors()) {
      if (!actor.alive) continue;
      if (actor !== this.player && actor.team === zone.team) continue;
      const targetPoint = new THREE.Vector3(
        actor.position.x,
        actor.position.y + 0.82,
        actor.position.z
      );
      const distance = targetPoint.distanceTo(zone.position);
      if (distance > zone.radius) continue;
      if (actor !== this.player && incendiaryOccluded(
        zone.position,
        targetPoint,
        (origin, direction, maxDistance) =>
          this.castGrenadeWorld(origin, direction, maxDistance)
      )) continue;
      const damage = incendiaryDamage(distance, zone.kind);
      if (damage <= 0.01) continue;
      if (actor === this.player) {
        const killed = this.player.takeDamage(damage, zone.position, this.player);
        if (killed) this.onPlayerKilled(this.player, { id: zone.kind });
        continue;
      }
      const beforeHealth = actor.health;
      const beforeArmor = actor.armor;
      const direction = actor.position.clone().sub(zone.position).setY(0);
      if (direction.lengthSq() > 1e-6) direction.normalize();
      else direction.set(0, 0, 1);
      const killed = actor.hit(damage, direction, 'chest', this.player);
      hits++;
      kills += killed ? 1 : 0;
      brokeArmor ||= beforeArmor > 0 && actor.armor <= 0;
      this.hud.damageNumber(
        actor.position.clone().add(new THREE.Vector3(0, 1.1, 0)),
        damage,
        false
      );
      this.rememberEnemyHudDamage(actor, beforeHealth, beforeArmor);
      if (killed) {
        this.onActorKilled(
          this.player,
          actor,
          { id: zone.kind },
          false,
          distance
        );
      }
    }
    if (hits > 0) {
      this.hud.hit(kills > 0 ? 'kill' : 'hit');
      if (kills === 0) {
        if (brokeArmor) this.audio.armorCrack();
        else this.audio.hitmarker(false);
      }
    }
  }

  /* ------------------------------------------------------ missile strike */

  buildMissileModel() {
    const g = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: 0x59626c });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b3138 });
    const tip = new THREE.MeshLambertMaterial({ color: 0xb04a2a });
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 2.4, 8), body);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.26, 0.7, 8), tip);
    nose.position.y = -1.55;                       // the missile flies nose-down (-Y)
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.35, 8), dark);
    tail.position.y = 1.35;
    const fin1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.06), dark);
    fin1.position.y = 1.15;
    const fin2 = fin1.clone();
    fin2.rotation.y = Math.PI / 2;
    g.add(hull, nose, tail, fin1, fin2);
    return g;
  }

  groundYAt(x, z) {
    this.raycaster.set(this._v1.set(x, 90, z), this._v2.set(0, -1, 0));
    this.raycaster.near = 0;
    this.raycaster.far = 120;
    const hits = this.raycaster.intersectObjects(this.level.solids, false);
    return hits.length ? hits[0].point.y : 0;
  }

  launchPvpStrike(tx, tz) {
    if (this.missile) this.removeMissile();
    const groundY = this.groundYAt(tx, tz);
    const start = new THREE.Vector3(tx + 26, 150, tz + 12);
    const dir = new THREE.Vector3(tx, groundY, tz).sub(start).normalize();
    const model = this.buildMissileModel();
    model.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    model.position.copy(start);
    this.scene.add(model);
    this.missile = {
      pos: start,
      dir,
      speed: STRIKE_SPEED,
      groundY,
      model,
      smokeT: 0,
      warned: false,
      visualOnly: true,
    };
    this.hud.banner('MISSILE INBOUND', '', 1.8, '#ff5b4c');
    this.audio.strikeLaunch();
  }

  updateMissile(dt) {
    const m = this.missile;
    m.pos.addScaledVector(m.dir, m.speed * dt);
    m.model.position.copy(m.pos);
    m.smokeT -= dt;
    if (m.smokeT <= 0) {
      m.smokeT = 0.035;
      this.effects.muzzleSmoke(this._v1.copy(m.pos).addScaledVector(m.dir, -1.6), this._v2.copy(m.dir).negate());
    }
    if (!m.warned && m.pos.y < 55) {
      m.warned = true;
      this.audio.missileIncoming();
    }
    if (m.pos.y <= m.groundY + 0.4) {
      const at = new THREE.Vector3(m.pos.x, m.groundY, m.pos.z);
      const visualOnly = m.visualOnly;
      this.removeMissile();
      if (visualOnly) this.explodeStrikeVisual(at);
      else this.explodeStrike(at);
    }
  }

  removeMissile() {
    if (!this.missile) return;
    this.scene.remove(this.missile.model);
    this.missile.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.missile = null;
  }

  /* --------------------------------------------------------- UAV aircraft */

  spawnLocalUavDrone(team = this.player.team, ownerId = 'player') {
    const id = `uav-${team}`;
    this.removeUavDrone(id);
    const state = createUavDroneState({
      ownerId,
      team,
      now: this.time * 1000,
      groundY: 0,
    });
    const displayTeam = team === this.player.team ? 'blue' : 'red';
    const view = new UavDroneView(this.scene, state, displayTeam, this.camera);
    const drone = {
      ...state,
      source: 'pve',
      view,
    };
    view.setPose(uavDronePose(team, this.time * 1000));
    this.uavDrones.set(id, drone);
    return drone;
  }

  syncPvpUavDrones(states, serverTime) {
    this.pvpUavClockServerTime = Number(serverTime) || Date.now();
    this.pvpUavClockReceivedAt = Date.now();
    const seen = new Set();
    for (const state of states) {
      if (!state?.id || (state.team !== 'blue' && state.team !== 'red')) continue;
      seen.add(state.id);
      const displayTeam = state.team === this.player.team ? 'blue' : 'red';
      let drone = this.uavDrones.get(state.id);
      if (!drone || drone.source !== 'pvp' || drone.view.displayTeam !== displayTeam) {
        if (drone) this.removeUavDrone(state.id);
        const view = new UavDroneView(this.scene, state, displayTeam, this.camera);
        const health = Number(state.health);
        const maxHealth = Number(state.maxHealth);
        drone = {
          id: state.id,
          ownerId: state.ownerId || null,
          team: state.team,
          health: Number.isFinite(health) ? health : UAV_DRONE_HEALTH,
          maxHealth: Number.isFinite(maxHealth) ? maxHealth : UAV_DRONE_HEALTH,
          alive: true,
          source: 'pvp',
          view,
        };
        this.uavDrones.set(state.id, drone);
      } else {
        const health = Number(state.health);
        const maxHealth = Number(state.maxHealth);
        drone.health = Number.isFinite(health) ? health : 0;
        drone.maxHealth = Number.isFinite(maxHealth) ? maxHealth : UAV_DRONE_HEALTH;
        drone.alive = drone.health > 0;
        drone.view.applyState(state);
      }
    }
    for (const [id, drone] of this.uavDrones) {
      if (drone.source === 'pvp' && !seen.has(id)) this.removeUavDrone(id);
    }
  }

  updateUavDrones() {
    const nowMs = this.gameType === 'pvp'
      ? this.pvpUavClockServerTime
        + Math.max(0, Date.now() - this.pvpUavClockReceivedAt)
      : this.time * 1000;
    for (const [id, drone] of [...this.uavDrones]) {
      if (!drone.alive || drone.health <= 0
        || (drone.source === 'pve'
          && (this.uav.time <= 0 || nowMs >= drone.expiresAt))) {
        this.removeUavDrone(id);
        continue;
      }
      drone.view.setPose(uavDronePose(drone.team, nowMs));
    }
  }

  removeUavDrone(id) {
    const drone = this.uavDrones.get(id);
    if (!drone) return;
    drone.view?.dispose(this.scene);
    this.uavDrones.delete(id);
  }

  clearUavDrones() {
    for (const id of [...this.uavDrones.keys()]) this.removeUavDrone(id);
    this.pvpUavClockServerTime = 0;
    this.pvpUavClockReceivedAt = 0;
  }

  damageLocalUavDrone(
    drone,
    hit,
    def,
    sourceScale = 1,
    attackerTeam = this.player.team
  ) {
    if (!drone?.alive || drone.team === attackerTeam) {
      return { killed: false, damage: 0 };
    }
    const fall = clamp(
      (hit.distance - def.range * 0.35) / (def.range * 0.75),
      0,
      1
    );
    const damage = def.damage * lerp(1, def.minDamage, fall) * sourceScale;
    drone.health = Math.max(0, drone.health - damage);
    drone.view.health = drone.health;
    const killed = drone.health <= 0;
    if (killed) {
      drone.alive = false;
      if (drone.team === this.player.team) {
        this.uav.time = 0;
        this.uav.ping = 0;
      }
      this.removeUavDrone(drone.id);
      this.hud.banner(
        drone.team === this.player.team ? 'UAV DESTROYED' : 'ENEMY UAV DESTROYED',
        '',
        2.2,
        drone.team === this.player.team ? '#ff5b4c' : '#7de08a'
      );
    }
    return { killed, damage };
  }

  /* ------------------------------------------------ Juggernaut airdrops */

  setLocalJuggernaut(active, { fill = true, equip = true } = {}) {
    const next = !!active;
    const wasJuggernaut = !!this.player.juggernaut;
    if (next) {
      // The heavy kit replaces the lethal slot for the rest of this life.
      // Clear every grenade presentation latch so an old selection cannot
      // remain drawn over the newly equipped M134.
      this.grenadeSelected = false;
      this.grenadePinAt = 0;
      this.grenadeThrowAiming = false;
      this.grenadeImpactThrowHeld = false;
      this.pvpGrenadeThrowQueued = false;
      this.pvpGrenadePinQueued = false;
      this.pvpGrenadeCountPending = false;
      this.pvpGrenadePendingUntil = 0;
      this.grenadeView.reset();
      this.grenadeTrajectory.hide();
    }
    this.player.juggernaut = next;
    if (!next && wasJuggernaut) this.audio.stopJuggernautBreathing();
    this.player.maxHealth = next ? JUGGERNAUT_MAX_HEALTH : this.ohp;
    this.player.maxArmor = loadoutArmorCapacity(
      this.loadout,
      next ? JUGGERNAUT_MAX_ARMOR : 50
    );
    this.player.healthRegenDelay = loadoutHealthRegenDelay(this.loadout);
    if (fill) {
      this.player.health = this.player.maxHealth;
      this.player.armor = this.player.maxArmor;
    } else {
      this.player.health = Math.min(this.player.health, this.player.maxHealth);
      this.player.armor = Math.min(this.player.armor, this.player.maxArmor);
    }
    if (!equip || !this.player.alive) return;
    if (next) {
      if (this.gameType === 'pve') {
        this.viewModel.ammo.minigun = {
          mag: WEAPON_DEFS.minigun.mag,
          reserve: WEAPON_DEFS.minigun.reserve,
        };
      }
      this.viewModel.equip('minigun', true);
      this.viewModel.drawCurrent();
    } else if (this.viewModel.def?.id === 'minigun') {
      this.viewModel.equip(this.loadout.primary, true);
    }
  }

  syncJuggernautBreathing() {
    const shouldPlay = shouldPlayJuggernautBreathing({
      mode: this.mode,
      alive: this.player.alive,
      juggernaut: this.player.juggernaut,
    });
    if (shouldPlay) this.audio.startJuggernautBreathing();
    else this.audio.stopJuggernautBreathing();
  }

  syncRailgunChargeAudio() {
    const shouldRemainActive = this.mode === 'playing'
      && this.player.alive
      && this.railgunActive
      && this.viewModel.def?.id === LASER_CANNON_ID
      && this.viewModel.chargeProgress > 0;
    if (!shouldRemainActive) this.audio.stopRailgunCharge();
  }

  syncMatchAmbience() {
    const active = MATCH_AMBIENCE_MODES.has(this.mode)
      || (this.mode === 'settings' && this.prevMode === 'paused');
    if (active) {
      this.audio.startManagedLoop('match-ambience', 'matchAmbience', {
        gain: 0.16,
        fadeIn: 2.2,
        loop: true,
      });
    } else {
      this.audio.stopManagedLoop('match-ambience', 1.1);
    }
  }

  spawnJuggernautAirdrop({
    id = `local-airdrop-${++this.localAirdropSeq}`,
    ownerId = 'player',
    team = this.player.team,
    target = this.player.position,
    yaw = this.player.yaw,
    startedAt = Date.now(),
    age = 0,
    pvp = false,
  } = {}) {
    const state = createJuggernautAirdrop({
      id,
      ownerId,
      team,
      target,
      yaw,
      startedAt,
    });
    let drop = this.airdrops.get(state.id);
    if (drop) {
      drop.state = state;
      drop.view.setState(state);
      drop.age = Math.max(0, Number(age) || 0);
      drop.seenAt = this.time;
      return drop;
    }
    const view = new JuggernautAirdropView(this.scene, state);
    drop = {
      id: state.id,
      state,
      view,
      age: Math.max(0, Number(age) || 0),
      pvp: !!pvp,
      landed: false,
      engineStarted: false,
      engineFinished: false,
      seenAt: this.time,
    };
    this.airdrops.set(drop.id, drop);
    return drop;
  }

  removeJuggernautAirdrop(id) {
    const drop = typeof id === 'string' ? this.airdrops.get(id) : id;
    if (!drop) return;
    this.audio.stopManagedLoop(`transport-heli:${drop.id}`, 1.15);
    drop.view.dispose();
    this.airdrops.delete(drop.id);
    if (this.airdropInteraction?.id === drop.id) this.airdropInteraction = null;
  }

  clearJuggernautAirdrops() {
    for (const drop of [...this.airdrops.values()]) this.removeJuggernautAirdrop(drop);
    this.airdrops.clear();
    this.airdropInteraction = null;
  }

  syncPvpJuggernautAirdrops(states) {
    const seen = new Set();
    for (const state of states || []) {
      seen.add(state.id);
      const startedAt = this.pvp.clientEpochForServerTime(
        Number(state.startedAt),
        Date.now()
      );
      const age = Number.isFinite(startedAt)
        ? Math.max(0, (Date.now() - startedAt) / 1000)
        : 0;
      const drop = this.spawnJuggernautAirdrop({ ...state, age, pvp: true });
      drop.seenAt = this.time;
    }
    for (const drop of [...this.airdrops.values()]) {
      if (!drop.pvp || seen.has(drop.id)) continue;
      // The JSON event can lead the first binary snapshot by one frame.
      if (this.time - drop.seenAt > 0.35) this.removeJuggernautAirdrop(drop);
    }
  }

  updateJuggernautAirdrops(dt) {
    for (const drop of [...this.airdrops.values()]) {
      drop.age += dt;
      const update = drop.view.update(drop.age, dt);
      drop.landed = update.landed;
      const helicopter = airdropHelicopterPose(drop.state, drop.age);
      const engineId = `transport-heli:${drop.id}`;
      if (helicopter.visible) {
        const position = new THREE.Vector3(
          helicopter.x,
          helicopter.y,
          helicopter.z
        );
        if (!drop.engineStarted) {
          drop.engineStarted = true;
          this.audio.startManagedLoop(engineId, 'helicopterLoop', {
            gain: 0.72,
            pos: position,
            maxDistance: 340,
            fadeIn: 1.0,
            loop: true,
            offset: drop.age,
          });
        } else if (!drop.engineFinished) {
          this.audio.updateManagedLoop(engineId, {
            gain: 0.72,
            pos: position,
            maxDistance: 340,
          });
        }
      } else if (drop.engineStarted && !drop.engineFinished) {
        drop.engineFinished = true;
        this.audio.stopManagedLoop(engineId, 1.35);
      }
      if (update.impacted) {
        const at = update.cratePosition.clone();
        this.effects.airdropImpact(at);
        this.audio.airdropImpact(at);
      }
      if (!drop.pvp
        && drop.age > AIRDROP_IMPACT_SECONDS + JUGGERNAUT_CRATE_LIFETIME_SECONDS) {
        this.removeJuggernautAirdrop(drop);
      }
    }
  }

  nearestClaimableAirdrop() {
    if (!this.player.alive || this.player.juggernaut
      || this.grenadeSelected || this.grenadePinAt > 0 || this.grenadeView.throwing) {
      return null;
    }
    let nearest = null;
    let best = Infinity;
    for (const drop of this.airdrops.values()) {
      if (!drop.landed || !withinAirdropInteraction(drop.state, this.player.position)) continue;
      const dx = this.player.position.x - drop.state.target[0];
      const dz = this.player.position.z - drop.state.target[2];
      const distance = dx * dx + dz * dz;
      if (distance >= best) continue;
      best = distance;
      nearest = drop;
    }
    return nearest;
  }

  updateAirdropInteraction(dt, input, canInteract = true) {
    const drop = canInteract ? this.nearestClaimableAirdrop() : null;
    if (!drop) {
      this.airdropInteraction = null;
      return false;
    }
    const holding = input.down('KeyE');
    const move = input.moveAxis();
    const stationary = Math.hypot(move.x, move.z) <= 0.04
      && this.player.speed2D <= 0.20
      && !input.down('Space')
      && !input.down('ShiftLeft')
      && !input.mouseDown(0);
    if (!this.airdropInteraction || this.airdropInteraction.id !== drop.id) {
      this.airdropInteraction = {
        id: drop.id,
        progress: 0,
        holding: false,
        stationary,
      };
    }
    const interaction = this.airdropInteraction;
    interaction.holding = holding;
    interaction.stationary = stationary;
    if (holding && stationary) {
      this.viewModel.cancelReload();
      this.pvpReloadQueued = false;
      this.pvpPredictedReload = null;
      interaction.progress = clamp(
        interaction.progress + dt / JUGGERNAUT_INTERACT_SECONDS,
        0,
        1
      );
    } else {
      interaction.progress = 0;
    }
    if (this.gameType === 'pve' && interaction.progress >= 1) {
      this.removeJuggernautAirdrop(drop);
      this.setLocalJuggernaut(true);
      this.airdropInteraction = null;
      this.hud.banner('JUGGERNAUT ONLINE', '', 2.8, '#ffcc55');
      this.audio.uiClick();
    }
    return holding;
  }

  /* ----------------------------------------------- killstreak call devices */

  beginDeviceHolster(state) {
    const duration = this.viewModel.holsterCurrent();
    state.entering = duration > 0;
    state.holsterRemaining = duration;
    if (!state.entering) this.viewModel.holder.visible = false;
    return state;
  }

  updateDeviceHolster(state, dt) {
    if (!state?.entering) return false;
    state.holsterRemaining = Math.max(
      0,
      (Number(state.holsterRemaining) || 0) - Math.max(0, dt)
    );
    if (state.holsterRemaining > 0) return true;
    state.entering = false;
    // The regular viewmodel update owns visibility each frame, so explicitly
    // hand the frame to the device at the exact bottom of the switch track.
    this.viewModel.holder.visible = false;
    return false;
  }

  deviceOwnsWeaponView() {
    return Boolean(
      (this.casTargeting && !this.casTargeting.entering)
      || (this.firebombTargeting && !this.firebombTargeting.entering)
      || (this.streakCall && !this.streakCall.entering)
      || this.weaponReturnDelay > 0
    );
  }

  beginStreakCall(type) {
    const timing = STREAK_CALL_TIMING[type];
    if (!timing || !this.player.alive || this.mode !== 'playing'
      || !loadoutHasStreak(this.loadout, type)
      || this.railgunActive
      || this.streakCall || this.casTargeting || this.firebombTargeting
      || this.tvMissile
      || this.grenadePinAt > 0) return false;
    if (type === 'uav' && (this.uav.charges <= 0 || this.uav.time > 0)) return false;
    if (type === 'strike' && this.strikeCharges <= 0) return false;
    if (type === 'juggernaut' && this.juggernautCharges <= 0) return false;
    if (type === 'attack_helicopter' && this.attackHelicopterCharges <= 0) {
      return false;
    }

    this.stowGrenade();
    this.weaponReturnDelay = 0;
    this.streakCall = this.beginDeviceHolster({
      type,
      age: 0,
      progress: 0,
      committed: false,
      timing,
    });
    this.fireLock = true;
    return true;
  }

  clearStreakCall(immediate = false) {
    const endedCall = this.streakCall;
    this.streakCall = null;
    if (!immediate) {
      if (endedCall) this.queueWeaponReturn(0.16);
      return;
    }
    this.weaponReturnDelay = 0;
    this.casTabletView.blend = 0;
    this.casTabletView.root.visible = false;
    this.uavRadioView.blend = 0;
    this.uavRadioView.root.visible = false;
  }

  /** Delay the rifle until the device has left frame, then play the rising half
   * of the normal weapon-switch animation. A live TV missile keeps this queued
   * until its camera hands control back to the player. */
  queueWeaponReturn(delay = 0.16) {
    if (!this.player.alive || this.mode !== 'playing') return;
    this.weaponReturnDelay = Math.max(this.weaponReturnDelay, delay);
  }

  updateWeaponReturn(dt) {
    if (this.weaponReturnDelay <= 0) return;
    this.weaponReturnDelay = Math.max(0, this.weaponReturnDelay - dt);
    if (this.weaponReturnDelay > 0) return;
    if (this.tvMissile || this.casTargeting || this.firebombTargeting
      || this.streakCall
      || this.grenadeSelected || this.grenadePinAt > 0 || this.grenadeView.throwing) {
      this.weaponReturnDelay = 0.05;
      return;
    }
    if (!this.player.alive || this.mode !== 'playing') return;
    this.viewModel.holder.visible = true;
    this.viewModel.drawCurrent();
    this.fireLock = true;
  }

  updateStreakCall(dt) {
    const call = this.streakCall;
    if (!call) return;
    if (!this.player.alive || this.mode === 'dead' || this.mode === 'gameover') {
      this.clearStreakCall();
      return;
    }
    if (this.updateDeviceHolster(call, dt)) return;

    call.age += dt;
    call.progress = clamp(call.age / call.timing.duration, 0, 1);
    if (call.type === 'juggernaut' && !call.operatorVoiceAttempted) {
      call.operatorVoiceAttempted = true;
      this.playOperatorVoice({
        action: 'juggernaut',
        actorId: this.gameType === 'pvp' ? this.pvp.playerId : 'player',
        speakerName: this.player.name,
        team: this.player.team,
      });
    }
    if (call.type === 'strike' && !call.voiceQueued && call.age >= 0.3) {
      call.voiceQueued = true;
      this.playStreakVoice('tv_missile_inbound');
    }
    if (!call.committed && call.age >= call.timing.commit) {
      call.committed = true;
      this.audio.uiClick();
      if (call.type === 'uav') {
        if (this.gameType === 'pvp') {
          this.pvp.useAbility('uav');
        } else if (this.uav.charges > 0 && this.uav.time <= 0) {
          this.uav.charges--;
          this.uav.time = UAV_DURATION_SECONDS;
          this.uav.ping = UAV_FIRST_SWEEP_SECONDS;
          this.spawnLocalUavDrone(this.player.team, 'player');
          this.playStreakVoice('uav_inbound');
          this.hud.banner('UAV ONLINE', '', 2.0, '#7de08a');
        }
      } else if (call.type === 'strike') {
        if (this.gameType === 'pvp') {
          // The server owns the charge and final flight. The local warhead is
          // prediction so the tablet can fade into its camera without one RTT.
          this.pvp.useAbility('strike');
          this.beginTvMissile({ authoritative: true });
        } else if (this.strikeCharges > 0) {
          this.strikeCharges--;
          this.beginTvMissile();
        }
      } else if (call.type === 'juggernaut') {
        if (this.gameType === 'pvp') {
          this.pvp.useAbility('juggernaut');
        } else if (this.juggernautCharges > 0) {
          this.juggernautCharges--;
          this.spawnJuggernautAirdrop({
            target: this.player.position.clone(),
            yaw: this.player.yaw,
          });
          this.playStreakVoice('juggernaut_inbound');
          this.hud.banner('AW101 INBOUND', '', 2.4, '#e5d788');
        }
      } else if (call.type === 'attack_helicopter') {
        if (this.gameType === 'pvp') {
          this.pvp.useAbility('attack_helicopter');
        } else if (this.attackHelicopterCharges > 0) {
          this.attackHelicopterCharges--;
          const helicopter = this.spawnAttackHelicopter({
            id: `apache-pve-${Math.floor(this.time * 1000)}`,
            ownerId: 'player',
            team: this.player.team,
            call: this.player.position.toArray(),
            entryYaw: this.player.yaw + Math.PI,
            age: 0,
            pvp: false,
          });
          call.voiceConfirmed = Boolean(helicopter);
          call.voiceSeed = randomStreakVoiceSeed();
          this.hud.banner(
            'ATTACK HELICOPTER ONLINE',
            '',
            2.4,
            '#ffb35a'
          );
        }
      }
    }
    if (call.age >= call.timing.duration) {
      if (call.type === 'attack_helicopter' && call.voiceConfirmed) {
        this.playStreakVoice(
          'attack_helicopter_inbound',
          call.voiceSeed ?? randomStreakVoiceSeed()
        );
      }
      this.clearStreakCall();
    }
  }

  /* ---------------------------------------------------- TV-guided missile */

  /**
   * Enter the warhead camera. The player's body stays where it is and stays
   * killable - that exposure is what the streak costs.
   */
  beginTvMissile({ authoritative = false } = {}) {
    if (this.tvMissile) return false;
    const missile = createTvMissile({
      ownerId: 'player',
      team: this.player.team,
      groundY: 0,
      yaw: this.player.yaw,
    });
    const model = this.buildMissileModel();
    // The camera sits in the nose, so the operator would be staring at the
    // inside of their own warhead.
    model.visible = false;
    this.scene.add(model);
    this.tvMissile = {
      state: missile,
      model,
      authoritative,
      wantYaw: missile.yaw,
      wantPitch: missile.pitch,
      smokeT: 0,
    };
    this.pvpMissileBoostQueued = false;
    this.stowGrenade();
    if (!authoritative) {
      this.hud.banner('MISSILE AWAY', '', 1.6, '#ff5b4c');
    }
    this.audio.strikeLaunch();
    return true;
  }

  endTvMissile() {
    if (!this.tvMissile) return;
    this.scene.remove(this.tvMissile.model);
    this.tvMissile.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.tvMissile = null;
    this.pvpMissileBoostQueued = false;
    this.queueWeaponReturn(0.08);
  }

  /**
   * Fly the local missile. In PVP this is prediction only - the authoritative
   * pose arrives in the snapshot and overwrites it - but single-player runs the
   * identical module, so the two never drift apart in feel.
   */
  updateTvMissile(dt) {
    const tv = this.tvMissile;
    if (!tv) return;
    const state = tv.state;
    if (tv.authoritative) state.time = (state.time || 0) + dt;
    const result = tv.authoritative
      ? 'flying'   // the server owns the outcome; we only render toward it
      : advanceTvMissile(state, dt, (origin, direction, distance) =>
        this.castGrenadeWorld(origin, direction, distance), 0, this.level.bounds);

    tv.model.position.copy(state.position);
    tv.smokeT -= dt;
    if (tv.smokeT <= 0) {
      tv.smokeT = 0.04;
      const back = tvMissileDirection(state, this._v2).clone().negate();
      this.effects.muzzleSmoke(this._v1.copy(state.position).addScaledVector(back, 1.4), back);
    }
    if (result !== 'flying') {
      const at = state.position.clone();
      this.endTvMissile();
      this.explodeLocalStrikeAt(at);
    }
  }

  explodeLocalStrikeAt(at) {
    if (this.gameType === 'pvp') this.explodeStrikeVisual(at);
    else this.explodeStrike(at);
  }

  /** Put the render camera in the warhead's nose. */
  applyTvMissileCamera() {
    const tv = this.tvMissile;
    if (!tv) return;
    const state = tv.state;
    syncTvMissileControlFrame(state);
    this.camera.position.copy(state.position);
    const forward = tvMissileDirection(state, this._v1);
    this.camera.up.copy(tvMissileCameraUp(state, this._v2));
    this.camera.lookAt(this._v3.copy(state.position).add(forward));
    // `lookAt` has already baked the stabilised up vector into the quaternion;
    // restore the normal camera convention for menus and the player view.
    this.camera.up.set(0, 1, 0);
  }

  /**
   * Mouse deltas turn the missile during this frame only. Its resulting
   * authoritative-friendly heading is sent to PVP; zero deltas hold heading.
   */
  steerTvMissileFromMouse(dx, dy, dt) {
    const tv = this.tvMissile;
    if (!tv) return;
    const sens = this.settings.sensitivity * 0.0022;
    if (!applyTvMissileMouseSteering(tv.state, dx, dy, sens, dt)) return;
    tv.wantYaw = tv.state.yaw;
    tv.wantPitch = tv.state.pitch;
  }

  triggerTvMissileTerminalBoost() {
    const tv = this.tvMissile;
    if (!tv || !triggerTvMissileBoost(tv.state)) return false;
    if (tv.authoritative) this.pvpMissileBoostQueued = true;
    this.hud.notice('TERMINAL BOOST');
    return true;
  }

  explodeStrike(at) {
    this.explodeStrikeVisual(at);

    // blast damage: enemies and the shooter's own body, teammates spared.
    // Quadratic falloff - a lethal core with a survivable outer rim.
    const R = STRIKE_RADIUS;
    for (const a of this.actors()) {
      if (!a.alive) continue;
      if (a !== this.player && a.team === this.player.team) continue;
      const d = Math.hypot(a.position.x - at.x, a.position.y + 1.0 - at.y, a.position.z - at.z);
      if (d > R) continue;
      const u = 1 - d / R;
      const dmg = 20 + 300 * u * u;
      if (a === this.player) {
        this.player.takeDamage(
          loadoutExplosiveDamage(this.loadout, dmg),
          at,
          { name: 'YOUR STRIKE' }
        );
      } else {
        const dir = new THREE.Vector3().subVectors(a.position, at).setY(0).normalize();
        const killed = a.hit(dmg, dir, 'chest', this.player);
        if (killed) this.onActorKilled(this.player, a, { id: 'strike' }, false, 0);
      }
    }
  }

  explodeStrikeVisual(at) {
    this.audio.explosion(at);
    this.strikeFlash.position.set(at.x, at.y + 2.5, at.z);
    this.strikeFlash.intensity = 150;
    const up = this._v2.set(0, 1, 0);
    // the fireball, debris and smoke column
    this.effects.explosion(at, 1.5);
    // secondary dust hits pattering down around the crater
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU, rr = 3 + Math.sqrt(Math.random()) * 9;
      this.effects.impact(
        this._v1.set(at.x + Math.cos(a) * rr, at.y + rand(0.1, 1.2), at.z + Math.sin(a) * rr),
        up, i % 3 === 0 ? 'metal' : 'concrete', rand(1.2, 2.2));
    }

    // concussion: hard camera shake, screen flash and a body punch that
    // scales with how close the blast landed
    const pd = this.player.position.distanceTo(at);
    if (pd < 110 && this.player.alive) {
      const k = clamp(1 - pd / 110, 0, 1);
      this.player.recoilPitch.kick(rand(-1, 1) * 2.6 * k);
      this.player.recoilYaw.kick(rand(-1, 1) * 1.8 * k);
      this.player.hurtRoll.kick(rand(-3.4, 3.4) * k);
      this.player.landDip.kick(-6.5 * k);
      this.player.punch.kick(7 * k);
      this.flashTimer = Math.max(this.flashTimer || 0, 0.24 * k);
    }
  }

  /* --------------------------------------------------- close air support */

  beginCasTargeting() {
    if (!this.player.alive || this.casTargeting || this.firebombTargeting
      || this.tvMissile
      || !loadoutHasStreak(this.loadout, 'cas')
      || this.streakCall || this.casCharges <= 0 || this.grenadePinAt > 0) return false;
    this.stowGrenade();
    this.weaponReturnDelay = 0;
    preloadA10Model();

    const forward = this.camera.getWorldDirection(new THREE.Vector3()).setY(0);
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    const bounds = this.level.bounds;
    const cursor = this.player.position.clone().addScaledVector(forward, 28);
    cursor.x = clamp(cursor.x, -bounds.x + 10, bounds.x - 10);
    cursor.z = clamp(cursor.z, -bounds.z + 10, bounds.z - 10);
    this.casTargeting = this.beginDeviceHolster({
      phase: 'start',
      cursor: { x: cursor.x, z: cursor.z },
      start: null,
      end: null,
      bounds: { x: bounds.x, z: bounds.z },
      width: CAS_RUN_WIDTH,
      px: this.player.position.x,
      pz: this.player.position.z,
      yaw: this.player.yaw,
      enemies: [],
      scanT: 0,
    });
    this.fireLock = true;
    this.hud.banner('CLOSE AIR SUPPORT', '', 1.8, '#ff9f55');
    this.audio.uiClick();
    return true;
  }

  cancelCasTargeting(notice = false) {
    if (!this.casTargeting) return;
    this.casTargeting = null;
    this.casTabletView.blend = 0;
    this.casTabletView.root.visible = false;
    if (!this.tvMissile && !this.grenadeSelected
      && this.grenadePinAt <= 0 && !this.grenadeView.throwing
      && !this.streakCall) {
      this.viewModel.holder.visible = !this.viewModel.scoped;
    }
    this.fireLock = true;
    this.queueWeaponReturn(0.16);
    if (notice) this.hud.notice('AIR SUPPORT TARGETING CANCELLED');
  }

  updateCasTargetingInput(input, dt = 0) {
    const targeting = this.casTargeting;
    if (!targeting) return;
    // Mouse motion and clicks belong to the weapon-lowering animation until
    // the tablet is actually in the player's hands.
    if (targeting.entering) return;
    targeting.px = this.player.position.x;
    targeting.pz = this.player.position.z;
    targeting.yaw = this.player.yaw;
    targeting.scanT = (targeting.scanT || 0) - dt;
    if (targeting.scanT <= 0) {
      targeting.scanT = 0.5;
      const actors = this.gameType === 'pvp'
        ? [...this.pvpRemotes.values()]
        : this.bots;
      targeting.enemies = actors
        .filter((actor) => actor.alive && actor.team !== this.player.team)
        .map((actor) => ({ x: actor.position.x, z: actor.position.z }));
    }
    const speed = 0.052 * clamp(this.settings.sensitivity, 0.2, 3);
    targeting.cursor.x = clamp(
      targeting.cursor.x + input.dx * speed,
      -targeting.bounds.x + 2,
      targeting.bounds.x - 2
    );
    targeting.cursor.z = clamp(
      targeting.cursor.z + input.dy * speed,
      -targeting.bounds.z + 2,
      targeting.bounds.z - 2
    );

    if (targeting.phase === 'end') {
      const plan = normalizeCasPlan(targeting.start, targeting.cursor, targeting.bounds);
      if (plan) {
        targeting.start = plan.start;
        targeting.end = plan.end;
        targeting.cursor = { ...plan.end };
      }
    }

    if (input.mousePressed(2)) {
      this.cancelCasTargeting(true);
      return;
    }
    if (!input.mousePressed(0)) return;

    if (targeting.phase === 'start') {
      targeting.start = { ...targeting.cursor };
      targeting.end = { ...targeting.start };
      targeting.cursor = { ...targeting.start };
      targeting.phase = 'end';
      this.hud.notice(`SELECT ATTACK END  //  MAX ${CAS_RUN_LENGTH}M`);
      this.audio.uiClick();
      return;
    }

    const plan = normalizeCasPlan(targeting.start, targeting.end || targeting.cursor, targeting.bounds);
    if (!plan) return;
    this.confirmCasPlan(plan);
  }

  confirmCasPlan(plan) {
    if (!this.casTargeting || this.casCharges <= 0) return;
    this.casTargeting = null;
    this.fireLock = true;
    if (this.gameType === 'pvp') {
      this.pvp.useAbility('cas', {
        start: [plan.start.x, plan.start.z],
        end: [plan.end.x, plan.end.z],
      });
      // Optimistic inventory only prevents a double request. The next
      // authoritative snapshot supplies the real charge count.
      this.casCharges = Math.max(0, this.casCharges - 1);
      this.pvpCasPending = true;
      this.pvpCasPendingUntil = this.time + 2.5;
    } else {
      this.casCharges--;
      const run = this.spawnCasRun({
        id: `cas-pve-${Math.floor(this.time * 1000)}-${Math.floor(Math.random() * 10000)}`,
        ownerId: 'player',
        team: this.player.team,
        start: plan.start,
        end: plan.end,
        seed: (Math.random() * 0x100000000) >>> 0,
        age: 0,
        pvp: false,
      });
      if (run) this.scheduleStreakVoice('cas_inbound', 0.2);
    }
    if (this.gameType !== 'pvp') {
      this.hud.banner('PRECISION AIRSTRIKE', '', 2.1, '#ff9f55');
    }
    this.audio.uiClick();
    this.queueWeaponReturn(0.16);
  }

  spawnCasRun(data) {
    if (!data?.id) return null;
    const existing = this.casRuns.get(data.id);
    const age = Math.max(0, Number(data.age) || 0);
    if (existing) {
      existing.age = Math.max(existing.age, age);
      return existing;
    }
    const start = Array.isArray(data.start)
      ? { x: Number(data.start[0]), z: Number(data.start[1]) }
      : { x: Number(data.start?.x), z: Number(data.start?.z) };
    const end = Array.isArray(data.end)
      ? { x: Number(data.end[0]), z: Number(data.end[1]) }
      : { x: Number(data.end?.x), z: Number(data.end?.z) };
    if (![start.x, start.z, end.x, end.z].every(Number.isFinite)) return null;

    const roots = Array.from({ length: CAS_PASS_COUNT }, () => {
      const root = createA10Visual();
      root.visible = false;
      this.scene.add(root);
      return root;
    });
    let nextVisualRound = 0;
    while (nextVisualRound < CAS_ROUNDS && casRoundTime(nextVisualRound) <= age) {
      nextVisualRound++;
    }
    const run = {
      id: data.id,
      ownerId: data.ownerId || null,
      team: data.team || 'blue',
      start,
      end,
      seed: Number(data.seed) >>> 0,
      age,
      pvp: data.pvp === true,
      root: roots[0],
      roots,
      nextVisualRound,
      smokeT: Array(CAS_PASS_COUNT).fill(0),
      flashT: Array(CAS_PASS_COUNT).fill(0),
      flybyPlayed: Array(CAS_PASS_COUNT).fill(false),
      engineStarted: Array(CAS_PASS_COUNT).fill(false),
      engineFinished: Array(CAS_PASS_COUNT).fill(false),
      cannonPlayed: Array(CAS_PASS_COUNT).fill(false),
      enemyKills: 0,
      outcomeVoicePlayed: false,
      seenAt: this.time,
    };
    this.casRuns.set(run.id, run);
    return run;
  }

  removeCasRun(run) {
    if (!run) return;
    for (let pass = 0; pass < CAS_PASS_COUNT; pass++) {
      this.audio.stopManagedLoop(`cas:${run.id}:${pass}`, 0.9);
    }
    for (const root of run.roots || [run.root]) releaseA10Visual(root);
    this.casRuns.delete(run.id);
  }

  clearCasRuns() {
    for (const run of [...this.casRuns.values()]) this.removeCasRun(run);
    this.casRuns.clear();
    this.cancelCasTargeting(false);
    this.pvpCasPending = false;
    this.pvpCasPendingUntil = 0;
  }

  syncPvpCasRuns(states) {
    const seen = new Set();
    for (const state of states || []) {
      seen.add(state.id);
      const startedAt = this.pvp.clientEpochForServerTime(
        Number(state.startedAt),
        Date.now()
      );
      const age = Math.max(0, (Date.now() - startedAt) / 1000);
      const run = this.spawnCasRun({ ...state, age, pvp: true });
      if (run) run.seenAt = this.time;
    }
    for (const run of [...this.casRuns.values()]) {
      if (!run.pvp || seen.has(run.id)) continue;
      // An event can lead its first binary snapshot by one frame.
      if (this.time - run.seenAt > 0.35) this.removeCasRun(run);
    }
  }

  updateCasRuns(dt) {
    const tabletCall = this.streakCall?.type === 'strike'
      && !this.streakCall.entering ? this.streakCall : null;
    const readyCasTargeting = this.casTargeting && !this.casTargeting.entering
      ? this.casTargeting
      : null;
    const readyFirebombTargeting = this.firebombTargeting
      && !this.firebombTargeting.entering
      ? this.firebombTargeting
      : null;
    const casScreenTargeting = readyCasTargeting
      ? (() => {
        const end = readyCasTargeting.end || readyCasTargeting.cursor;
        const length = readyCasTargeting.start && end
          ? Math.hypot(
            end.x - readyCasTargeting.start.x,
            end.z - readyCasTargeting.start.z
          )
          : 0;
        return {
          ...readyCasTargeting,
          length,
          maxLength: CAS_RUN_LENGTH,
          width: CAS_RUN_WIDTH,
        };
      })()
      : null;
    const tabletPress = tabletCall
      ? clamp(
        (tabletCall.age - (tabletCall.timing.commit - 0.17)) / 0.34,
        0,
        1
      )
      : 0;
    this.casTabletView.update(
      dt,
      Boolean(readyCasTargeting || readyFirebombTargeting || tabletCall),
      readyCasTargeting?.phase || (readyFirebombTargeting ? 'end' : 'launch'),
      tabletPress,
      casScreenTargeting
        ? {
          mode: 'cas',
          targeting: casScreenTargeting,
        }
        : readyFirebombTargeting
          ? {
            mode: 'firebomb',
            targeting: readyFirebombTargeting,
          }
        : tabletCall
          ? {
            mode: 'missile',
            device: {
              progress: tabletCall.progress,
              committed: tabletCall.committed,
            },
          }
          : null
    );
    const radioCall = (this.streakCall?.type === 'uav'
      || this.streakCall?.type === 'juggernaut'
      || this.streakCall?.type === 'attack_helicopter')
      && !this.streakCall.entering ? this.streakCall : null;
    this.uavRadioView.update(dt, Boolean(radioCall), radioCall?.progress || 0, {
      moveSpeed: this.player.speed2D,
      sprinting: this.player.sprinting,
      grounded: this.player.grounded,
    });

    for (const run of [...this.casRuns.values()]) {
      run.age += dt;
      if (run.age > CAS_FLIGHT_SECONDS + 0.2) {
        this.removeCasRun(run);
        continue;
      }

      for (let pass = 0; pass < CAS_PASS_COUNT; pass++) {
        const root = run.roots[pass];
        const pose = casFlightPose(run, run.age, pass);
        const flash = root.userData.muzzleFlash;
        run.flashT[pass] = Math.max(0, run.flashT[pass] - dt);
        if (flash) {
          flash.visible = run.flashT[pass] > 0;
          flash.material.opacity = clamp(run.flashT[pass] / 0.055, 0, 1);
        }
        root.visible = pose.visible;
        const engineId = `cas:${run.id}:${pass}`;
        if (!pose.visible) {
          if (run.engineStarted[pass] && !run.engineFinished[pass]) {
            run.engineFinished[pass] = true;
            this.audio.stopManagedLoop(engineId, 0.9);
          }
          continue;
        }

        const position = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z);
        const direction = new THREE.Vector3(
          pose.direction.x, pose.direction.y, pose.direction.z
        ).normalize();
        root.position.copy(position);
        root.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
        root.rotateX(pose.roll || 0);
        if (!run.engineStarted[pass]) {
          run.engineStarted[pass] = true;
          this.audio.startManagedLoop(engineId, 'casFlyby', {
            gain: 0.92,
            pos: position,
            maxDistance: 700,
            fadeIn: 0.48,
            loop: true,
            offset: run.age,
          });
        } else {
          this.audio.updateManagedLoop(engineId, {
            gain: 0.92,
            pos: position,
            maxDistance: 700,
          });
        }
        run.smokeT[pass] -= dt;
        if (run.smokeT[pass] <= 0) {
          run.smokeT[pass] = 0.075;
          const back = direction.clone().negate();
          const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
          for (const sign of [-1, 1]) {
            const exhaust = position.clone()
              .addScaledVector(direction, -3.4)
              .addScaledVector(side, sign * 1.35);
            this.effects.muzzleSmoke(exhaust, back);
          }
        }
      }

      while (run.nextVisualRound < CAS_ROUNDS
        && run.age >= casRoundTime(run.nextVisualRound)) {
        this.renderCasRound(run, run.nextVisualRound);
        run.nextVisualRound++;
      }
      if (!run.pvp && !run.outcomeVoicePlayed
        && run.nextVisualRound >= CAS_ROUNDS
        && run.age >= casRoundTime(CAS_ROUNDS - 1) + 0.2) {
        run.outcomeVoicePlayed = true;
        this.playStreakVoice(casOutcomeVoiceCue(run.enemyKills));
      }
    }
  }

  renderCasRound(run, index) {
    const impact2 = casImpactPoint(run, index);
    if (!impact2) return;
    const at = new THREE.Vector3(
      impact2.x,
      this.groundYAt(impact2.x, impact2.z) + 0.04,
      impact2.z
    );
    const pass = casRoundPass(index);
    const pose = casFlightPose(run, casRoundTime(index), pass);
    if (!pose.position || !pose.direction) return;
    const direction = new THREE.Vector3(
      pose.direction.x, pose.direction.y, pose.direction.z
    ).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      direction
    );
    orientation.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        pose.roll || 0
      )
    );
    // The tracer begins at the GAU-8 aperture in local aircraft space. It is
    // never spawned below the fuselage or at the ground impact point.
    const muzzle = new THREE.Vector3(8.55, -0.34, 0)
      .applyQuaternion(orientation)
      .add(new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z));
    this.effects.tracer(
      muzzle,
      at,
      index % 3 === 0 ? 0xffffff : 0xffe2a1,
      2.8,
      0.16
    );
    this.effects.cannonImpact(at);
    run.flashT[pass] = 0.055;
    if (!run.cannonPlayed[pass]) {
      run.cannonPlayed[pass] = true;
      this.audio.casCannon(muzzle);
    }
    if (index % 5 === 0) this.audio.casImpact(at);

    this.strikeFlash.position.copy(at).add(new THREE.Vector3(0, 1.2, 0));
    this.strikeFlash.intensity = Math.max(this.strikeFlash.intensity, 24);
    const distance = this.player.position.distanceTo(at);
    if (distance < 34 && this.player.alive) {
      const kick = clamp(1 - distance / 34, 0, 1);
      this.player.recoilPitch.kick(rand(-0.28, 0.28) * kick);
      this.player.recoilYaw.kick(rand(-0.20, 0.20) * kick);
      this.player.hurtRoll.kick(rand(-0.34, 0.34) * kick);
      this.player.punch.kick(0.7 * kick);
    }
    if (!run.pvp) this.applyLocalCasImpact(run, at);
  }

  applyLocalCasImpact(run, at) {
    let hit = false;
    let killedAny = false;
    for (const actor of this.actors()) {
      if (!actor.alive) continue;
      if (actor !== this.player && actor.team === run.team) continue;
      const targetPoint = actor.position.clone().add(new THREE.Vector3(0, 0.9, 0));
      const distance = targetPoint.distanceTo(at);
      const damage = casDamage(distance);
      if (damage <= 0) continue;
      hit = true;
      if (actor === this.player) {
        const killed = this.player.takeDamage(
          loadoutExplosiveDamage(this.loadout, damage),
          at,
          {
          id: 'player',
          name: 'YOUR A-10',
          team: this.player.team,
          }
        );
        if (killed) this.onPlayerKilled(this.player, { id: 'cas' });
        killedAny ||= killed;
        continue;
      }
      const beforeHealth = actor.health;
      const beforeArmor = actor.armor;
      const direction = actor.position.clone().sub(at).setY(0).normalize();
      const killed = actor.hit(damage, direction, 'chest', this.player);
      this.hud.damageNumber(targetPoint, damage, false);
      this.rememberEnemyHudDamage(actor, beforeHealth, beforeArmor);
      if (killed) this.onActorKilled(this.player, actor, { id: 'cas' }, false, distance);
      if (killed && actor.team !== run.team) run.enemyKills++;
      killedAny ||= killed;
    }
    if (hit) this.hud.hit(killedAny ? 'kill' : 'hit');
  }

  /* ---------------------------------------------- incendiary B-2 airstrike */

  beginFirebombTargeting() {
    if (!this.player.alive || this.firebombTargeting || this.casTargeting
      || this.tvMissile || this.streakCall
      || !loadoutHasStreak(this.loadout, 'firebomb')
      || this.firebombCharges <= 0 || this.grenadePinAt > 0) {
      return false;
    }
    this.stowGrenade();
    this.weaponReturnDelay = 0;
    preloadB2Model();
    const bounds = this.level.bounds;
    const forward = this.camera.getWorldDirection(new THREE.Vector3()).setY(0);
    const desiredZ = this.player.position.z
      + (forward.lengthSq() > 0.001 ? forward.normalize().z * 24 : 0);
    const plan = normalizeFirebombPlan(desiredZ, bounds);
    if (!plan) return false;
    this.firebombTargeting = this.beginDeviceHolster({
      phase: 'line',
      cursor: { x: 0, z: plan.start.z },
      start: plan.start,
      end: plan.end,
      bounds: { x: bounds.x, z: bounds.z },
      blastRadius: FIREBOMB_BLAST_RADIUS,
      bombCount: FIREBOMB_BOMB_COUNT,
      px: this.player.position.x,
      pz: this.player.position.z,
      yaw: this.player.yaw,
      enemies: [],
      scanT: 0,
    });
    this.fireLock = true;
    this.hud.banner(
      'INCENDIARY AIRSTRIKE',
      '',
      1.8,
      '#ff8a45'
    );
    this.audio.uiClick();
    return true;
  }

  cancelFirebombTargeting(notice = false) {
    if (!this.firebombTargeting) return;
    this.firebombTargeting = null;
    this.casTabletView.blend = 0;
    this.casTabletView.root.visible = false;
    this.fireLock = true;
    this.queueWeaponReturn(0.16);
    if (notice) this.hud.notice('INCENDIARY TARGETING CANCELLED');
  }

  updateFirebombTargetingInput(input, dt = 0) {
    const targeting = this.firebombTargeting;
    if (!targeting || targeting.entering) return;
    targeting.px = this.player.position.x;
    targeting.pz = this.player.position.z;
    targeting.yaw = this.player.yaw;
    targeting.scanT = (targeting.scanT || 0) - dt;
    if (targeting.scanT <= 0) {
      targeting.scanT = 0.5;
      const actors = this.gameType === 'pvp'
        ? [...this.pvpRemotes.values()]
        : this.bots;
      targeting.enemies = actors
        .filter((actor) => actor.alive && actor.team !== this.player.team)
        .map((actor) => ({ x: actor.position.x, z: actor.position.z }));
    }
    const speed = 0.052 * clamp(this.settings.sensitivity, 0.2, 3);
    const plan = normalizeFirebombPlan(
      targeting.cursor.z + input.dy * speed,
      targeting.bounds
    );
    if (plan) {
      targeting.cursor.z = plan.start.z;
      targeting.start = plan.start;
      targeting.end = plan.end;
    }
    if (input.mousePressed(2)) {
      this.cancelFirebombTargeting(true);
      return;
    }
    if (input.mousePressed(0) && plan) this.confirmFirebombPlan(plan);
  }

  confirmFirebombPlan(plan) {
    if (!this.firebombTargeting || this.firebombCharges <= 0) return;
    this.firebombTargeting = null;
    this.fireLock = true;
    if (this.gameType === 'pvp') {
      this.pvp.useAbility('firebomb', { z: plan.start.z });
      this.firebombCharges = Math.max(0, this.firebombCharges - 1);
      this.pvpFirebombPending = true;
      this.pvpFirebombPendingUntil = this.time + 2.5;
    } else {
      this.firebombCharges--;
      const run = this.spawnFirebombRun({
        id: `firebomb-pve-${Math.floor(this.time * 1000)}-${Math.floor(Math.random() * 10000)}`,
        ownerId: 'player',
        team: this.player.team,
        start: plan.start,
        end: plan.end,
        age: 0,
        pvp: false,
      });
      if (run) this.scheduleStreakVoice('firebomb_inbound', 0.2);
    }
    if (this.gameType !== 'pvp') {
      this.hud.banner(
        'INCENDIARY AIRSTRIKE INBOUND',
        '',
        2.2,
        '#ff8a45'
      );
    }
    this.audio.uiClick();
    this.queueWeaponReturn(0.16);
  }

  spawnFirebombRun(data) {
    if (!data?.id) return null;
    const existing = this.firebombRuns.get(data.id);
    const age = Math.max(0, Number(data.age) || 0);
    if (existing) {
      existing.age = Math.max(existing.age, age);
      return existing;
    }
    const start = Array.isArray(data.start)
      ? { x: Number(data.start[0]), z: Number(data.start[1]) }
      : { x: Number(data.start?.x), z: Number(data.start?.z) };
    const end = Array.isArray(data.end)
      ? { x: Number(data.end[0]), z: Number(data.end[1]) }
      : { x: Number(data.end?.x), z: Number(data.end?.z) };
    if (![start.x, start.z, end.x, end.z].every(Number.isFinite)) return null;

    const root = createB2Visual();
    root.visible = false;
    this.scene.add(root);
    const bombBatch = createFirebombBombBatch(FIREBOMB_BOMB_COUNT);
    this.scene.add(bombBatch.root);
    const bombs = Array.from({ length: FIREBOMB_BOMB_COUNT }, (_, index) => {
      const point = firebombImpactPoint({ start, end }, index);
      return {
        point,
        groundY: point ? this.groundYAt(point.x, point.z) + 0.04 : 0,
        preparedModel: null,
      };
    });
    let nextVisualImpact = 0;
    const timeline = { start, end };
    while (nextVisualImpact < FIREBOMB_BOMB_COUNT
      && firebombImpactTime(timeline, nextVisualImpact) <= age) {
      nextVisualImpact++;
    }
    const run = {
      id: data.id,
      ownerId: data.ownerId || null,
      team: data.team || 'blue',
      start,
      end,
      age,
      pvp: data.pvp === true,
      root,
      bombBatch,
      bombs,
      nextVisualImpact,
      flybyPlayed: false,
      visualImpacts: new Set(),
      nextZoneToPrepare: 0,
      prewarmHandle: null,
      prewarmHandleKind: null,
      seenAt: this.time,
    };
    this.firebombRuns.set(run.id, run);
    this.audio.startManagedLoop(`bomber:${run.id}`, 'bomberFlyby', {
      gain: 0.94,
      pos: new THREE.Vector3(
        run.start.x - FIREBOMB_OFFMAP_DISTANCE,
        FIREBOMB_ALTITUDE,
        run.start.z
      ),
      maxDistance: 620,
      fadeIn: 0.85,
      loop: false,
      offset: age,
    });
    this.scheduleFirebombZonePrewarm(run);
    return run;
  }

  scheduleFirebombZonePrewarm(run) {
    if (!run || run.prewarmHandle || run.nextZoneToPrepare >= run.bombs.length) {
      return;
    }
    const prepareNext = () => {
      run.prewarmHandle = null;
      run.prewarmHandleKind = null;
      if (this.firebombRuns.get(run.id) !== run) return;
      const index = run.nextZoneToPrepare++;
      const bomb = run.bombs[index];
      if (bomb && !bomb.preparedModel && bomb.point) {
        const at = new THREE.Vector3(
          bomb.point.x,
          bomb.groundY,
          bomb.point.z
        );
        bomb.preparedModel = this.prepareIncendiaryZoneModel(
          at,
          AIRSTRIKE_INCENDIARY_KIND
        );
      }
      this.scheduleFirebombZonePrewarm(run);
    };
    if (typeof globalThis.requestIdleCallback === 'function') {
      run.prewarmHandleKind = 'idle';
      run.prewarmHandle = globalThis.requestIdleCallback(
        prepareNext,
        { timeout: 180 }
      );
    } else {
      run.prewarmHandleKind = 'timeout';
      run.prewarmHandle = globalThis.setTimeout(prepareNext, 24);
    }
  }

  removeFirebombRun(run) {
    if (!run) return;
    this.audio.stopManagedLoop(`bomber:${run.id}`, 1.15);
    if (run.prewarmHandle) {
      if (run.prewarmHandleKind === 'idle'
        && typeof globalThis.cancelIdleCallback === 'function') {
        globalThis.cancelIdleCallback(run.prewarmHandle);
      } else {
        globalThis.clearTimeout(run.prewarmHandle);
      }
      run.prewarmHandle = null;
    }
    releaseB2Visual(run.root);
    run.bombBatch?.dispose?.();
    for (const bomb of run.bombs || []) {
      this.disposeIncendiaryZoneModel(bomb.preparedModel);
      bomb.preparedModel = null;
    }
    this.firebombRuns.delete(run.id);
  }

  clearFirebombRuns() {
    for (const run of [...this.firebombRuns.values()]) this.removeFirebombRun(run);
    this.firebombRuns.clear();
    this.cancelFirebombTargeting(false);
    this.pvpFirebombPending = false;
    this.pvpFirebombPendingUntil = 0;
  }

  syncPvpFirebombRuns(states) {
    const seen = new Set();
    for (const state of states || []) {
      seen.add(state.id);
      const startedAt = this.pvp.clientEpochForServerTime(
        Number(state.startedAt),
        Date.now()
      );
      const age = Math.max(0, (Date.now() - startedAt) / 1000);
      const run = this.spawnFirebombRun({ ...state, age, pvp: true });
      if (run) run.seenAt = this.time;
    }
    for (const run of [...this.firebombRuns.values()]) {
      if (!run.pvp || seen.has(run.id)) continue;
      if (this.time - run.seenAt > 0.35) this.removeFirebombRun(run);
    }
  }

  updateFirebombRuns(dt) {
    for (const run of [...this.firebombRuns.values()]) {
      run.age += dt;
      if (run.age > firebombRunLifetimeSeconds(run)) {
        this.removeFirebombRun(run);
        continue;
      }
      const pose = firebombFlightPose(run, run.age);
      run.root.visible = pose.visible;
      if (pose.visible) {
        const direction = new THREE.Vector3(
          pose.direction.x,
          pose.direction.y,
          pose.direction.z
        ).normalize();
        run.root.position.set(
          pose.position.x,
          pose.position.y,
          pose.position.z
        );
        run.root.quaternion.setFromUnitVectors(
          new THREE.Vector3(1, 0, 0),
          direction
        );
        this.audio.updateManagedLoop(`bomber:${run.id}`, {
          gain: 0.94,
          pos: run.root.position,
          maxDistance: 620,
        });
      }
      for (let index = 0; index < run.bombs.length; index++) {
        const bomb = run.bombs[index];
        const bombPose = firebombFallingBombPose(
          run,
          index,
          run.age,
          bomb.groundY
        );
        run.bombBatch.setPose(index, {
          visible: bombPose.visible,
          position: bombPose.visible ? bombPose.position : null,
          direction: bombPose.visible ? bombPose.direction : null,
          roll: run.age * 2.4 + index,
        });
      }
      run.bombBatch.commit();
      while (run.nextVisualImpact < FIREBOMB_BOMB_COUNT
        && run.age >= firebombImpactTime(run, run.nextVisualImpact)) {
        this.renderFirebombImpact(run, run.nextVisualImpact);
        run.nextVisualImpact++;
      }
    }
  }

  renderFirebombImpact(run, index) {
    if (run.visualImpacts?.has(index)) return;
    run.visualImpacts?.add(index);
    const bomb = run.bombs?.[index];
    const point = bomb?.point || firebombImpactPoint(run, index);
    if (!point) return;
    const at = new THREE.Vector3(
      point.x,
      Number.isFinite(bomb?.groundY)
        ? bomb.groundY
        : this.groundYAt(point.x, point.z) + 0.04,
      point.z
    );
    this.audio.firebombImpact(at, index, FIREBOMB_BOMB_COUNT);
    this.effects.firebombImpact(at, index);
    this.strikeFlash.position.copy(at).add(new THREE.Vector3(0, 1.8, 0));
    this.strikeFlash.intensity = Math.max(this.strikeFlash.intensity, 96);
    if (!run.pvp) {
      this.applyLocalFirebombImpact(run, at);
      const preparedModel = bomb?.preparedModel || null;
      if (bomb) bomb.preparedModel = null;
      this.spawnIncendiaryZone({
        id: `${run.id}-fire-${index}`,
        ownerId: run.ownerId,
        team: run.team,
        kind: AIRSTRIKE_INCENDIARY_KIND,
        position: at,
        expiresAt: this.time + AIRSTRIKE_INCENDIARY_DURATION_SECONDS,
        nextDamageAt: this.time,
        pvp: false,
        preparedModel,
      });
    }
  }

  applyLocalFirebombImpact(run, at) {
    let hits = 0;
    let kills = 0;
    let brokeArmor = false;
    for (const actor of this.actors()) {
      if (!actor.alive) continue;
      if (actor !== this.player && actor.team === run.team) continue;
      const targetPoint = actor.position.clone().add(new THREE.Vector3(0, 0.9, 0));
      const distance = targetPoint.distanceTo(at);
      const occluded = actor !== this.player && firebombBlastOccluded(
        at,
        targetPoint,
        (origin, direction, maxDistance) =>
          this.castGrenadeWorld(origin, direction, maxDistance)
      );
      const damage = firebombDamage(distance, occluded);
      if (damage <= 0.01) continue;
      if (actor === this.player) {
        const killed = this.player.takeDamage(
          loadoutExplosiveDamage(this.loadout, damage),
          at,
          { id: 'player', name: 'YOUR B-2', team: this.player.team }
        );
        if (killed) this.onPlayerKilled(this.player, { id: 'firebomb' });
        continue;
      }
      const beforeHealth = actor.health;
      const beforeArmor = actor.armor;
      const direction = actor.position.clone().sub(at).setY(0);
      if (direction.lengthSq() > 1e-6) direction.normalize();
      else direction.set(0, 0, 1);
      const killed = actor.hit(damage, direction, 'chest', this.player);
      hits++;
      kills += killed ? 1 : 0;
      brokeArmor ||= beforeArmor > 0 && actor.armor <= 0;
      this.hud.damageNumber(targetPoint, damage, false);
      this.rememberEnemyHudDamage(actor, beforeHealth, beforeArmor);
      if (killed) {
        this.onActorKilled(
          this.player,
          actor,
          { id: 'firebomb' },
          false,
          distance
        );
      }
    }
    if (hits > 0) {
      this.hud.hit(kills > 0 ? 'kill' : 'hit');
      if (!kills) {
        if (brokeArmor) this.audio.armorCrack();
        else this.audio.hitmarker(false);
      }
    }
  }

  /* ---------------------------------------------------- attack helicopter */

  spawnAttackHelicopter(data) {
    if (!data?.id) return null;
    const existing = this.attackHelicopters.get(data.id);
    const age = Math.max(0, Number(data.age) || 0);
    if (existing) {
      existing.age = Math.max(existing.age, age);
      existing.targetId = data.targetId || existing.targetId;
      if (Number.isFinite(Number(data.health))) {
        existing.health = Math.max(0, Number(data.health));
        existing.alive = existing.health > 0;
      }
      return existing;
    }
    const call = Array.isArray(data.call)
      ? data.call.map(Number)
      : [Number(data.call?.x), Number(data.call?.y), Number(data.call?.z)];
    if (call.length !== 3 || !call.every(Number.isFinite)) return null;
    const team = data.team || 'blue';
    const displayTeam = team === this.player.team ? 'blue' : 'red';
    const root = createApacheVisual(displayTeam);
    root.visible = false;
    this.scene.add(root);
    const heli = {
      id: data.id,
      ownerId: data.ownerId || null,
      team,
      call,
      entryYaw: Number(data.entryYaw) || 0,
      age,
      pvp: data.pvp === true,
      targetId: data.targetId || null,
      health: Number.isFinite(Number(data.health))
        ? Math.max(0, Number(data.health))
        : ATTACK_HELICOPTER_HEALTH,
      maxHealth: ATTACK_HELICOPTER_HEALTH,
      alive: true,
      root,
      nextShotAt: ATTACK_HELICOPTER_APPROACH_SECONDS,
      burstRound: 0,
      visualYaw: null,
      seenAt: this.time,
      flybyPlayed: false,
      engineFadingOut: false,
      outboundVoicePlayed: false,
    };
    const initialPose = attackHelicopterPose(heli, age);
    if (initialPose.position && initialPose.direction) {
      heli.visualYaw = attackHelicopterYaw(
        initialPose.position,
        {
          x: initialPose.position.x + initialPose.direction.x,
          y: initialPose.position.y + initialPose.direction.y,
          z: initialPose.position.z + initialPose.direction.z,
        }
      );
    }
    heli.alive = heli.health > 0;
    this.attackHelicopters.set(heli.id, heli);
    if (initialPose.position) {
      this.audio.startManagedLoop(`attack-heli:${heli.id}`, 'helicopterLoop', {
        gain: 0.68,
        pos: initialPose.position,
        maxDistance: 430,
        fadeIn: 1.15,
        loop: true,
        offset: age,
      });
    }
    return heli;
  }

  removeAttackHelicopter(heli) {
    if (!heli) return;
    this.audio.stopManagedLoop(`attack-heli:${heli.id}`, 1.15);
    releaseApacheVisual(heli.root);
    this.attackHelicopters.delete(heli.id);
  }

  clearAttackHelicopters() {
    for (const heli of [...this.attackHelicopters.values()]) {
      this.removeAttackHelicopter(heli);
    }
    this.attackHelicopters.clear();
  }

  syncPvpAttackHelicopters(states) {
    const seen = new Set();
    for (const state of states || []) {
      seen.add(state.id);
      const startedAt = this.pvp.clientEpochForServerTime(
        Number(state.startedAt),
        Date.now()
      );
      const age = Math.max(0, (Date.now() - startedAt) / 1000);
      const heli = this.spawnAttackHelicopter({ ...state, age, pvp: true });
      if (heli) {
        heli.seenAt = this.time;
        heli.targetId = state.targetId || null;
        heli.health = Number.isFinite(Number(state.health))
          ? Math.max(0, Number(state.health))
          : heli.health;
        heli.alive = heli.health > 0;
      }
    }
    for (const heli of [...this.attackHelicopters.values()]) {
      if (!heli.pvp || seen.has(heli.id)) continue;
      if (this.time - heli.seenAt > 0.35) this.removeAttackHelicopter(heli);
    }
  }

  attackHelicopterTargetPosition(heli) {
    if (!heli?.targetId) return null;
    if (heli.pvp) {
      if (heli.targetId === this.pvp.playerId) return this.player.position;
      return this.pvpRemotes.get(heli.targetId)?.position || null;
    }
    return this.bots.find((bot) => bot.id === heli.targetId)?.position || null;
  }

  localAttackHelicopterCanTarget(heli, actor) {
    if (!actor?.alive || actor.team === heli.team) return false;
    if (!attackHelicopterTargetEligible(heli.call, actor.position)) return false;
    const targetPoint = actor.position.clone().add(new THREE.Vector3(0, 1.05, 0));
    const pose = attackHelicopterPose(heli, heli.age);
    if (!pose.position || !pose.onStation) return false;
    const origin = new THREE.Vector3(
      pose.position.x,
      pose.position.y,
      pose.position.z
    );
    const direction = targetPoint.clone().sub(origin);
    const distance = direction.length();
    if (distance <= 0.01) return true;
    direction.multiplyScalar(1 / distance);
    const hit = this.castGrenadeWorld(origin, direction, distance);
    return !hit || hit.distance >= distance - 0.25;
  }

  findLocalAttackHelicopterTarget(heli) {
    let best = null;
    let bestDistance = Infinity;
    for (const actor of this.bots) {
      if (!this.localAttackHelicopterCanTarget(heli, actor)) continue;
      const distance = actor.position.distanceToSquared(heli.root.position);
      if (distance >= bestDistance) continue;
      best = actor;
      bestDistance = distance;
    }
    return best;
  }

  updateAttackHelicopters(dt) {
    for (const heli of [...this.attackHelicopters.values()]) {
      heli.age += dt;
      const departureStarted = heli.age >= ATTACK_HELICOPTER_APPROACH_SECONDS
        + ATTACK_HELICOPTER_ON_STATION_SECONDS;
      if (departureStarted && !heli.pvp && !heli.outboundVoicePlayed
        && heli.ownerId === 'player' && heli.alive && heli.health > 0) {
        heli.outboundVoicePlayed = true;
        this.playStreakVoice('attack_helicopter_outbound');
      }
      if (departureStarted && !heli.engineFadingOut) {
        heli.engineFadingOut = true;
        this.audio.stopManagedLoop(`attack-heli:${heli.id}`, 2.8);
      }
      const timedOut = heli.age >= ATTACK_HELICOPTER_LIFETIME_SECONDS;
      if (!heli.alive || heli.health <= 0
        || timedOut) {
        this.removeAttackHelicopter(heli);
        continue;
      }
      let targetPosition = this.attackHelicopterTargetPosition(heli);
      if (heli.age >= ATTACK_HELICOPTER_APPROACH_SECONDS
        + ATTACK_HELICOPTER_ON_STATION_SECONDS) {
        heli.targetId = null;
        targetPosition = null;
      }
      const pose = attackHelicopterPose(heli, heli.age);
      heli.root.visible = pose.visible;
      if (!pose.visible) continue;
      heli.root.position.set(
        pose.position.x,
        pose.position.y,
        pose.position.z
      );
      if (!heli.engineFadingOut) {
        this.audio.updateManagedLoop(`attack-heli:${heli.id}`, {
          gain: 0.68,
          pos: heli.root.position,
          maxDistance: 430,
        });
      }
      const flightTarget = {
        x: pose.position.x + pose.direction.x,
        y: pose.position.y + pose.direction.y,
        z: pose.position.z + pose.direction.z,
      };
      const desiredYaw = targetPosition
        ? attackHelicopterYaw(pose.position, targetPosition, heli.visualYaw)
        : attackHelicopterYaw(pose.position, flightTarget, heli.visualYaw);
      if (!Number.isFinite(heli.visualYaw)) heli.visualYaw = desiredYaw;
      heli.visualYaw = turnAttackHelicopterYaw(
        heli.visualYaw,
        desiredYaw,
        dt
      );
      heli.root.rotation.set(0, heli.visualYaw, 0);
      updateApacheRotors(heli.root, pose.rotorAngle);
      if (heli.pvp || !attackHelicopterOnStation(heli.age)
        || heli.age >= ATTACK_HELICOPTER_APPROACH_SECONDS
          + ATTACK_HELICOPTER_ON_STATION_SECONDS) {
        continue;
      }
      if (heli.age < heli.nextShotAt) continue;
      let target = heli.targetId
        ? this.bots.find((actor) => actor.id === heli.targetId)
        : null;
      if (!this.localAttackHelicopterCanTarget(heli, target)) {
        target = this.findLocalAttackHelicopterTarget(heli);
        heli.targetId = target?.id || null;
        heli.burstRound = 0;
        if (target) {
          const targetPoint = target.position.clone().add(
            new THREE.Vector3(0, 1.05, 0)
          );
          const targetYaw = attackHelicopterYaw(
            heli.root.position,
            targetPoint,
            heli.visualYaw
          );
          heli.nextShotAt = heli.age
            + attackHelicopterLockDelay(heli.visualYaw, targetYaw);
          continue;
        }
      }
      if (!target) {
        heli.nextShotAt = heli.age + 0.25;
        continue;
      }
      targetPosition = target.position;
      if (!this.localAttackHelicopterCanTarget(heli, target)) {
        heli.targetId = null;
        heli.burstRound = 0;
        heli.nextShotAt = heli.age + 0.1;
        continue;
      }
      const targetPoint = target.position.clone().add(
        new THREE.Vector3(0, 1.05, 0)
      );
      const firingYaw = attackHelicopterYaw(
        heli.root.position,
        targetPoint,
        heli.visualYaw
      );
      if (Math.abs(angleDelta(heli.visualYaw, firingYaw))
        > ATTACK_HELICOPTER_FIRE_ALIGNMENT) {
        heli.nextShotAt = heli.age + 0.04;
        continue;
      }
      const killed = this.fireLocalAttackHelicopter(heli, target);
      heli.burstRound++;
      if (heli.burstRound >= ATTACK_HELICOPTER_BURST_ROUNDS) {
        heli.burstRound = 0;
        if (killed) heli.targetId = null;
        heli.nextShotAt = heli.age + ATTACK_HELICOPTER_BURST_COOLDOWN_SECONDS;
      } else {
        if (killed) {
          heli.targetId = null;
          heli.burstRound = 0;
          heli.nextShotAt = heli.age
            + ATTACK_HELICOPTER_BURST_COOLDOWN_SECONDS;
          continue;
        }
        heli.nextShotAt = heli.age + ATTACK_HELICOPTER_SHOT_INTERVAL_SECONDS;
      }
    }
  }

  fireLocalAttackHelicopter(heli, target) {
    const origin = heli.root.userData.muzzle?.getWorldPosition(new THREE.Vector3())
      || heli.root.position.clone();
    const targetPoint = target.position.clone().add(new THREE.Vector3(0, 1.05, 0));
    this.renderAttackHelicopterShot(origin, targetPoint, true);
    const beforeHealth = target.health;
    const beforeArmor = target.armor;
    const direction = target.position.clone().sub(origin).setY(0);
    if (direction.lengthSq() > 1e-6) direction.normalize();
    else direction.set(0, 0, 1);
    const killed = target.hit(
      ATTACK_HELICOPTER_DAMAGE,
      direction,
      'chest',
      this.player
    );
    this.hud.damageNumber(targetPoint, ATTACK_HELICOPTER_DAMAGE, false);
    this.rememberEnemyHudDamage(target, beforeHealth, beforeArmor);
    this.hud.hit(killed ? 'kill' : 'hit');
    if (killed) {
      this.onActorKilled(
        this.player,
        target,
        { id: 'attack_helicopter' },
        false,
        origin.distanceTo(targetPoint)
      );
    }
    return killed;
  }

  renderAttackHelicopterShot(originValue, targetValue, flesh = false) {
    const origin = originValue instanceof THREE.Vector3
      ? originValue
      : new THREE.Vector3(...originValue);
    const target = targetValue instanceof THREE.Vector3
      ? targetValue
      : new THREE.Vector3(...targetValue);
    this.effects.tracer(origin, target, 0xffd49a, 1.8, 0.12);
    const direction = target.clone().sub(origin).normalize();
    if (flesh) this.effects.blood(target, direction, 0.75);
    else this.effects.impact(target, direction.clone().negate(), 'metal', 0.85);
    this.audio.sentryShot(origin);
  }

  damageLocalAttackHelicopter(
    heli,
    hit,
    def,
    sourceScale = 1,
    attackerTeam = this.player.team
  ) {
    if (!heli?.alive || heli.team === attackerTeam) {
      return { killed: false, damage: 0 };
    }
    const fall = clamp(
      (hit.distance - def.range * 0.35) / (def.range * 0.75),
      0,
      1
    );
    const damage = def.damage
      * lerp(1, def.minDamage, fall)
      * sourceScale;
    heli.health = Math.max(0, heli.health - damage);
    const killed = heli.health <= 0;
    if (killed) {
      heli.alive = false;
      const friendly = heli.team === this.player.team;
      this.removeAttackHelicopter(heli);
      this.hud.banner(
        friendly
          ? 'ATTACK HELICOPTER DESTROYED'
          : 'ENEMY ATTACK HELICOPTER DESTROYED',
        '',
        2.4,
        friendly ? '#ff5b4c' : '#7de08a'
      );
    }
    return { killed, damage };
  }

  damageActor(shooter, hit, def, dir) {
    const actor = hit.actor;
    const fixedRailgunDamage = def.id === LASER_CANNON_ID;
    const fall = fixedRailgunDamage
      ? 0
      : clamp((hit.distance - def.range * 0.35) / (def.range * 0.75), 0, 1);
    const sourceScale = shooter.isBot ? BOT_DAMAGE : shooter.isSentry ? SENTRY_CONFIG.damageScale : 1;
    const headshot = fixedRailgunDamage ? false : characterHitIsHeadshot(actor, hit.part);
    const hitMult = fixedRailgunDamage ? 1 : characterHitMultiplier(actor, hit.part, hit.mult);
    const dmg = fixedRailgunDamage
      ? 300
      : def.damage * hitMult * lerp(1, def.minDamage, fall) * sourceScale;

    // machines spark instead of bleeding
    if (actor.isSentry) {
      this.effects.impact(hit.point, hit.normal, 'metal', 1);
      this.audio.impact('metal', hit.point);
      const killed = actor.hit(dmg);
      if (killed && shooter.isBot) {
        this.hud.pushKill({
          killer: shooter.name, victim: 'SENTRY',
          killerTeam: shooter.team, victimTeam: actor.team,
          weapon: def.id, headshot: false, highlight: true,
        });
      }
      return { killed, dmg };
    }

    this.effects.blood(hit.point, dir, headshot ? 1.4 : 1);
    if (Math.random() < 0.5) this.effects.bloodSplat(hit.point.x, hit.point.z);
    this.audio.impact('flesh', hit.point);

    let killed = false;
    let armorBroke = false;
    if (actor === this.player) {
      killed = this.player.takeDamage(dmg, shooter.position, shooter);
      if (killed) this.onPlayerKilled(shooter, def);
    } else {
      if (shooter === this.player) {
        this.hud.damageNumber(hit.point, dmg, headshot);
        actor.damagedByPlayer = { amount: (actor.damagedByPlayer?.amount || 0) + dmg, time: this.time };
      }
      const beforeHealth = actor.health;
      const beforeArmor = actor.armor;
      killed = actor.hit(dmg, dir, hit.part, shooter);
      armorBroke = !!actor.lastDamage?.armorBroke;
      if (shooter === this.player) {
        this.rememberEnemyHudDamage(actor, beforeHealth, beforeArmor);
      }
      if (killed) this.onActorKilled(shooter.isSentry ? this.player : shooter, actor, def, headshot, hit.distance);
    }
    return { killed, dmg, armorBroke };
  }

  /* ------------------------------------------------------------ scoring */

  award(amount, label) {
    this.totalScore += amount;
    this.player.score += amount;
    this.hud.pushScore(amount, label);
  }

  grantKillstreakRewards(beforeKills, afterKills) {
    const rewards = [
      {
        id: 'firebomb',
        grant: (count) => {
          this.firebombCharges += count;
          preloadB2Model();
        },
        title: 'INCENDIARY AIRSTRIKE READY',
        color: '#ff8a45',
      },
      {
        id: 'attack_helicopter',
        grant: (count) => {
          this.attackHelicopterCharges += count;
          preloadApacheModel();
        },
        title: 'ATTACK HELICOPTER READY',
        color: '#ffb35a',
      },
      {
        id: 'uav',
        grant: (count) => { this.uav.charges += count; },
        title: 'UAV READY',
        color: '#7de08a',
      },
      {
        id: LASER_CANNON_ID,
        grant: (count) => { this.railgunCharges += count; },
        title: 'LASER CANNON READY',
        color: '#ff5347',
      },
      {
        id: 'strike',
        grant: (count) => { this.strikeCharges += count; },
        title: 'MISSILE STRIKE READY',
        color: '#ffcc55',
      },
      {
        id: 'juggernaut',
        grant: (count) => {
          this.juggernautCharges += count;
          preloadTransportHelicopterModel();
        },
        title: 'JUGGERNAUT READY',
        color: '#e5d788',
      },
      {
        id: 'sentry',
        grant: (count) => { this.sentryCharges += count; },
        title: 'SENTRY GUN READY',
        color: '#8ecbff',
      },
      {
        id: 'cas',
        grant: (count) => {
          this.casCharges += count;
          preloadA10Model();
        },
        title: 'CLOSE AIR SUPPORT READY',
        color: '#ff9f55',
      },
    ];
    for (const reward of rewards) {
      if (!loadoutHasStreak(this.loadout, reward.id)) continue;
      const count = loadoutStreakCrossings(
        this.loadout,
        reward.id,
        beforeKills,
        afterKills
      );
      if (count <= 0) continue;
      reward.grant(count);
      this.hud.pushStreakReady(reward.id, reward.title, reward.color);
    }
  }

  onActorKilled(shooter, victim, def, headshot, distance) {
    victim.rig.flash(1);
    this.registerDeath(victim.team);
    this.hud.pushKill({
      killer: shooter.name, victim: victim.name,
      killerTeam: shooter.team, victimTeam: victim.team,
      weapon: def.id, headshot,
      highlight: shooter === this.player || victim === this.player,
    });
    if (shooter.kills !== undefined) shooter.kills++;

    if (shooter === this.player) {
      if (loadoutHasPassive(this.loadout, PASSIVE_IDS.PREDATORY_INSTINCT)
        && this.player.alive) {
        this.player.armor = this.player.maxArmor;
      }
      this.hud.pushKillIcon(headshot);
      // Kills scored by a reward pay points but never generate another reward.
      // never feed the next streak - no snowballing rewards off rewards
      const fromReward = def
        && (
          def.id === 'strike'
          || def.id === 'sentry'
          || def.id === 'cas'
          || def.id === 'firebomb'
          || def.id === 'attack_helicopter'
          || def.id === LASER_CANNON_ID
      );
      if (fromReward) {
        this.audio.killConfirm(false, 1);
        const rewardLabel = {
          strike: 'STRIKE KILL',
          sentry: 'SENTRY KILL',
          cas: 'A-10 KILL',
          firebomb: 'FIREBOMB KILL',
          attack_helicopter: 'HELICOPTER KILL',
          railgun: 'LASER CANNON KILL',
          railgun: 'LASER CANNON KILL',
        }[def.id] || 'KILL';
        this.award(100, rewardLabel);
        victim.damagedByPlayer = null;
        return;
      }
      // bump the multi-kill window first so the chime pitch and the kill
      // banner tally both reflect this kill
      this.multiKillTimer = 4.5;
      this.multiKillCount++;
      this.audio.killConfirm(headshot, this.multiKillCount);
      this.viewModel.resupply(0.75);
      this.award(100, 'KILL');
      if (headshot) this.award(50, 'HEADSHOT');
      if (distance > 55) this.award(30, 'MARKSMAN');
      if (victim.def && victim.def.id === 'sniper') {
        this.award(20, 'COUNTER SNIPER');
      }

      const beforeStreakKills = this.killStreak;
      this.killStreak++;
      this.streakScore = this.killStreak;
      this.grantKillstreakRewards(beforeStreakKills, this.killStreak);
      if (this.killStreak > 0 && this.killStreak % 3 === 0) {
        this.award(50, `KILLSTREAK X${this.killStreak}`);
      }
      if (this.multiKillCount === 2) this.award(50, 'DOUBLE KILL');
      else if (this.multiKillCount === 3) this.award(75, 'TRIPLE KILL');
      else if (this.multiKillCount > 3) {
        this.award(100, `MULTI KILL X${this.multiKillCount}`);
      }
    } else if (victim.damagedByPlayer && this.time - victim.damagedByPlayer.time < 10 && victim.damagedByPlayer.amount > 15) {
      this.award(30, 'KILL ASSIST');
    }
    victim.damagedByPlayer = null;
  }

  onPlayerKilled(shooter, def) {
    if (this.gameType === 'pve') {
      this.dropLocalPinnedGrenade();
      this.dropLocalMartyrdomGrenade();
    }
    this.player.deaths++;
    this.readyForActionUntil = 0;
    this.player.killedByWeapon = def ? def.id : 'rifle';
    this.killStreak = 0;
    this.streakScore = 0;
    this.multiKillCount = 0;
    this.audio.stopJuggernautBreathing();
    this.endLaserCannon({ restoreWeapon: false });
    this.endTvMissile();       // dying drops you out of the warhead camera
    this.clearStreakCall();
    this.cancelCasTargeting(false);
    this.grenadeSelected = false;
    this.grenadeThrowAiming = false;
    this.grenadeView.setSelected(false);
    this.grenadeTrajectory.hide();
    this.registerDeath(this.player.team);
    this.hud.pushKill({
      killer: shooter ? shooter.name : 'WORLD', victim: 'YOU',
      killerTeam: shooter ? shooter.team : 'red', victimTeam: 'blue',
      weapon: def ? def.id : 'gravity', headshot: false, highlight: true,
    });
    if (shooter && shooter !== this.player && shooter.kills !== undefined) shooter.kills++;
    this.respawnTimer = RESPAWN_TIME;
    this.mode = 'dead';
    this.beginActorKillerCamera(shooter);
  }

  registerDeath(team) {
    if (this.match.over) return;
    if (this.gameType === 'pve' && this.mode === 'loadout') return;
    if (team === 'blue') this.match.blueTickets = Math.max(0, this.match.blueTickets - 1);
    else this.match.redTickets = Math.max(0, this.match.redTickets - 1);
    if (this.match.blueTickets <= 0 || this.match.redTickets <= 0) {
      this.match.over = true;
      this.match.winner = this.match.blueTickets > this.match.redTickets ? 'blue' : 'red';
      this.mode = 'gameover';
      this.input.releaseLock();
    }
  }

  /* ------------------------------------------------------------- AI glue */

  findTarget(bot) {
    const eye = bot.eyePosition(new THREE.Vector3());
    const fwd = this._v1.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    const candidates = [];
    for (const a of this.actors()) {
      if (!a.alive || a.team === bot.team) continue;
      if (a === this.player && !this.playerTargetable()) continue;
      const d = a.position.distanceTo(bot.position);
      if (d > 48) continue;
      candidates.push({ a, d });
    }
    // the sentry gun is a threat worth shooting back at
    if (this.sentry && this.sentry.alive && this.sentry.team !== bot.team) {
      const d = this.sentry.position.distanceTo(bot.position);
      if (d < 48) candidates.push({ a: this.sentry, d });
    }
    candidates.sort((x, y) => x.d - y.d);
    let checked = 0;
    for (const c of candidates) {
      if (checked >= 3) break;
      const to = this._v2.subVectors(c.a.position, bot.position).setY(0);
      const dist = to.length() || 1;
      to.multiplyScalar(1 / dist);
      const facing = to.dot(fwd);
      // cone in front, plus a short "sixth sense" radius. Both are deliberately
      // tight: bots that spot you the moment you round a corner behind them
      // are the single biggest source of unfair-feeling deaths.
      if (facing < 0.1 && dist > 5) continue;
      checked++;
      const targetEye = this._v3.set(
        c.a.position.x,
        c.a.position.y + (c.a === this.player ? this.player.eyeHeight() - 0.15 : c.a.isSentry ? 0.9 : 1.4),
        c.a.position.z
      );
      if (this.hasLineOfSight(eye, targetEye)) return c.a;
    }
    return null;
  }

  hasLineOfSight(from, to) {
    const dir = this._dir.subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.2) return true;
    dir.multiplyScalar(1 / dist);
    this.raycaster.set(from, dir);
    this.raycaster.far = dist - 0.25;
    const hits = this.raycaster.intersectObjects(this.level.solids, false);
    return hits.length === 0;
  }

  /* -------------------------------------------------------- online PVP */

  showSystemDialog(title, message, button = 'CONFIRM') {
    if (!this.systemDialog) return;
    this.systemDialogOpen = true;
    this.systemDialogCopy = { title, message, button };
    this.renderSystemDialogCopy();
    this.systemDialog.hidden = false;
    this.input.releaseLock();
    this.systemDialogConfirm?.focus({ preventScroll: true });
  }

  hideSystemDialog() {
    if (!this.systemDialogOpen) return;
    this.systemDialogOpen = false;
    if (this.systemDialog) this.systemDialog.hidden = true;
    this.systemDialogConfirm?.blur();
  }

  renderSystemDialogCopy() {
    if (!this.systemDialogCopy) return;
    const { title, message, button } = this.systemDialogCopy;
    if (this.systemDialogTitle) {
      this.systemDialogTitle.textContent = localizeText(title, this.settings.language);
    }
    if (this.systemDialogMessage) {
      this.systemDialogMessage.textContent = localizeText(message, this.settings.language);
    }
    if (this.systemDialogConfirm) {
      this.systemDialogConfirm.textContent = localizeText(button, this.settings.language);
    }
  }

  handleLoadoutKey(event) {
    if (event.isComposing || event.repeat || this.systemDialogOpen || this.chatOpen) return;
    if (event.code === 'Enter' && this.mode === 'dead') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.openLoadout(false);
      return;
    }
    if (event.code === 'Enter' && this.mode === 'loadout') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.deployLoadout();
    }
  }

  handlePvpChatKey(event) {
    if (event.isComposing || event.repeat) return;
    if (this.chatOpen) {
      if (event.code === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const text = this.chatInput?.value || '';
        if (!hasPvpChatMessage(text)) {
          this.closePvpChat(true);
        } else if (this.pvp.sendChat(text)) {
          this.closePvpChat(true);
        }
      } else if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.closePvpChat(true);
      }
      return;
    }
    if (event.code !== 'Enter'
      || this.gameType !== 'pvp'
      || !this.pvp.playerId
      || (this.mode !== 'playing' && this.mode !== 'mapvote')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.openPvpChat();
  }

  openPvpChat() {
    if (this.chatOpen || !this.chatInput || !this.pvp.playerId) return;
    this.chatOpen = true;
    this.input.enabled = false;
    this.input.reset();
    this.chatLayer?.classList.add('visible');
    this.chatEntry?.classList.add('open');
    this.chatInput.value = '';
    // Keep pointer lock while typing. Releasing it used the same browser event
    // path as ESC/focus loss and could make an otherwise healthy live match
    // look disconnected. Game controls are gated by chatOpen below.
    this.sendPvpNeutralInput();
    this.chatInput.focus({ preventScroll: true });
  }

  closePvpChat(recapture = false) {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    this.chatEntry?.classList.remove('open');
    if (this.chatInput) {
      this.chatInput.value = '';
      this.chatInput.blur();
    }
    this.input.reset();
    this.input.enabled = true;
    if (recapture && this.gameType === 'pvp'
      && (this.mode === 'playing' || this.mode === 'dead')) {
      this.input.requestLock();
    }
  }

  clearPvpChat() {
    this.closePvpChat(false);
    this.chatLog?.replaceChildren();
    this.chatLayer?.classList.remove('visible');
  }

  appendPvpChat(message) {
    if (!this.chatLog || !message?.text) return;
    this.chatLayer?.classList.add('visible');
    const line = document.createElement('div');
    line.className = 'chat-line';
    if (message.system) {
      line.classList.add('system');
      line.textContent = String(message.text);
      this.chatLog.append(line);
      while (this.chatLog.children.length > 6) this.chatLog.firstElementChild?.remove();
      setTimeout(() => line.remove(), 10000);
      return;
    }
    if (message.playerId === this.pvp.playerId) line.classList.add('self');
    else if (message.team !== this.player.team) line.classList.add('enemy');
    const name = document.createElement('span');
    name.className = 'chat-name';
    name.dataset.playerName = message.name || 'PLAYER';
    name.textContent = `[${localizeText('ALL', this.settings.language)}] ${name.dataset.playerName}: `;
    line.append(name, document.createTextNode(String(message.text)));
    this.chatLog.append(line);
    while (this.chatLog.children.length > 6) this.chatLog.firstElementChild?.remove();
    setTimeout(() => line.remove(), 10000);
  }

  loadPvpName() {
    try {
      const raw = localStorage.getItem('pixelops:pvpName');
      if (raw) return sanitizePlayerName(raw);
      const generated = `PLAYER-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
      localStorage.setItem('pixelops:pvpName', generated);
      return generated;
    } catch {
      return `PLAYER-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    }
  }

  beginLinuxDoLogin() {
    this.input.releaseLock();
    window.location.assign('/auth/linuxdo');
  }

  async openPvpRooms() {
    if (this.pvpAuthPending) return;
    this.input.releaseLock();
    this.pvpAuthPending = true;
    this.pvpStatus = 'connecting';
    const auth = await this.pvp.checkAuth();
    this.pvpAuthPending = false;
    if (!auth) {
      this.pvpStatus = 'error';
      this.hud.notice('LOGIN CHECK FAILED - TRY AGAIN');
      return;
    }
    if (!auth.configured) {
      this.pvpStatus = 'error';
      this.showSystemDialog(
        'LOGIN UNAVAILABLE',
        'LINUXDO LOGIN IS NOT CONFIGURED ON THIS SERVER'
      );
      return;
    }
    if (!auth.authenticated) {
      this.beginLinuxDoLogin();
      return;
    }
    const localParams = new URLSearchParams(window.location.search);
    const localSlot = /^[A-Z]$/.test(String(localParams.get('localPlayer') || '').toUpperCase())
      ? String(localParams.get('localPlayer')).toUpperCase()
      : '';
    if (auth.localTest) {
      // The development-only launcher may open two windows from the same
      // browser installation. Give each URL its own identity even when the
      // browser would otherwise share localStorage between both windows.
      if (localSlot) {
        this.pvpName = `LOCAL-${localSlot}`;
        this.pvp.clientId = localSlot === 'A'
          ? '00000000-0000-4000-8000-00000000000a'
          : `00000000-0000-4000-8000-${localSlot.charCodeAt(0).toString(16).padStart(12, '0')}`;
      }
    } else {
      const fallback = auth.user?.id ? `LDO-${String(auth.user.id).slice(-8)}` : this.pvpName;
      this.pvpName = sanitizePlayerName(auth.user?.username, fallback);
    }
    this.mode = 'rooms';
    this.pvp.connect();
    if (auth.localTest) {
      const requestedRoom = Number(localParams.get('localRoom'));
      if (Number.isInteger(requestedRoom) && requestedRoom >= 1 && requestedRoom <= 3) {
        this.pvp.join(`room-${requestedRoom}`, this.pvpName);
      }
    }
    const checkSeq = ++this.pvpRegionCheckSeq;
    this.pvpRegionCheckPending = true;
    this.pvp.checkRegion().then((region) => {
      if (checkSeq !== this.pvpRegionCheckSeq || this.mode !== 'rooms') return;
      if (region?.outsideChina) {
        this.showSystemDialog(
          'NETWORK NOTICE',
          'PLEASE DISABLE YOUR PROXY BEFORE ENTERING A ROOM'
        );
      }
    }).finally(() => {
      if (checkSeq === this.pvpRegionCheckSeq) this.pvpRegionCheckPending = false;
    });
  }

  enterPvpRoom(message) {
    this.gameType = 'pvp';
    if (message.room?.mapId && message.room.mapId !== this.mapId) {
      this.applyMap(message.room.mapId);
    }
    this.pvpBanUntil = 0;
    this.pvpRoom = message.room;
    this.destroySentry(false);
    this.removeMissile();
    this.clearStreakCall(true);
    this.clearCasRuns();
    this.clearFirebombRuns();
    this.clearAttackHelicopters();
    for (const bot of this.bots) bot.rig.root.visible = false;
    this.clearPvpEntities();
    this.clearGrenadeProjectiles();
    this.resetGrenadeLoadout();
    this.player.team = message.team;
    this.player.name = message.name;
    // Server team ids remain authoritative. Presentation is always relative:
    // your own arms/squad are blue and the opposition is red.
    this.viewModel.setTeam('blue');
    this.player.kills = 0;
    this.player.deaths = 0;
    this.player.score = 0;
    this.viewModel.reset();
    this.viewModel.equip(this.loadout.primary, true);
    this.holdPlayerForDeployment();
    this.respawnTimer = 0;
    this.match = {
      blueTickets: 0,
      redTickets: 0,
      maxTickets: PVP_MATCH_SCORE_LIMIT,
      over: false,
      winner: null,
    };
    this.killStreak = 0;
    this.streakScore = 0;
    this.totalScore = 0;
    this.uav = { charges: 0, time: 0, ping: 0 };
    this.pvpUavSweepSeq = 0;
    this.pvpUavRevealTime = 0;
    this.pvpUavMarks = [];
    this.pvpVoteKick = null;
    this.pvpMapVote = null;
    this.pvpMapVoteResume = false;
    this.mapVoteScreen.hide();
    this.pvpVoteKickCooldown = 0;
    this.strikeCharges = 0;
    this.sentryCharges = 0;
    this.casCharges = 0;
    this.firebombCharges = 0;
    this.attackHelicopterCharges = 0;
    this.juggernautCharges = 0;
    this.railgunCharges = 0;
    this.railgunActive = false;
    this.pvpRailgunPending = false;
    this.pvpRailgunFireCommitUntil = 0;
    this.setLocalJuggernaut(false, { fill: false, equip: false });
    this.pvpCasPending = false;
    this.pvpFirebombPending = false;
    this.endTvMissile();
    this.pvpSnapshot = null;
    this.pvpReadyForActionActive = false;
    this.pvpSendAcc = 0;
    this.pvpInputSeq = 0;
    this.resetPvpPrediction();
    this.resetPvpReloadSync();
    this.resetPvpAmmoSync();
    this.hud.killfeed.length = 0;
    this.hud.clearCombatFeedback();
    this.resetDialogueState();
    this.hud.clearOperatorSubtitles();
    this.hud.banner(
      `PVP ROOM ${message.room.number}`,
      'BLUE TEAM  //  LIVE',
      2.4,
      '#8ecbff'
    );
    this.chatLog?.replaceChildren();
    this.chatLayer?.classList.add('visible');
    this.openLoadout(true);
  }

  leavePvpRoom(showRooms = true) {
    this.clearKillerCamera();
    if (this.loadoutScreen.visible) this.closeLoadout();
    this.mapVoteScreen.hide();
    this.pvpMapVote = null;
    if (this.gameType === 'pvp') this.pvp.leave();
    this.clearPvpChat();
    this.clearPvpEntities();
    this.clearGrenadeProjectiles();
    this.resetGrenadeLoadout();
    this.removeMissile();
    this.endTvMissile();
    this.clearStreakCall(true);
    this.clearCasRuns();
    this.clearFirebombRuns();
    this.clearAttackHelicopters();
    this.pvpSnapshot = null;
    this.pvpReadyForActionActive = false;
    this.pvpRoom = null;
    this.pvpOwnSentryId = null;
    this.pvpUavSweepSeq = 0;
    this.pvpUavRevealTime = 0;
    this.pvpUavMarks = [];
    this.pvpVoteKick = null;
    this.pvpVoteKickCooldown = 0;
    this.hud.clearCombatFeedback();
    this.resetDialogueState();
    this.hud.clearOperatorSubtitles();
    this.resetPvpPrediction();
    this.resetPvpReloadSync();
    this.resetPvpAmmoSync();
    this.gameType = 'pve';
    this.player.team = 'blue';
    this.setLocalJuggernaut(false, { fill: false, equip: true });
    this.viewModel.setTeam('blue');
    for (const bot of this.bots) bot.rig.root.visible = true;
    this.input.releaseLock();
    this.mode = showRooms ? 'rooms' : 'title';
    if (showRooms) this.pvp.connect();
  }

  handlePvpDisconnect() {
    if (this.gameType !== 'pvp') return;
    this.clearKillerCamera();
    if (this.loadoutScreen.visible) this.closeLoadout();
    this.mapVoteScreen.hide();
    this.pvpMapVote = null;
    this.clearPvpChat();
    this.clearPvpEntities();
    this.clearGrenadeProjectiles();
    this.resetGrenadeLoadout();
    this.removeMissile();
    this.endTvMissile();
    this.clearStreakCall(true);
    this.clearCasRuns();
    this.clearFirebombRuns();
    this.clearAttackHelicopters();
    this.pvpSnapshot = null;
    this.pvpReadyForActionActive = false;
    this.pvpRoom = null;
    this.pvpUavSweepSeq = 0;
    this.pvpUavRevealTime = 0;
    this.pvpVoteKick = null;
    this.pvpVoteKickCooldown = 0;
    this.resetDialogueState();
    this.hud.clearOperatorSubtitles();
    this.resetPvpPrediction();
    this.resetPvpReloadSync();
    this.resetPvpAmmoSync();
    this.gameType = 'pve';
    this.player.team = 'blue';
    this.setLocalJuggernaut(false, { fill: false, equip: true });
    this.viewModel.setTeam('blue');
    for (const bot of this.bots) bot.rig.root.visible = true;
    this.input.releaseLock();
    this.mode = 'rooms';
    this.showSystemDialog(
      'DISCONNECTED',
      'CONNECTION TO THE PVP SERVER WAS LOST.\nCHECK YOUR NETWORK AND RE-ENTER THE ROOM.'
    );
  }

  clearPvpEntities() {
    for (const remote of this.pvpRemotes.values()) remote.dispose();
    this.pvpRemotes.clear();
    for (const sentry of this.pvpSentries.values()) this.removePvpSentryView(sentry);
    this.pvpSentries.clear();
    this.clearUavDrones();
    this.clearJuggernautAirdrops();
  }

  resetPvpPrediction() {
    this.pvpPoseHistory.length = 0;
    this.pvpViewCorrection.set(0, 0, 0);
    this.pvpJumpQueued = false;
    this.pvpJumpBuffer = 0;
  }

  resetPvpReloadSync() {
    this.pvpReloadCycles.reset();
    this.pvpPredictedReload = null;
    this.pvpServerReloading = null;
    this.pvpActiveReloadCycle = null;
  }

  resetPvpAmmoSync() {
    this.pvpAmmoAuthority.clear();
    this.pvpAmmoObserved.clear();
    this.pvpAmmoPredictUntil.clear();
    for (const id of WEAPON_ORDER) {
      const ammo = this.viewModel.ammo[id];
      if (ammo) this.pvpAmmoObserved.set(id, { mag: ammo.mag, reserve: ammo.reserve });
    }
  }

  pvpRailgunFireCommitActive(at = performance.now()) {
    const active = this.gameType === 'pvp'
      && this.player.alive
      && this.railgunActive
      && this.viewModel.def?.id === LASER_CANNON_ID
      && at < this.pvpRailgunFireCommitUntil;
    if (!active && this.pvpRailgunFireCommitUntil > 0) {
      this.pvpRailgunFireCommitUntil = 0;
    }
    return active;
  }

  notePvpAmmoPrediction(id = this.viewModel.def?.id) {
    if (!id) return;
    const ammo = this.viewModel.ammo[id];
    if (!ammo) return;
    const observed = this.pvpAmmoObserved.get(id);
    if (observed && observed.mag === ammo.mag && observed.reserve === ammo.reserve) return;
    this.pvpAmmoObserved.set(id, { mag: ammo.mag, reserve: ammo.reserve });
    this.pvpAmmoPredictUntil.set(
      id,
      performance.now() + (id === LASER_CANNON_ID ? 2500 : 400)
    );
  }

  syncPvpAmmo(snapshot, hard = false) {
    const now = performance.now();
    for (const id of WEAPON_ORDER) {
      const authoritative = snapshot.you.ammo?.[id];
      const local = this.viewModel.ammo[id];
      if (!authoritative || !local) continue;
      const previous = hard ? null : this.pvpAmmoAuthority.get(id);
      const reloading = this.viewModel.def?.id === id && (
        this.viewModel.reloading || snapshot.you.reloading?.weapon === id
      );
      const preservePrediction = !hard
        && (reloading || now < (this.pvpAmmoPredictUntil.get(id) || 0));
      const reconciled = reconcilePredictedAmmo(
        local,
        authoritative,
        previous,
        preservePrediction
      );
      local.mag = reconciled.mag;
      local.reserve = reconciled.reserve;
      this.pvpAmmoAuthority.set(id, {
        mag: authoritative.mag,
        reserve: authoritative.reserve,
      });
      this.pvpAmmoObserved.set(id, { mag: local.mag, reserve: local.reserve });
      if (!preservePrediction) this.pvpAmmoPredictUntil.delete(id);
    }
  }

  recordPvpPose(at = Date.now()) {
    const p = this.player.position;
    const v = this.player.velocity;
    this.pvpPoseHistory.push({
      at,
      p: [p.x, p.y, p.z],
      v: [v.x, v.y, v.z],
      grounded: this.player.grounded,
    });
    const cutoff = at - 3000;
    while (this.pvpPoseHistory.length > 2 && this.pvpPoseHistory[1].at < cutoff) {
      this.pvpPoseHistory.shift();
    }
  }

  reconcilePvpMovement(own, snapshot, authPos, authVel) {
    const sampleAt = this.pvp.clientEpochForServerTime(snapshot.serverTime);
    const predicted = samplePoseHistory(this.pvpPoseHistory, sampleAt);
    if (!predicted) {
      // A history miss only happens just after joining or after a very long
      // browser stall. Do not resume the old every-snapshot pullback; reserve
      // the fallback for an unmistakable teleport-sized disagreement.
      if (this.player.position.distanceTo(authPos) > 2.25) {
        this.player.position.copy(authPos);
        this.player.velocity.copy(authVel);
        this.resetPvpPrediction();
      }
      return;
    }

    const correction = movementCorrection(own.p, predicted, {
      stepHeight: this.player.stepHeight,
      serverGrounded: own.grounded,
      clientGrounded: this.player.grounded,
    });
    if (correction.x === 0 && correction.y === 0 && correction.z === 0) return;

    this.player.position.x += correction.x;
    this.player.position.y += correction.y;
    this.player.position.z += correction.z;
    if (correction.teleport) {
      this.player.velocity.copy(authVel);
      this.resetPvpPrediction();
      return;
    }
    absorbViewCorrection(this.pvpViewCorrection, correction);

    // The correction changed the coordinate frame of every prediction made
    // after this snapshot time. Shift those samples as well so the next
    // snapshot does not apply the same error a second time.
    for (const pose of this.pvpPoseHistory) {
      if (pose.at + 0.5 < sampleAt) continue;
      pose.p[0] += correction.x;
      pose.p[1] += correction.y;
      pose.p[2] += correction.z;
    }
  }

  syncPvpReload(snapshot) {
    const vm = this.viewModel;
    const reload = snapshot.you.reloading;
    this.pvpServerReloading = reload ? { ...reload } : null;

    if (!reload) {
      const completedAuthoritativeCycle = this.pvpActiveReloadCycle !== null;
      this.pvpActiveReloadCycle = null;
      const pendingWasProcessed = this.pvpPredictedReload?.seq !== null
        && this.pvpPredictedReload?.seq !== undefined
        && snapshot.ack >= this.pvpPredictedReload.seq;
      if (completedAuthoritativeCycle || pendingWasProcessed) {
        // The authoritative reload either completed or rejected the request.
        // Do not let a stale local animation continue blocking/covering fire.
        if (vm.reloading) vm.cancelReload();
        this.pvpPredictedReload = null;
      }
      return;
    }

    const cycleKey = `${reload.weapon}:${reload.startedAt}`;
    this.pvpActiveReloadCycle = cycleKey;
    const isNewCycle = this.pvpReloadCycles.accept(reload);
    if (!isNewCycle) return;

    const sameWeapon = reload.weapon === vm.def?.id;
    const predictedLocally = sameWeapon && (
      vm.reloading || this.pvpPredictedReload?.weapon === reload.weapon
    );
    if (this.pvpPredictedReload?.weapon === reload.weapon) {
      this.pvpPredictedReload = null;
    }
    if (!sameWeapon) return;

    // A locally predicted animation already represents this server cycle.
    // Merely acknowledge it; restarting here caused the visible double reload.
    if (!predictedLocally) vm.startReload();
    if (vm.reloading && !vm.def.shellReload) {
      const elapsed = Math.max(0, (snapshot.serverTime - reload.startedAt) / 1000);
      vm.reloadT = Math.max(vm.reloadT, Math.min(elapsed, vm.reloadTotal * 0.98));
    }
  }

  sendPvpNeutralInput() {
    if (this.gameType !== 'pvp' || !this.pvp.playerId) return;
    this.pvpJumpQueued = false;
    this.pvpJumpBuffer = 0;
    this.pvpSlideQueued = false;
    this.pvpReloadQueued = false;
    const grenadePin = Boolean(this.pvpGrenadePinQueued);
    const grenadeThrow = Boolean(this.pvpGrenadeThrowQueued);
    const meleeAttack = Boolean(this.pvpMeleeQueued);
    const keepLiveGrenade = this.grenadePinAt > 0 || grenadeThrow;
    const railgunCommit = this.pvpRailgunFireCommitActive();
    const inputSent = this.pvp.sendInput({
      seq: ++this.pvpInputSeq,
      moveX: 0,
      moveZ: 0,
      jump: false,
      crouch: false,
      slide: false,
      sprint: false,
      // Keep the legacy aim/trigger representation in this emergency neutral
      // packet too. Protocol 11 uses the explicit bits below, but either path
      // must carry a one-shot action across pointer-lock/chat transitions.
      aim: railgunCommit || (keepLiveGrenade && grenadePin),
      trigger: railgunCommit || grenadeThrow,
      reload: false,
      grenade: keepLiveGrenade,
      grenadePin,
      grenadeThrow,
      grenadeAim: keepLiveGrenade && this.grenadeThrowAiming,
      meleeAttack,
      weapon: railgunCommit
        ? LASER_CANNON_ID
        : this.viewModel.pendingWeapon || this.viewModel.def?.id || 'rifle',
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      interact: false,
    });
    if (!inputSent) return;
    this.pvpGrenadePinQueued = false;
    this.pvpMeleeQueued = false;
    if (grenadeThrow) {
      this.pvpGrenadeThrowQueued = false;
      this.grenadePinAt = 0;
      this.grenadeThrowAiming = false;
      if (!this.grenadeView.throwing) this.grenadeView.reset();
      this.grenadeTrajectory.hide();
    }
  }

  applyPvpSnapshot(snapshot) {
    if (this.gameType !== 'pvp' || !this.pvp.playerId) return;
    const own = snapshot.players?.find((p) => p.id === this.pvp.playerId);
    if (!own) return;
    const first = !this.pvpSnapshot;
    const wasAlive = this.player.alive;
    const keepMenuOpen = this.mode === 'paused'
      || this.mode === 'settings'
      || this.mode === 'votekick'
      || this.mode === 'mapvote';
    const authPos = new THREE.Vector3(...own.p);
    const authVel = new THREE.Vector3(...(own.v || [0, 0, 0]));

    if (first && own.alive) {
      this.player.respawn(authPos);
      this.player.yaw = own.yaw;
      this.player.pitch = own.pitch;
      this.player.velocity.copy(authVel);
      this.resetPvpPrediction();
      this.recordPvpPose();
    } else if (first) {
      this.holdPlayerForDeployment();
      this.player.position.copy(authPos);
      this.player.yaw = own.yaw;
      this.player.pitch = own.pitch;
    } else if (own.alive && wasAlive) {
      this.reconcilePvpMovement(own, snapshot, authPos, authVel);
    }

    this.player.health = own.health;
    this.player.armor = own.armor;
    this.player.kills = snapshot.you.kills;
    this.player.deaths = snapshot.you.deaths;
    this.player.score = snapshot.you.score;
    this.player.team = snapshot.you.team;
    this.pvpReadyForActionActive = Boolean(snapshot.you.readyActive);
    if (this.pvpReadyForActionActive) {
      this.pvpReloadQueued = false;
      if (this.viewModel.reloading) this.viewModel.cancelReload();
    }
    this.totalScore = snapshot.you.score;
    this.killStreak = snapshot.you.streak;
    const authoritativeGrenades = Number(snapshot.you.grenades);
    if (Number.isFinite(authoritativeGrenades)) {
      const grenadeAckTimedOut = this.pvpGrenadeCountPending
        && this.time >= this.pvpGrenadePendingUntil
        && authoritativeGrenades > this.grenadesRemaining;
      if (grenadeAckTimedOut) {
        // WebSocket messages are ordered: if a server had accepted the action,
        // its grenade event would have arrived before this newer snapshot.
        // Roll back an unconfirmed prediction instead of permanently eating it.
        this.pvpGrenadeCountPending = false;
        this.pvpGrenadePendingUntil = 0;
        this.pvpGrenadeThrowQueued = false;
        this.pvpGrenadePinQueued = false;
        this.grenadePinAt = 0;
        this.grenadeSelected = false;
        this.grenadeThrowAiming = false;
        this.grenadeView.reset();
        this.grenadeTrajectory.hide();
        this.hud.notice('GRENADE THROW NOT CONFIRMED');
      }
      if (!this.pvpGrenadeCountPending || authoritativeGrenades <= this.grenadesRemaining) {
        this.grenadesRemaining = clamp(
          Math.round(authoritativeGrenades),
          0,
          GRENADES_PER_LIFE
        );
        if (authoritativeGrenades <= this.grenadesRemaining) {
          this.pvpGrenadeCountPending = false;
          this.pvpGrenadePendingUntil = 0;
        }
      }
    }
    this.match = snapshot.match;
    this.pvpRoom = snapshot.room;
    this.pvpVoteKick = snapshot.voteKick || null;
    this.pvpVoteKickCooldown = Math.max(0, Number(snapshot.you.voteKickCooldown) || 0);
    this.respawnTimer = Math.max(0, ((own.respawnAt || 0) - snapshot.serverTime) / 1000);
    this.updateLoadoutScreenState();

    if (wasAlive && !own.alive) {
      this.cancelCasTargeting(false);
      this.grenadeSelected = false;
      this.grenadePinAt = 0;
      this.grenadeThrowAiming = false;
      this.pvpGrenadeThrowQueued = false;
      this.pvpGrenadePinQueued = false;
      this.pvpGrenadeCountPending = false;
      this.pvpGrenadePendingUntil = 0;
      this.pvpMeleeQueued = false;
      this.grenadeView.reset();
      this.grenadeTrajectory.hide();
      this.player.health = 0;
      this.player.die(null, this.player.killedBy);
      this.audio.stopJuggernautBreathing();
      if (!keepMenuOpen) this.mode = 'dead';
    } else if (!wasAlive && own.alive) {
      this.clearKillerCamera();
      this.player.respawn(authPos);
      this.player.killedBy = null;
      this.player.velocity.copy(authVel);
      this.viewModel.reset();
      this.viewModel.equip(own.weapon || this.loadout.primary, true);
      this.viewModel.holder.visible = true;
      this.resetGrenadeLoadout();
      if (Number.isFinite(authoritativeGrenades)) {
        this.grenadesRemaining = clamp(
          Math.round(authoritativeGrenades),
          0,
          GRENADES_PER_LIFE
        );
      }
      this.resetPvpAmmoSync();
      this.resetPvpPrediction();
      this.resetPvpReloadSync();
      this.pvpMeleeQueued = false;
      this.recordPvpPose();
      if (this.loadoutScreen.visible) this.closeLoadout();
      if (!keepMenuOpen) this.mode = 'playing';
      this.hud.notice('PRESS ENTER TO CHAT', 3.2);
      this.fireLock = true;
      this.jumpLock = true;
    }

    const authoritativeJuggernaut = !!own.juggernaut;
    if (this.player.juggernaut !== authoritativeJuggernaut) {
      this.setLocalJuggernaut(authoritativeJuggernaut, {
        fill: false,
        equip: own.alive,
      });
    } else {
      this.player.maxHealth = authoritativeJuggernaut ? JUGGERNAUT_MAX_HEALTH : this.ohp;
      this.player.maxArmor = Number(own.maxArmor) || loadoutArmorCapacity(
        this.loadout,
        authoritativeJuggernaut ? JUGGERNAUT_MAX_ARMOR : 50
      );
      this.player.healthRegenDelay = loadoutHealthRegenDelay(this.loadout);
    }
    // Respawn and transformation helpers fill their own values; the server's
    // snapshot remains final for the exact current vitals.
    this.player.health = own.health;
    this.player.armor = own.armor;

    this.syncPvpLaserCannon(own);
    this.syncPvpAmmo(snapshot, first || (!wasAlive && own.alive));
    this.syncPvpReload(snapshot);

    const streaks = snapshot.you.streaks || {};
    this.uav.charges = streaks.uav || 0;
    this.uav.time = streaks.uavTime || 0;
    const sweepSeq = Number(streaks.uavSweepSeq) || 0;
    this.pvpUavRevealTime = Math.max(0, Number(streaks.uavRevealTime) || 0);
    if (this.uav.time > 0 && sweepSeq !== this.pvpUavSweepSeq && sweepSeq > 0) {
      this.audio.uavPing();
    }
    this.pvpUavSweepSeq = sweepSeq;
    this.strikeCharges = streaks.strike || 0;
    this.sentryCharges = streaks.sentry || 0;
    this.casCharges = streaks.cas || 0;
    this.firebombCharges = streaks.firebomb || 0;
    this.attackHelicopterCharges = streaks.attack_helicopter || 0;
    this.juggernautCharges = streaks.juggernaut || 0;
    this.railgunCharges = streaks.railgun || 0;
    const uavAlpha = uavRevealAlpha(this.pvpUavRevealTime);
    this.pvpUavMarks = (snapshot.you.uavMarks || []).map((p) => ({
      x: p[0],
      y: p[1],
      z: p[2],
      alpha: uavAlpha,
    }));
    if (this.uav.time <= 0) {
      this.pvpUavRevealTime = 0;
      this.pvpUavMarks = [];
    }

    const seen = new Set();
    for (const state of snapshot.players || []) {
      if (state.id === this.pvp.playerId) continue;
      seen.add(state.id);
      let remote = this.pvpRemotes.get(state.id);
      if (!remote) {
        const displayTeam = state.team === this.player.team ? 'blue' : 'red';
        remote = new RemotePlayer(this.scene, this.textures, state, displayTeam);
        this.pvpRemotes.set(state.id, remote);
      } else {
        remote.applySnapshot(state);
      }
    }
    for (const [id, remote] of this.pvpRemotes) {
      if (seen.has(id)) continue;
      remote.dispose();
      this.pvpRemotes.delete(id);
    }
    this.syncPvpSentries(snapshot.sentries || []);
    this.syncPvpUavDrones(snapshot.uavDrones || [], snapshot.serverTime);
    this.syncPvpMissiles(snapshot.missiles || []);
    this.syncPvpCasRuns(snapshot.casRuns || []);
    this.syncPvpFirebombRuns(snapshot.firebombRuns || []);
    this.syncPvpAttackHelicopters(snapshot.attackHelicopters || []);
    this.syncPvpJuggernautAirdrops(snapshot.airdrops || []);
    this.pvpSnapshot = snapshot;
    if (wasAlive && !own.alive) {
      this.beginPvpKillerCamera(this.player.killedBy?.id);
    }
  }

  handlePvpEvent(message) {
    if (message.type === 'map_vote_started') {
      this.pvpMapVoteResume = this.player.alive;
      this.pvpMapVote = {
        counts: { ...(message.counts || {}) },
        selected: null,
        endsAt: Number(message.endsAt) || 0,
      };
      this.clearKillerCamera();
      if (this.loadoutScreen.visible) this.closeLoadout();
      this.mode = 'mapvote';
      this.input.enabled = true;
      this.input.releaseLock();
      this.mapVoteScreen.show(this.pvpMapVote);
      return;
    }
    if (message.type === 'map_vote_update') {
      if (!this.pvpMapVote) return;
      this.pvpMapVote.counts = { ...(message.counts || {}) };
      this.pvpMapVote.endsAt = Number(message.endsAt) || this.pvpMapVote.endsAt;
      this.mapVoteScreen.update(this.pvpMapVote.counts, this.pvpMapVote.selected);
      return;
    }
    if (message.type === 'map_vote_result') {
      const resume = this.pvpMapVoteResume;
      this.mapVoteScreen.hide();
      this.pvpMapVote = null;
      this.pvpMapVoteResume = false;
      this.closePvpChat(false);
      this.clearPvpEntities();
      this.clearGrenadeProjectiles();
      this.clearCasRuns();
      this.clearFirebombRuns();
      this.clearAttackHelicopters();
      if (message.mapId && message.mapId !== this.mapId) this.applyMap(message.mapId);
      this.pvpSnapshot = null;
      this.resetPvpPrediction();
      this.resetPvpReloadSync();
      this.resetPvpAmmoSync();
      this.holdPlayerForDeployment();
      if (resume) {
        this.mode = 'playing';
        this.input.enabled = true;
        this.input.requestLock();
      } else {
        this.openLoadout(true);
      }
      return;
    }
    if (message.type === 'score_award') {
      this.hud.pushScore(Number(message.amount) || 0, message.label || 'KILL ASSIST');
      return;
    }
    if (message.type === 'deploy_error') {
      this.pvpDeployPending = false;
      this.respawnTimer = Math.max(this.respawnTimer, Number(message.retryAfter) || 0);
      this.updateLoadoutScreenState();
      this.input.releaseLock();
      this.hud.notice(message.message || 'DEPLOYMENT NOT AVAILABLE');
      return;
    }
    if (message.type === 'operator_voice') {
      this.playOperatorVoice({
        action: message.action,
        actorId: message.actorId,
        speakerName: message.name,
        team: message.team,
        position: message.p,
        seed: message.seed,
        teamWide: Boolean(message.teamWide),
      });
      return;
    }
    if (message.type === 'streak_voice') {
      this.playStreakVoice(message.cue, message.seed);
      return;
    }
    if (message.type === 'grenade_pin') {
      this.grenadesRemaining = clamp(
        Math.round(Number(message.remaining) || 0),
        0,
        GRENADES_PER_LIFE
      );
      this.pvpGrenadeCountPending = false;
      this.pvpGrenadePendingUntil = 0;
      if (this.grenadeSelected) {
        const deadline = this.pvp.clientEpochForServerTime(Number(message.fuseAt));
        const seconds = Number.isFinite(deadline)
          ? Math.max(0, (deadline - Date.now()) / 1000)
          : GRENADE_FUSE_SECONDS;
        this.grenadePinAt = this.time + GRENADE_FUSE_SECONDS - seconds;
        this.grenadeView.setPinned(true);
      }
      return;
    }
    if (message.type === 'grenade_throw') {
      if (message.ownerId !== this.pvp.playerId
        && message.source !== 'martyrdom'
        && message.source !== 'death_drop') {
        this.pvpRemotes.get(message.ownerId)?.playThrowableThrow(message.kind);
      }
      if (message.ownerId === this.pvp.playerId) {
        this.grenadesRemaining = clamp(
          Math.round(Number(message.remaining) || 0),
          0,
          GRENADES_PER_LIFE
        );
        this.grenadePinAt = 0;
        this.grenadeSelected = false;
        this.grenadeThrowAiming = false;
        this.pvpGrenadeThrowQueued = false;
        this.pvpGrenadePinQueued = false;
        this.pvpGrenadeCountPending = false;
        this.pvpGrenadePendingUntil = 0;
        if (!this.grenadeView.throwing) this.grenadeView.reset();
        this.grenadeTrajectory.hide();
      }
      const thrownAt = Number(message.thrownAt ?? message.droppedAt);
      const detonateAt = Number(message.detonateAt);
      const receivedAt = Date.now();
      const grenade = this.spawnGrenadeVisual({
        id: message.id,
        ownerId: message.ownerId,
        team: message.team,
        kind: message.kind,
        position: message.p,
        velocity: message.v,
        detonateAt,
        physicsLifeRemaining: Number.isFinite(thrownAt)
          && Number.isFinite(detonateAt)
          ? Math.max(0, (detonateAt - thrownAt) / 1000)
          : undefined,
        pvp: true,
      });
      this.catchUpPvpGrenade(
        grenade,
        thrownAt,
        receivedAt
      );
      if (message.source !== 'martyrdom') {
        this.audio.grenadeThrow(grenade.position, grenade.kind);
      }
      return;
    }
    if (message.type === 'grenade_sync') {
      this.syncPvpGrenadeState(message);
      return;
    }
    if (message.type === 'grenade_explode') {
      this.removeGrenadeVisual(message.id);
      const position = new THREE.Vector3(...message.p);
      this.explodeGrenadeVisual(position, message.kind);
      if (grenadeCreatesFire(message.kind)) {
        this.syncPvpIncendiaryZone({
          ...message,
          p: message.p,
          expiresAt: message.expiresAt,
        });
      }
      if (message.ownerId === this.pvp.playerId && this.grenadePinAt > 0) {
        this.grenadePinAt = 0;
        this.grenadeSelected = false;
        this.grenadeThrowAiming = false;
        this.pvpGrenadeThrowQueued = false;
        this.pvpGrenadePinQueued = false;
        this.grenadeView.reset();
        this.grenadeTrajectory.hide();
      }
      return;
    }
    if (message.type === 'incendiary_zone') {
      this.syncPvpIncendiaryZone(message);
      return;
    }
    if (message.type === 'incendiary_end') {
      this.removeIncendiaryZone(message.id);
      return;
    }
    if (message.type === 'firebomb_impact') {
      const run = this.firebombRuns.get(message.runId);
      const index = Number(message.index) || 0;
      if (run) {
        this.renderFirebombImpact(run, index);
      } else if (Array.isArray(message.p)) {
        const at = new THREE.Vector3(...message.p);
        const index = Number(message.index) || 0;
        this.audio.firebombImpact(at, index, FIREBOMB_BOMB_COUNT);
        this.effects.firebombImpact(at, index);
      }
      const bomb = run?.bombs?.[index];
      const preparedModel = bomb?.preparedModel || null;
      if (bomb) bomb.preparedModel = null;
      this.syncPvpIncendiaryZone({
        id: message.zoneId,
        ownerId: message.ownerId,
        team: message.team,
        kind: AIRSTRIKE_INCENDIARY_KIND,
        p: message.p,
        expiresAt: message.expiresAt,
        preparedModel,
      });
      return;
    }
    if (message.type === 'chat') {
      this.appendPvpChat(message);
      return;
    }
    if (message.type === 'chat_error') {
      this.hud.notice(message.text || 'CHAT MESSAGE NOT SENT');
      return;
    }
    if (message.type === 'vote_kick_started') {
      const isInitiator = message.initiatorId === this.pvp.playerId;
      const isTarget = message.targetId === this.pvp.playerId;
      this.pvpVoteKick = {
        id: message.id,
        targetId: message.targetId,
        targetName: message.targetName,
        initiatorName: message.initiatorName,
        yes: 1,
        no: 0,
        required: message.required,
        endsAt: message.endsAt,
        yourVote: isInitiator ? 'yes' : null,
        canVote: !isInitiator && !isTarget,
      };
      this.hud.banner(
        'VOTE KICK',
        `${message.targetName}  //  Y YES  N NO`,
        2.4,
        '#ffcc55'
      );
      return;
    }
    if (message.type === 'vote_kick_result') {
      this.pvpVoteKick = null;
      this.hud.banner(
        message.passed ? 'VOTE PASSED' : 'VOTE FAILED',
        `${message.targetName}  //  ${message.yes} YES  ${message.no} NO`,
        2.8,
        message.passed ? '#ff5b4c' : '#8ecbff'
      );
      return;
    }
    if (message.type === 'vote_kick_error') {
      this.hud.notice(message.text || 'VOTE COULD NOT BE STARTED');
      return;
    }
    if (message.type === 'join_error' && message.code === 'BANNED') {
      this.pvpBanUntil = Math.max(this.pvpBanUntil, Number(message.banUntil) || 0);
      this.pvpStatus = 'banned';
      this.hud.notice(message.message || 'VOTE KICK LOCKOUT ACTIVE');
      return;
    }
    if (message.type === 'kicked') {
      this.pvpBanUntil = Math.max(this.pvpBanUntil, Number(message.banUntil) || 0);
      this.leavePvpRoom(true);
      this.pvpStatus = 'banned';
      this.hud.notice(message.message || 'REMOVED BY VOTE - 6 HOUR LOCKOUT');
      return;
    }
    if (message.type === 'notice') {
      this.hud.notice(message.text);
      return;
    }
    if (message.type === 'feedback') {
      const killed = (message.killed || 0) > 0;
      this.hud.hit(killed ? (message.headshot ? 'killHead' : 'kill') : message.headshot ? 'head' : 'hit');
      for (const target of message.targets || []) {
        if (!target || target.team === this.player.team) continue;
        const remote = this.pvpRemotes.get(target.id);
        const position = Array.isArray(target.p)
          ? target.p
          : remote
            ? [remote.position.x, remote.position.y, remote.position.z]
            : null;
        if (!position) continue;
        const crouched = target.crouch ?? remote?.state?.crouch;
        this.rememberEnemyHudTarget({
          id: `pvp:${target.id}`,
          team: target.team,
          health: target.health,
          maxHealth: target.maxHealth || this.ohp,
          armor: target.armor,
          maxArmor: target.maxArmor || 50,
          initialHealth: target.beforeHealth,
          initialArmor: target.beforeArmor,
          x: position[0],
          y: position[1] + (crouched ? 1.72 : 2.12),
          z: position[2],
          dead: target.alive === false,
        }, target.alive === false ? ENEMY_VITAL_DEATH_HOLD : ENEMY_VITAL_HIT_HOLD);
      }
      if (!killed) {
        if (message.armorBroke) this.audio.armorCrack();
        else this.audio.hitmarker(message.headshot);
      }
      return;
    }
    if (message.type === 'damage') {
      this.applyPvpDamageFx(message);
      return;
    }
    if (message.type === 'shot') {
      if (message.shooterId === this.pvp.playerId
        && message.weapon === LASER_CANNON_ID) {
        // The reliable server shot broadcast acknowledges the locally
        // predicted discharge. Following inputs may now release the trigger
        // while the authority-owned battery reload proceeds.
        this.pvpRailgunFireCommitUntil = 0;
      }
      this.renderPvpShot(message);
      return;
    }
    if (message.type === 'kill') {
      this.hud.pushKill({
        killer: message.killer,
        victim: message.victim,
        killerTeam: message.killerTeam,
        victimTeam: message.victimTeam,
        weapon: message.weapon,
        headshot: message.headshot,
        highlight: message.killerId === this.pvp.playerId || message.victimId === this.pvp.playerId,
      });
      if (message.victimId === this.pvp.playerId) {
        this.player.killedBy = {
          id: message.killerId,
          name: message.killer,
          team: message.killerTeam,
        };
        this.player.killedByWeapon = message.weapon;
        // Kill events and snapshots share an ordered socket but can straddle
        // render frames. If the death snapshot arrived first, begin here;
        // otherwise applyPvpSnapshot starts the camera after remotes are synced.
        if (!this.player.alive) this.beginPvpKillerCamera(message.killerId);
      }
      if (message.killerId === this.pvp.playerId) {
        this.audio.killConfirm(message.headshot, 1);
        this.hud.pushKillIcon(message.headshot);
        const rewardLabel = {
          strike: 'STRIKE KILL',
          sentry: 'SENTRY KILL',
          cas: 'A-10 KILL',
          firebomb: 'FIREBOMB KILL',
          attack_helicopter: 'HELICOPTER KILL',
        }[message.weapon];
        this.hud.pushScore(
          100 + (message.headshot ? 50 : 0),
          rewardLabel || (message.headshot ? 'HEADSHOT' : 'KILL')
        );
      }
      return;
    }
    if (message.type === 'round_end') {
      const won = message.winner === this.player.team;
      this.hud.banner(won ? 'ROUND VICTORY' : 'ROUND DEFEAT', 'NEXT ROUND LIVE', 3, won ? '#7de08a' : '#ff5b4c');
      return;
    }
    if (message.type === 'ability' && message.ability === 'uav') {
      this.uav.time = Math.max(
        this.uav.time,
        Number(message.duration) || UAV_DURATION_SECONDS
      );
      this.uav.ping = UAV_FIRST_SWEEP_SECONDS;
      this.pvpUavRevealTime = 0;
      this.pvpUavMarks = [];
      return;
    }
    if (message.type === 'streak_activated') {
      const announcement = PVP_STREAK_ANNOUNCEMENTS[message.reward];
      if (!announcement || message.team !== this.player.team) return;
      const operator = String(message.name || message.ownerId || 'TEAMMATE')
        .trim()
        .slice(0, 24) || 'TEAMMATE';
      this.hud.banner(
        announcement.title,
        `${operator} USED ${announcement.label}`,
        announcement.duration,
        announcement.color
      );
      return;
    }
    if (message.type === 'uav_destroyed') {
      this.removeUavDrone(message.id || `uav-${message.team}`);
      const friendly = message.team === this.player.team;
      if (friendly) {
        this.uav.time = 0;
        this.uav.ping = 0;
        this.pvpUavRevealTime = 0;
        this.pvpUavMarks = [];
      }
      this.hud.banner(
        friendly ? 'UAV DESTROYED' : 'ENEMY UAV DESTROYED',
        '',
        2.4,
        friendly ? '#ff5b4c' : '#7de08a'
      );
      return;
    }
    if (message.type === 'reward') {
      const labels = {
        uav: ['UAV READY', '#7de08a'],
        strike: ['MISSILE STRIKE READY', '#ffcc55'],
        sentry: ['SENTRY GUN READY', '#8ecbff'],
        cas: ['CLOSE AIR SUPPORT READY', '#ff9f55'],
        firebomb: ['INCENDIARY AIRSTRIKE READY', '#ff8a45'],
        attack_helicopter: ['ATTACK HELICOPTER READY', '#ffb35a'],
        juggernaut: ['JUGGERNAUT READY', '#e5d788'],
        railgun: ['LASER CANNON READY', '#ff5347'],
      };
      const label = labels[message.reward];
      if (label) {
        this.hud.pushStreakReady(message.reward, label[0], label[1]);
        if (message.reward === 'cas') preloadA10Model();
        if (message.reward === 'firebomb') preloadB2Model();
        if (message.reward === 'attack_helicopter') preloadApacheModel();
        if (message.reward === 'juggernaut') preloadTransportHelicopterModel();
      }
      return;
    }
    if (message.type === 'juggernaut_airdrop') {
      const startedAt = this.pvp.clientEpochForServerTime(Number(message.startedAt));
      const age = Number.isFinite(startedAt)
        ? Math.max(0, (Date.now() - startedAt) / 1000)
        : 0;
      this.spawnJuggernautAirdrop({ ...message, age, pvp: true });
      const friendly = message.team === this.player.team;
      if (!friendly) {
        this.hud.banner('AW101 INBOUND', '', 2.5, '#ff5b4c');
      }
      return;
    }
    if (message.type === 'juggernaut_claimed') {
      this.removeJuggernautAirdrop(message.id);
      const local = message.playerId === this.pvp.playerId;
      const friendly = message.team === this.player.team;
      this.hud.banner(
        local ? 'JUGGERNAUT ONLINE' : friendly ? 'FRIENDLY JUGGERNAUT' : 'ENEMY JUGGERNAUT',
        '',
        2.8,
        local || friendly ? '#e5d788' : '#ff5b4c'
      );
      return;
    }
    if (message.type === 'cas_run') {
      const startedAt = this.pvp.clientEpochForServerTime(Number(message.startedAt));
      const age = Number.isFinite(startedAt)
        ? Math.max(0, (Date.now() - startedAt) / 1000)
        : 0;
      this.spawnCasRun({
        id: message.id,
        ownerId: message.ownerId,
        team: message.team,
        start: message.start,
        end: message.end,
        seed: message.seed,
        age,
        pvp: true,
      });
      if (message.ownerId === this.pvp.playerId) {
        this.pvpCasPending = false;
        this.pvpCasPendingUntil = 0;
      } else if (message.team !== this.player.team) {
        this.hud.banner('A-10 INBOUND', '', 1.9, '#ff5b4c');
      }
      return;
    }
    if (message.type === 'firebomb_run') {
      const startedAt = this.pvp.clientEpochForServerTime(Number(message.startedAt));
      const age = Number.isFinite(startedAt)
        ? Math.max(0, (Date.now() - startedAt) / 1000)
        : 0;
      this.spawnFirebombRun({
        id: message.id,
        ownerId: message.ownerId,
        team: message.team,
        start: message.start,
        end: message.end,
        age,
        pvp: true,
      });
      if (message.ownerId === this.pvp.playerId) {
        this.pvpFirebombPending = false;
        this.pvpFirebombPendingUntil = 0;
      } else if (message.team !== this.player.team) {
        this.hud.banner('B-2 INBOUND', '', 2.0, '#ff5b4c');
      }
      return;
    }
    if (message.type === 'attack_helicopter_call') {
      const startedAt = this.pvp.clientEpochForServerTime(Number(message.startedAt));
      const age = Number.isFinite(startedAt)
        ? Math.max(0, (Date.now() - startedAt) / 1000)
        : 0;
      this.spawnAttackHelicopter({
        ...message,
        age,
        pvp: true,
      });
      if (message.ownerId === this.pvp.playerId) {
        const call = this.streakCall?.type === 'attack_helicopter'
          ? this.streakCall
          : null;
        if (call) {
          call.voiceConfirmed = true;
          call.voiceSeed = message.voiceSeed;
        } else {
          // If a high-latency acknowledgement arrives after the half-second
          // radio gesture, speak now rather than replaying the device animation.
          this.playStreakVoice(
            'attack_helicopter_inbound',
            message.voiceSeed ?? randomStreakVoiceSeed()
          );
        }
      }
      const friendly = message.team === this.player.team;
      if (!friendly) {
        this.hud.banner('AH-64D INBOUND', '', 2.2, '#ff5b4c');
      }
      return;
    }
    if (message.type === 'attack_helicopter_fire') {
      this.renderAttackHelicopterShot(
        message.origin,
        message.target,
        message.hit === true
      );
      return;
    }
    if (message.type === 'attack_helicopter_destroyed') {
      const heli = this.attackHelicopters.get(message.id);
      if (heli) this.removeAttackHelicopter(heli);
      const friendly = message.team === this.player.team;
      this.hud.banner(
        friendly
          ? 'ATTACK HELICOPTER DESTROYED'
          : 'ENEMY ATTACK HELICOPTER DESTROYED',
        '',
        2.4,
        friendly ? '#ff5b4c' : '#7de08a'
      );
      return;
    }
    if (message.type === 'strike_launch') {
      // Somebody else's warhead. Ours is already flying locally as prediction.
      if (message.team !== this.player.team) {
        this.hud.banner('MISSILE INBOUND', '', 1.8, '#ff5b4c');
        this.audio.strikeLaunch();
      }
      return;
    }
    if (message.type === 'strike_impact') {
      const at = new THREE.Vector3(message.x, this.groundYAt(message.x, message.z), message.z);
      if (message.ownerId === this.pvp.playerId) this.endTvMissile();
      this.removePvpMissileView(message.id);
      this.explodeStrikeVisual(at);
      return;
    }
    if (message.type === 'sentry_deploy') {
      if (message.ownerId === this.pvp.playerId) {
        this.audio.sentryDeploy();
        this.playOperatorVoice({
          action: 'sentry',
          actorId: this.pvp.playerId,
          speakerName: this.player.name,
          team: this.player.team,
        });
      }
      return;
    }
    if (message.type === 'sentry_destroyed') {
      const view = this.pvpSentries.get(message.id);
      if (view) {
        this.effects.explosion(view.position, 0.5);
        this.audio.sentryDown(view.position);
        if (message.reason === 'timeout' && view.team === this.player.team) {
          this.hud.notice('FRIENDLY SENTRY SELF-DESTRUCT');
        }
        this.removePvpSentryView(view);
        this.pvpSentries.delete(message.id);
      }
    }
  }

  applyPvpDamageFx(message) {
    const amount = Number(message.amount) || 10;
    this.player.damageFlash = Math.min(1, this.player.damageFlash + clamp(amount / 45, 0.25, 0.9));
    if (Array.isArray(message.from)) {
      const from = new THREE.Vector3(...message.from);
      const dir = from.sub(this.player.position).setY(0).normalize();
      this.player.hitDirections.push({ dir, t: 1.6 });
      const side = dir.dot(this.player.rightFlat(new THREE.Vector3()));
      this.player.hurtRoll.kick(-side * clamp(amount / 12, 0.4, 2.6));
      this.player.recoilPitch.kick(clamp(amount / 22, 0.1, 0.7));
    }
    const now = performance.now();
    if (!this.pvpDamageAudioAt || now - this.pvpDamageAudioAt > 90 || message.armorBroke) {
      if (message.armorBroke) this.audio.armorCrack();
      this.audio.hurt();
      this.pvpDamageAudioAt = now;
    }
  }

  renderPvpShot(message) {
    if (message.shooterId === this.pvp.playerId) return;
    // The server's origin is the authoritative eye/camera ray and must remain
    // the basis for hit/impact direction. Third-person tracers are presentation
    // only, so start player shots at the rendered weapon muzzle and converge
    // them on the server-provided endpoints.
    const ballisticOrigin = new THREE.Vector3(...message.origin);
    let visualOrigin = ballisticOrigin;
    let sentryView = null;
    if (message.shooterKind === 'player') {
      const shooter = this.pvpRemotes.get(message.shooterId);
      if (shooter?.alive) visualOrigin = shooter.muzzlePosition(new THREE.Vector3());
    } else if (message.shooterKind === 'sentry' || message.weapon === 'sentry') {
      sentryView = this.pvpSentries.get(message.shooterId);
      if (sentryView?.muzzles?.length) {
        const muzzle = sentryView.muzzles[
          sentryView.barrelIndex++ % sentryView.muzzles.length
        ];
        visualOrigin = muzzle.getWorldPosition(new THREE.Vector3());
      } else if (sentryView?.muzzle) {
        visualOrigin = sentryView.muzzle.getWorldPosition(new THREE.Vector3());
      }
    }
    const melee = WEAPON_DEFS[message.weapon]?.melee === true;
    const color = message.weapon === 'sentry' ? SENTRY_CONFIG.tracerColor : 0xffb35a;
    const traces = message.traces || [];
    for (let i = 0; !melee && i < traces.length; i++) {
      if (i > 0 && traces.length > 3 && Math.random() > 0.45) continue;
      if (message.weapon === 'railgun') {
        const end = new THREE.Vector3(...traces[i]);
        this.effects.laserCannonBeam(visualOrigin, end);
        continue;
      }
      this.effects.tracer(visualOrigin, new THREE.Vector3(...traces[i]), color, message.weapon === 'sniper' ? 1.6 : 1);
    }
    if (message.weapon === 'sentry') {
      this.audio.sentryShot(visualOrigin);
      if (sentryView?.ejectionPort) {
        const ejectionAt = sentryView.ejectionPort.getWorldPosition(new THREE.Vector3());
        const ejectionQ = sentryView.ejectionPort.getWorldQuaternion(new THREE.Quaternion());
        const ejectionOut = new THREE.Vector3(-1, 0, 0).applyQuaternion(ejectionQ);
        const ejectionUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ejectionQ);
        const ejectionForward = new THREE.Vector3(0, 0, -1).applyQuaternion(ejectionQ);
        this.effects.ejectShell(
          ejectionAt,
          ejectionForward,
          ejectionOut,
          ejectionUp,
          'sentry'
        );
      }
    }
    else if (melee) {
      this.audio.meleeSwing(visualOrigin);
    } else {
      const def = WEAPON_DEFS[message.weapon] || WEAPON_DEFS.rifle;
      this.audio.shot(def.sound, visualOrigin);
    }
    const dir = traces.length
      ? new THREE.Vector3(...traces[0]).sub(ballisticOrigin).normalize()
      : new THREE.Vector3(0, 0, -1);
    for (const hit of message.impacts || []) {
      const point = new THREE.Vector3(...hit.p);
      const normal = new THREE.Vector3(...hit.n);
      if (hit.shielded) this.effects.shieldImpact(point, normal);
      else if (hit.surface === 'flesh') this.effects.blood(point, dir, 1);
      else {
        this.effects.impact(point, normal, hit.surface, 0.7);
        this.audio.impact(hit.surface, point);
      }
    }
  }

  /**
   * Missiles are pure Category-B state: the server flies them, we render what
   * we are told. Our own missile is the one exception - we keep predicting it
   * locally so the camera is not a round trip behind, and snap the prediction
   * back to the authoritative pose every snapshot.
   */
  syncPvpMissiles(states) {
    const seen = new Set();
    for (const state of states) {
      seen.add(state.id);
      if (state.ownerId === this.pvp.playerId) {
        if (this.tvMissile) {
          const local = this.tvMissile.state;
          local.position.set(...state.p);
          local.yaw = state.yaw;
          local.pitch = state.pitch;
          syncTvMissileControlFrame(local);
          local.diving = state.diving;
          this.tvMissile.model.position.copy(local.position);
        }
        continue;
      }
      let view = this.pvpMissiles.get(state.id);
      if (!view) {
        view = this.buildMissileModel();
        this.scene.add(view);
        this.pvpMissiles.set(state.id, view);
      }
      view.position.set(...state.p);
      // The model is built nose-down (-Y), so point that axis along the heading.
      view.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        tvMissileDirection(state, this._v1)
      );
    }
    for (const id of [...this.pvpMissiles.keys()]) {
      if (!seen.has(id)) this.removePvpMissileView(id);
    }
  }

  removePvpMissileView(id) {
    const view = this.pvpMissiles.get(id);
    if (!view) return;
    this.scene.remove(view);
    view.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.pvpMissiles.delete(id);
  }

  syncPvpSentries(states) {
    const seen = new Set();
    this.pvpOwnSentryId = null;
    for (const state of states) {
      seen.add(state.id);
      let view = this.pvpSentries.get(state.id);
      if (!view) {
        view = this.createPvpSentryView(state);
        this.pvpSentries.set(state.id, view);
      }
      view.position.set(...state.p);
      view.model.position.copy(view.position);
      view.yaw = state.yaw;
      view.pitch = state.pitch;
      view.health = state.health;
      view.maxHealth = state.maxHealth;
      view.team = state.team;
      view.ownerId = state.ownerId;
      if (view.head) view.head.rotation.y = state.yaw;
      if (view.pitchGroup) view.pitchGroup.rotation.x = state.pitch;
      if (state.ownerId === this.pvp.playerId) this.pvpOwnSentryId = state.id;
    }
    for (const [id, view] of this.pvpSentries) {
      if (seen.has(id)) continue;
      this.removePvpSentryView(view);
      this.pvpSentries.delete(id);
    }
  }

  createPvpSentryView(state) {
    const displayTeam = state.team === this.player.team ? 'blue' : 'red';
    const model = buildSentryModel(displayTeam);
    model.position.set(...state.p);
    this.scene.add(model);
    const laser = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.012, 1),
      new THREE.MeshBasicMaterial({
        color: 0xff2525,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const laserDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3030 })
    );
    laser.frustumCulled = false;
    laserDot.frustumCulled = false;
    this.scene.add(laser, laserDot);
    const sentryMuzzles = [
      model.getObjectByName('sentry-muzzle'),
      model.getObjectByName('sentry-muzzle-secondary'),
    ].filter(Boolean);
    return {
      id: state.id,
      ownerId: state.ownerId,
      team: state.team,
      displayTeam,
      position: new THREE.Vector3(...state.p),
      health: state.health,
      maxHealth: state.maxHealth,
      model,
      head: model.getObjectByName('sentry-head'),
      pitchGroup: model.getObjectByName('sentry-pitch'),
      muzzle: sentryMuzzles[0],
      muzzles: sentryMuzzles,
      barrelIndex: 0,
      laserOrigin: model.getObjectByName('sentry-laser-origin'),
      ejectionPort: model.getObjectByName('sentry-ejection-port'),
      hitboxes: model.userData.hitboxes,
      laser,
      laserDot,
    };
  }

  updatePvpSentryViews() {
    for (const view of this.pvpSentries.values()) {
      if (!view.laserOrigin || !view.muzzle) continue;
      const origin = view.laserOrigin.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
        view.muzzle.getWorldQuaternion(new THREE.Quaternion())
      ).normalize();
      this.raycaster.set(origin, dir);
      this.raycaster.near = 0.02;
      this.raycaster.far = SENTRY_CONFIG.range;
      const hit = this.raycaster.intersectObjects(this.level.solids, false)[0];
      const distance = hit ? hit.distance : SENTRY_CONFIG.range;
      const end = origin.clone().addScaledVector(dir, distance);
      view.laser.position.copy(origin).add(end).multiplyScalar(0.5);
      view.laser.lookAt(end);
      view.laser.scale.set(1, 1, distance);
      view.laserDot.position.copy(end);
      view.laserDot.visible = Boolean(hit);
    }
  }

  removePvpSentryView(view) {
    this.scene.remove(view.model, view.laser, view.laserDot);
    const materials = new Set();
    view.model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) materials.add(mat);
      }
    });
    for (const mat of materials) mat.dispose();
    view.laser.geometry.dispose();
    view.laser.material.dispose();
    view.laserDot.geometry.dispose();
    view.laserDot.material.dispose();
  }

  /* ----------------------------------------------------------- game flow */

  holdPlayerForDeployment() {
    this.clearKillerCamera();
    this.audio.stopJuggernautBreathing();
    this.player.alive = false;
    this.player.health = 0;
    this.player.armor = 0;
    this.player.killedBy = null;
    this.player.killedByWeapon = null;
    this.player.velocity.set(0, 0, 0);
    this.player.sprinting = false;
    this.player.sliding = false;
    this.player.speed2D = 0;
    this.player.deathAnim = null;
    this.viewModel.holder.visible = false;
  }

  applyPassiveVitals({ fillArmor = false } = {}) {
    const baseArmor = this.player.juggernaut ? JUGGERNAUT_MAX_ARMOR : 50;
    this.player.maxArmor = loadoutArmorCapacity(this.loadout, baseArmor);
    this.player.healthRegenDelay = loadoutHealthRegenDelay(this.loadout);
    if (fillArmor) this.player.armor = this.player.maxArmor;
    else this.player.armor = Math.min(this.player.armor, this.player.maxArmor);
  }

  applyLoadoutInventory({ fillArmor = false } = {}) {
    this.loadout = sanitizeLoadout(this.loadout);
    this.endLaserCannon({ restoreWeapon: false });
    this.applyPassiveVitals({ fillArmor });
    this.viewModel.equip(this.loadout.primary, true);
    this.viewModel.holder.visible = true;
    if (!loadoutHasStreak(this.loadout, 'uav')) this.uav.charges = 0;
    if (!loadoutHasStreak(this.loadout, 'strike')) this.strikeCharges = 0;
    if (!loadoutHasStreak(this.loadout, 'sentry')) this.sentryCharges = 0;
    if (!loadoutHasStreak(this.loadout, 'cas')) this.casCharges = 0;
    if (!loadoutHasStreak(this.loadout, 'firebomb')) this.firebombCharges = 0;
    if (!loadoutHasStreak(this.loadout, 'attack_helicopter')) {
      this.attackHelicopterCharges = 0;
    }
    if (!loadoutHasStreak(this.loadout, 'juggernaut')) this.juggernautCharges = 0;
    if (!loadoutHasStreak(this.loadout, LASER_CANNON_ID)) this.railgunCharges = 0;
  }

  openLoadout(initial = false) {
    if (this.mode !== 'dead' && this.mode !== 'loadout' && !initial) return false;
    if (!initial && this.gameType === 'pvp' && !this.pvp.requestRespawnLoadout()) {
      this.hud.notice('LOADOUT REQUEST NOT SENT');
      return false;
    }
    this.clearKillerCamera();
    this.loadoutInitial = initial;
    this.pvpDeployPending = false;
    this.mode = 'loadout';
    this.input.enabled = false;
    this.input.reset();
    this.input.releaseLock();
    this.viewModel.holder.visible = false;
    this.grenadeTrajectory.hide();
    this.loadoutScreen.show({
      loadout: this.loadout,
      gameType: this.gameType,
      mapName: this.map.name,
      roomNumber: this.pvpRoom?.number,
      initial,
    });
    this.updateLoadoutScreenState();
    return true;
  }

  closeLoadout() {
    this.loadoutScreen.hide();
    this.input.enabled = true;
    this.input.reset();
    this.pvpDeployPending = false;
  }

  updateLoadoutScreenState() {
    if (this.mode !== 'loadout') return;
    this.loadoutScreen.setDeploymentState({
      remaining: this.respawnTimer,
      pending: this.pvpDeployPending,
    });
  }

  exitLoadout() {
    if (this.mode !== 'loadout') return;
    this.audio.uiClick();
    if (this.gameType === 'pvp') {
      this.closeLoadout();
      this.leavePvpRoom(true);
      return;
    }
    const initial = this.loadoutInitial;
    this.closeLoadout();
    this.mode = initial ? 'title' : 'dead';
  }

  deployLoadout() {
    if (this.mode !== 'loadout' || this.pvpDeployPending) return false;
    if (this.respawnTimer > 0.01) {
      this.updateLoadoutScreenState();
      return false;
    }
    this.audio.resume();
    this.audio.uiClick();
    this.loadout = saveLoadout(this.loadout);
    if (this.gameType === 'pvp') {
      if (!this.pvp.playerId) return false;
      this.pvpDeployPending = true;
      this.updateLoadoutScreenState();
      this.pvp.deploy(this.loadout);
      this.input.requestLock();
      return true;
    }

    const firstDeployment = this.loadoutInitial;
    this.closeLoadout();
    this.respawnPlayer();
    this.input.requestLock();
    if (firstDeployment) {
      this.hud.banner(this.map.name, 'ELIMINATE THE OPFOR', 2.6, '#7de08a');
    }
    return true;
  }

  laserCannonReturnWeapon(candidate = this.railgunReturnWeapon) {
    return [this.loadout.primary, this.loadout.secondary, this.loadout.melee]
      .includes(candidate)
      ? candidate
      : this.loadout.primary;
  }

  activateLaserCannon() {
    if (this.railgunActive || this.railgunCharges <= 0
      || !loadoutHasStreak(this.loadout, LASER_CANNON_ID)
      || !this.player.alive || this.mode !== 'playing'
      || this.tvMissile || this.streakCall || this.casTargeting
      || this.firebombTargeting || this.grenadePinAt > 0) {
      return false;
    }
    this.stowGrenade();
    this.pvpRailgunFireCommitUntil = 0;
    this.railgunReturnWeapon = this.laserCannonReturnWeapon(
      this.viewModel.def?.id
    );
    this.fireLock = true;
    if (this.gameType === 'pvp') {
      if (this.pvpRailgunPending) return false;
      this.pvpRailgunPending = true;
      this.pvp.useAbility(LASER_CANNON_ID);
      return true;
    }

    this.railgunCharges--;
    this.railgunActive = true;
    this.viewModel.ammo[LASER_CANNON_ID] = {
      mag: 1,
      reserve: LASER_CANNON_SHOTS - 1,
    };
    this.viewModel.equip(LASER_CANNON_ID);
    this.playOperatorVoice({
      action: 'laser_cannon',
      actorId: 'player',
      speakerName: this.player.name,
      team: this.player.team,
    });
    this.hud.banner(
      'LASER CANNON ONLINE',
      '8 CHARGED SHOTS',
      2.0,
      '#ff5347'
    );
    return true;
  }

  endLaserCannon({ restoreWeapon = true, instant = false } = {}) {
    if (!this.railgunActive) return false;
    this.railgunActive = false;
    this.pvpRailgunFireCommitUntil = 0;
    this.audio.stopRailgunCharge();
    this.viewModel.chargeT = 0;
    this.viewModel.chargeProgress = 0;
    if (restoreWeapon && this.player.alive) {
      this.viewModel.equip(this.laserCannonReturnWeapon(), instant);
      this.fireLock = true;
    }
    return true;
  }

  syncPvpLaserCannon(own) {
    const authoritativeActive = own?.alive
      && own.weapon === LASER_CANNON_ID;
    this.pvpRailgunPending = false;
    if (authoritativeActive) {
      if (!this.railgunActive
        || (this.viewModel.def?.id !== LASER_CANNON_ID
          && this.viewModel.pendingWeapon !== LASER_CANNON_ID)) {
        this.stowGrenade();
        this.railgunReturnWeapon = this.laserCannonReturnWeapon(
          this.viewModel.def?.id
        );
        this.railgunActive = true;
        // Match PVE: let the shared viewmodel play its stow/swap/draw motion.
        // The pending-weapon guard above prevents 45 Hz snapshots from
        // restarting that animation before it reaches the swap point.
        this.viewModel.equip(LASER_CANNON_ID);
        this.viewModel.holder.visible = true;
        this.fireLock = true;
      }
      return;
    }
    if (!this.railgunActive) return;
    this.endLaserCannon({ restoreWeapon: false });
    if (own?.alive) {
      this.viewModel.equip(
        this.laserCannonReturnWeapon(own.weapon),
        true
      );
      this.viewModel.holder.visible = true;
      this.fireLock = true;
    }
  }

  streakKey(streakId) {
    return loadoutStreakKey(this.loadout, streakId);
  }

  streakSlotAvailable(index) {
    if (!this.player.alive || this.mode !== 'playing') return false;
    if (!juggernautCanUseKillstreak(this.player)) return false;
    const streak = this.loadout.streaks[index];
    if (this.railgunActive || this.tvMissile || this.streakCall || this.casTargeting
      || this.firebombTargeting || this.grenadePinAt > 0) {
      return false;
    }
    if (streak === 'uav') return this.uav.charges > 0 && this.uav.time <= 0;
    if (streak === LASER_CANNON_ID) {
      return this.railgunCharges > 0 && !this.pvpRailgunPending;
    }
    if (streak === 'strike') return this.strikeCharges > 0;
    if (streak === 'juggernaut') return this.juggernautCharges > 0;
    if (streak === 'sentry') return this.sentryCharges > 0;
    if (streak === 'cas') return this.casCharges > 0 && !this.pvpCasPending;
    if (streak === 'firebomb') {
      return this.firebombCharges > 0 && !this.pvpFirebombPending;
    }
    if (streak === 'attack_helicopter') return this.attackHelicopterCharges > 0;
    return false;
  }

  updateStreakWheelInput(input, dt, enabled) {
    const wasTracking = this.streakWheel.tracking;
    const selected = updateStreakWheelState(this.streakWheel, {
      enabled: enabled && juggernautCanUseKillstreak(this.player),
      pressed: input.pressed('KeyQ'),
      down: input.down('KeyQ'),
      released: input.released('KeyQ'),
      dx: input.dx,
      dy: input.dy,
      dt,
    });
    // Keep the release frame blocked as well. Otherwise the same mouse delta
    // that chose a sector could leak through as a camera snap when Q comes up.
    const blocksCombat = wasTracking || streakWheelBlocksCombat(
      this.streakWheel,
      input.down('KeyQ')
    );
    if (selected >= 0 && !this.activateStreakSlot(selected)) {
      this.hud.notice('KILLSTREAK UNAVAILABLE');
    }
    return blocksCombat;
  }

  activateStreakSlot(index) {
    if (!this.player.alive || this.mode !== 'playing') return false;
    if (!juggernautCanUseKillstreak(this.player)) return false;
    if (this.railgunActive) return false;
    const streak = this.loadout.streaks[index];
    if (streak === LASER_CANNON_ID) return this.activateLaserCannon();
    if (streak === 'uav' || streak === 'strike' || streak === 'juggernaut'
      || streak === 'attack_helicopter') {
      return this.beginStreakCall(streak);
    }
    if (streak === 'sentry') {
      if (this.sentryCharges <= 0 || this.tvMissile || this.streakCall
        || this.casTargeting || this.firebombTargeting) {
        return false;
      }
      if (this.gameType === 'pvp') this.pvp.useAbility('sentry');
      else {
        this.sentryCharges--;
        this.placeSentry();
      }
      return true;
    }
    if (streak === 'cas') {
      if (this.casCharges <= 0 || this.tvMissile || this.casTargeting
        || this.firebombTargeting
        || this.streakCall || this.pvpCasPending) return false;
      return this.beginCasTargeting();
    }
    if (streak === 'firebomb') {
      if (this.firebombCharges <= 0 || this.tvMissile || this.casTargeting
        || this.firebombTargeting || this.streakCall || this.pvpFirebombPending) {
        return false;
      }
      return this.beginFirebombTargeting();
    }
    return false;
  }

  /**
   * Swap the active arena: rebuild the level, re-point every actor that holds
   * a live level reference and refresh fog / background to the map's env.
   * PVE-only for now - the PVP rooms flow always runs on DEFAULT_MAP_ID.
   */
  applyMap(id) {
    const mapId = MAP_REGISTRY[id] ? id : DEFAULT_MAP_ID;
    if (this.level) {
      this.scene.remove(this.level.group);
      disposeLevel(this.level);
    }
    this.mapId = mapId;
    this.map = loadMap(mapId);
    this.level = buildLevelFromParts(this.map.parts, this.textures, { env: this.map.env });
    const fog = this.level.fog;
    this.scene.fog = fog
      ? new THREE.Fog(fog.color, fog.near, fog.far)
      : new THREE.Fog(0x9db4c6, 55, 210);
    this.scene.background = this.level.indoor
      ? new THREE.Color(fog ? fog.color : 0x11151a)
      : null;
    this.scene.add(this.level.group);
    // bake world matrices now, so raycasts are valid before the first frame
    this.scene.updateMatrixWorld(true);
    if (this.player) this.player.level = this.level;
    for (const bot of this.bots || []) bot.level = this.level;
  }

  startMatch() {
    this.gameType = 'pve';
    resetStreakWheelState(this.streakWheel);
    this.player.team = 'blue';
    this.viewModel.setTeam('blue');
    for (const bot of this.bots) bot.rig.root.visible = true;
    this.match = { blueTickets: MAX_TICKETS, redTickets: MAX_TICKETS, maxTickets: MAX_TICKETS, over: false, winner: null };
    this.uav.charges = 0;
    this.uav.time = 0;
    this.uav.ping = 0;
    this.clearUavDrones();
    this.strikeCharges = 0;
    this.endTvMissile();
    this.clearStreakCall(true);
    this.removeMissile();
    this.clearCasRuns();
    this.clearFirebombRuns();
    this.clearAttackHelicopters();
    this.clearGrenadeProjectiles();
    this.resetGrenadeLoadout();
    this.strikeFlash.intensity = 0;
    this.sentryCharges = 0;
    this.casCharges = 0;
    this.firebombCharges = 0;
    this.attackHelicopterCharges = 0;
    this.juggernautCharges = 0;
    this.railgunCharges = 0;
    this.railgunActive = false;
    this.pvpRailgunPending = false;
    this.pvpRailgunFireCommitUntil = 0;
    this.clearJuggernautAirdrops();
    this.setLocalJuggernaut(false, { fill: false, equip: false });
    this.pvpCasPending = false;
    this.pvpFirebombPending = false;
    this.destroySentry(false);
    this.totalScore = 0;
    this.killStreak = 0;
    this.streakScore = 0;
    this.multiKillCount = 0;
    this.player.kills = 0;
    this.player.deaths = 0;
    this.player.score = 0;
    this.readyForActionUntil = 0;
    this.viewModel.reset();
    this.applyLoadoutInventory();
    this.spawnTeams();
    this.holdPlayerForDeployment();
    this.respawnTimer = 0;
    this.hud.killfeed.length = 0;
    this.hud.clearCombatFeedback();
    this.resetDialogueState();
    this.hud.clearOperatorSubtitles();
    this.openLoadout(true);
  }

  deploy() {
    this.audio.resume();
    if (this.match.over && this.gameType === 'pve') {
      this.startMatch();
      return;
    }
    this.mode = this.player.alive ? 'playing' : 'dead';
    if (this.player.alive) {
      this.input.requestLock();
    } else this.input.releaseLock();
  }

  respawnPlayer() {
    if (this.gameType === 'pvp') return;
    resetStreakWheelState(this.streakWheel);
    this.clearKillerCamera();
    this.player.respawn(this.pickSpawn('blue'));
    this.setLocalJuggernaut(false, { fill: true, equip: false });
    this.player.killedBy = null;
    this.viewModel.reset();
    this.applyLoadoutInventory({ fillArmor: true });
    this.resetGrenadeLoadout();
    this.readyForActionUntil = readyForActionUntil(this.loadout, this.time);
    this.mode = 'playing';
    this.flashTimer = 0.12;
    // the click / spacebar that redeployed must not fire or jump on spawn
    this.fireLock = true;
    this.jumpLock = true;
  }

  handleMenuClick(id) {
    if (!id) return false;
    this.audio.resume();
    this.audio.uiClick();
    
    if (id === 'logout') {
      window.location.href = '/auth/logout';
    }

    if (id === 'mode:pve') {
      if (this.gameType === 'pvp') this.leavePvpRoom(false);
      this.startMatch();
      return true;
    }
    if (id === 'mode:pvp') {
      // PVP is not map-aware yet: every room runs on the default arena.
      if (this.mapId !== DEFAULT_MAP_ID) this.applyMap(DEFAULT_MAP_ID);
      this.openPvpRooms();
      return true;
    }
    if (id.startsWith('map:')) {
      const mapId = id.slice(4);
      if (this.gameType !== 'pvp' && MAP_REGISTRY[mapId] && mapId !== this.mapId) {
        this.applyMap(mapId);
      }
      return true;
    }
    if (id.startsWith('room:')) {
      if (this.pvpRegionCheckPending) {
        this.hud.notice('CHECKING NETWORK...');
        return true;
      }
      const roomId = id.slice(5);
      this.pvp.join(roomId, this.pvpName);
      return true;
    }
    if (id === 'rooms-back') {
      this.pvpRegionCheckSeq++;
      this.pvpRegionCheckPending = false;
      this.pvp.leave();
      this.mode = 'title';
      return true;
    }
    if (id === 'leave-pvp') {
      this.leavePvpRoom(true);
      return true;
    }
    if (id === 'return-title') {
      if (this.gameType === 'pve') {
        this.input.releaseLock();
        this.mode = 'title';
      }
      return true;
    }
    if (id === 'vote-kick') {
      if (this.gameType === 'pvp') {
        this.pvpVoteKickMenuOpenedAt = performance.now();
        this.mode = 'votekick';
      }
      return true;
    }
    if (id === 'vote-kick-back') {
      this.mode = 'paused';
      return true;
    }
    if (id.startsWith('vote-kick-player:')) {
      // Ignore a duplicate DOM press carried across the menu transition. A
      // player must visibly open the list, then make a separate selection.
      if (performance.now() - this.pvpVoteKickMenuOpenedAt < 180) return true;
      const targetId = id.slice('vote-kick-player:'.length);
      if (this.gameType === 'pvp' && targetId) this.pvp.startVoteKick(targetId);
      this.mode = 'paused';
      return true;
    }
    if (id === 'play' || id === 'resume') { this.deploy(); return true; }
    if (id === 'settings') { this.prevMode = this.mode; this.mode = 'settings'; return true; }
    if (id === 'back') {
      this.mode = ['paused', 'rooms'].includes(this.prevMode) ? this.prevMode : 'title';
      return true;
    }
    if (id === 'restart') {
      if (this.gameType === 'pvp') this.leavePvpRoom(true);
      else this.startMatch();
      return true;
    }
    if (id.startsWith('set:')) {
      const [, sign, key] = id.split(':');
      adjustSetting(this.settings, key, sign === '+' ? 1 : -1);
      this.applySettings();
      return true;
    }
    return false;
  }

  applySettings() {
    saveSettings(this.settings);
    this.applyLanguage();
    this.pipeline.applySettings();
    this.resize();
    if (this.audio.ready) this.audio.master.gain.value = this.settings.volume;
  }

  applyLanguage() {
    applyDocumentLanguage(this.settings.language);
    this.loadoutScreen?.setLanguage(this.settings.language);
    const chatMode = this.chatEntry?.querySelector('span');
    if (chatMode) chatMode.textContent = localizeText('ALL', this.settings.language);
    if (this.chatInput) {
      this.chatInput.setAttribute(
        'aria-label',
        localizeText('PVP room chat', this.settings.language)
      );
    }
    for (const name of this.chatLog?.querySelectorAll('.chat-name') || []) {
      const playerName = name.dataset.playerName || 'PLAYER';
      name.textContent = `[${localizeText('ALL', this.settings.language)}] ${playerName}: `;
    }
    const boot = document.getElementById('boot');
    const bootLabel = boot?.querySelector('span');
    if (bootLabel) bootLabel.textContent = localizeText('LOADING', this.settings.language);
    if (this.systemDialogOpen) this.renderSystemDialogCopy();
    else if (this.systemDialogConfirm) {
      this.systemDialogConfirm.textContent = localizeText('CONFIRM', this.settings.language);
    }
  }

  /* ---------------------------------------------------------------- loop */

  loop = (now) => {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt)) dt = 0.016;
    dt = clamp(dt, 0.0005, 0.05);
    this.time += dt;

    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.step(dt);
    if (this.updateKillerCamera(dt)) this.updateListener();
    this.render(dt);
    this.input.endFrame();
  }

  step(dt) {
    const input = this.input;
    if (this.mode !== 'playing') this.grenadeTrajectory.hide();
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);

    /* ---- menu interaction (clicks come from Input.onPress) ---- */
    this.hud.hoverId = input.locked ? null : this.hud.pick(input.pointer.x, input.pointer.y);

    // NOTE: leaving pointer lock already pauses the game, so ESC while paused
    // is ignored - otherwise the same key press would instantly un-pause.
    if (input.pressed('Escape')) {
      if (this.mode === 'settings') this.mode = this.prevMode === 'paused' ? 'paused' : 'title';
      else if (this.mode === 'votekick') this.mode = 'paused';
      else if (this.mode === 'playing' || this.mode === 'dead') { this.mode = 'paused'; input.releaseLock(); }
    }
    this.syncJuggernautBreathing();
    this.syncRailgunChargeAudio();
    this.syncMatchAmbience();
    if (this.mode !== 'playing') resetStreakWheelState(this.streakWheel);

    if ((this.mode === 'paused' || this.mode === 'settings' || this.mode === 'votekick')
      && !keepsPvpSimulationRunning(this.gameType, this.mode)) {
      this.hud.update(dt);
      return;
    }
    this.updateJuggernautAirdrops(dt);

    if (this.mode === 'loadout') {
      if (this.gameType === 'pvp') {
        this.stepPvp(dt);
      } else {
        this.respawnTimer = Math.max(0, this.respawnTimer - dt);
        this.world.time = this.time;
        for (const bot of this.bots) {
          bot.update(dt, this.world);
          if (!bot.alive && bot.deadTimer > 9) bot.spawn(this.pickSpawn(bot.team));
        }
        this.effects.update(dt);
        this.hud.update(dt);
      }
      this.updateMenuCamera(dt);
      this.updateLoadoutScreenState();
      this.updateListener();
      return;
    }

    // On the menus the match keeps running in the background: bots fight each
    // other while the camera drifts over the arena.
    if (this.mode === 'title' || this.mode === 'gameover'
      || this.mode === 'rooms' || this.mode === 'mapvote') {
      this.updateMenuCamera(dt);
      this.world.time = this.time;
      if (this.gameType !== 'pvp') {
        for (const bot of this.bots) {
          bot.update(dt, this.world);
          if (!bot.alive && bot.deadTimer > 9) bot.spawn(this.pickSpawn(bot.team));
        }
      }
      this.effects.update(dt);
      this.hud.update(dt);
      this.updateListener();
      return;
    }

    if (this.casTargeting?.entering) {
      this.updateDeviceHolster(this.casTargeting, dt);
    }
    if (this.firebombTargeting?.entering) {
      this.updateDeviceHolster(this.firebombTargeting, dt);
    }

    if (this.gameType === 'pvp') {
      this.stepPvp(dt);
      return;
    }

    const streakWheelBlocks = this.updateStreakWheelInput(
      input,
      dt,
      this.player.alive
        && this.mode === 'playing'
        && input.locked
        && !this.railgunActive
        && !this.tvMissile
        && !this.casTargeting
        && !this.firebombTargeting
        && !this.streakCall
        && this.grenadePinAt <= 0
    );

    /* ---- look / missile steering ---- */
    this.player.adsScale = this.grenadeSelected || this.grenadePinAt > 0
      ? 1
      : lerp(1, this.viewModel.def.adsFov < 0.5 ? 0.42 : 0.72, this.viewModel.adsBlend);
    if (this.casTargeting && this.player.alive && this.mode === 'playing') {
      this.updateCasTargetingInput(input, dt);
    } else if (this.firebombTargeting && this.player.alive && this.mode === 'playing') {
      this.updateFirebombTargetingInput(input, dt);
    } else if (this.tvMissile && this.player.alive && this.mode === 'playing') {
      // Flying the warhead: the mouse aims the missile, the body is frozen.
      if (input.locked) {
        this.steerTvMissileFromMouse(input.dx, input.dy, dt);
        if (input.mousePressed(0)) this.triggerTvMissileTerminalBoost();
      }
    } else if (input.locked && this.player.alive && !streakWheelBlocks) {
      this.player.look(input.dx, input.dy);
    }

    /* ---- respawn ---- */
    if (!this.player.alive) {
      this.respawnTimer = Math.max(0, this.respawnTimer - dt);
      if (input.pressed('Enter')) {
        this.openLoadout(false);
      } else if (automaticRespawnReady({
        alive: this.player.alive,
        deathAnimation: this.player.deathAnim,
        remaining: this.respawnTimer,
      })) {
        this.respawnPlayer();
      }
    }

    /* ---- weapon selection ---- */
    if (this.player.alive && !this.railgunActive
      && !this.tvMissile && !this.casTargeting
      && !this.firebombTargeting
      && !this.streakCall && !streakWheelBlocks) {
      const equipmentSlot = pressedEquipmentSlot(input);
      if (!this.player.juggernaut && equipmentSlot === 'grenade') {
        this.toggleGrenade();
      } else if (!this.player.juggernaut && equipmentSlot === 'primary' && this.stowGrenade()) {
        this.viewModel.equip(this.loadout.primary);
      } else if (!this.player.juggernaut && equipmentSlot === 'secondary' && this.stowGrenade()) {
        const secondary = loadoutSecondaryOption(this.loadout);
        if (secondary?.live) this.viewModel.equip(this.loadout.secondary);
      } else if (!this.player.juggernaut && equipmentSlot === 'melee' && this.stowGrenade()) {
        this.viewModel.equip(this.loadout.melee);
      }
    }

    /* ---- killstreaks ---- */
    if (this.player.alive && this.mode === 'playing' && !streakWheelBlocks) {
      if (input.pressed('Digit5')) this.activateStreakSlot(0);
      if (input.pressed('Digit6')) this.activateStreakSlot(1);
      if (input.pressed('Digit7')) this.activateStreakSlot(2);
    }
    this.updateStreakCall(dt);
    this.updateWeaponReturn(dt);
    if (this.sentry) this.updateSentry(dt);
    if (this.uav.time > 0) {
      this.uav.time = Math.max(0, this.uav.time - dt);
      this.uav.ping -= dt;
      if (this.uav.ping <= 0) {
        this.uav.ping = UAV_SWEEP_INTERVAL_SECONDS;
        this.audio.uavPing();
      }
      if (this.uav.time <= 0 && this.gameType === 'pve') {
        this.playStreakVoice('uav_outbound');
      }
    }
    this.updatePendingDialogueVoices();
    this.updateUavDrones();
    if (this.missile) this.updateMissile(dt);
    if (this.tvMissile) this.updateTvMissile(dt);
    this.updateCasRuns(dt);
    this.updateFirebombRuns(dt);
    this.updateAttackHelicopters(dt);
    if (this.strikeFlash.intensity > 0) {
      this.strikeFlash.intensity *= Math.exp(-3.4 * dt);
      if (this.strikeFlash.intensity < 0.15) this.strikeFlash.intensity = 0;
    }

    /* ---- bots ---- */
    this.world.time = this.time; //modify point
    for (const bot of this.bots) {
      bot.update(dt, this.world);
      if (!bot.alive && bot.deadTimer > customConfig.deadTimer && !this.match.over) {
        bot.spawn(this.pickSpawn(bot.team));
      }
    }

    /* ---- player ---- */
    // release the input latches once their buttons come back up
    if (this.fireLock && !input.mouseDown(0)) this.fireLock = false;
    if (this.jumpLock && !input.down('Space')) this.jumpLock = false;
    const airdropClaiming = this.updateAirdropInteraction(
      dt,
      input,
      this.player.alive
        && this.mode === 'playing'
        && input.locked
        && !this.tvMissile
        && !this.casTargeting
        && !this.firebombTargeting
        && !this.streakCall
    );
    const grenadeCanAct = this.player.alive
      && this.mode === 'playing'
      && input.locked
      && this.grenadeSelected
      && !this.railgunActive
      && !this.casTargeting
      && !this.firebombTargeting
      && !this.streakCall
      && !streakWheelBlocks
      && !airdropClaiming;
    this.grenadeThrowAiming = grenadeCanAct
      && (input.mouseDown(2) || this.grenadeImpactThrowHeld);
    if (grenadeCanAct && !this.fireLock) {
      const grenadeAction = grenadeInputAction({
        selected: this.grenadeSelected,
        pinned: this.grenadePinAt > 0,
        leftPressed: input.mousePressed(0),
        leftDown: input.mouseDown(0),
        leftReleased: input.mouseReleased(0),
        rightDown: input.mouseDown(2),
        impactFused: grenadeDetonatesOnImpact(this.loadout.grenade),
        impactHeld: this.grenadeImpactThrowHeld,
      });
      if (grenadeAction === 'pull-pin') this.beginGrenadePin();
      else if (grenadeAction === 'throw-direct') this.requestGrenadeThrow({ direct: true });
      else if (grenadeAction === 'throw-cooked') this.requestGrenadeThrow();
      else if (grenadeAction === 'hold-impact') this.grenadeImpactThrowHeld = true;
      else if (grenadeAction === 'cancel-impact-hold') {
        this.grenadeImpactThrowHeld = false;
      }
    }
    const grenadeActive = this.grenadeSelected
      || this.grenadePinAt > 0
      || this.grenadeView.throwing;
    const readyActive = readyForActionActive(
      this.loadout,
      this.readyForActionUntil,
      this.time
    );

    // C slides when you are already running, and is a plain crouch otherwise,
    // so the key is never dead no matter what you are doing.
    const movementDeviceActive = Boolean(
      this.casTargeting || this.firebombTargeting || this.streakCall?.type === 'strike'
    );
    const weaponDeviceActive = Boolean(
      this.casTargeting || this.firebombTargeting
      || this.streakCall || this.weaponReturnDelay > 0
      || streakWheelBlocks
    );
    const move = movementDeviceActive ? { x: 0, z: 0 } : input.moveAxis();
    const cmd = {
      move,
      jump: !movementDeviceActive && input.down('Space') && !this.jumpLock,
      crouch: !movementDeviceActive
        && (input.down('ControlLeft') || (input.down('KeyC') && !this.player.canSlide())),
      slide: !movementDeviceActive && input.pressed('KeyC'),
      sprint: !movementDeviceActive && input.down('ShiftLeft'),
      aim: !this.viewModel.def.melee
        && !weaponDeviceActive && !grenadeActive && !airdropClaiming && input.mouseDown(2),
      aimBlend: this.viewModel.adsBlend,
      speedMult: (grenadeActive
        ? 0.95
        : this.viewModel.def.moveMult * (1 - this.viewModel.adsBlend * 0.12))
        * loadoutMovementMultiplier(this.loadout)
        * readyForActionMovementMultiplier(readyActive),
    };
    this.player.adsBlend = this.viewModel.adsBlend;
    this.player.update(dt, cmd);

    /* ---- weapon ---- */
    this.viewModel.update(dt, {
      trigger: !grenadeActive
        && !weaponDeviceActive
        && !airdropClaiming
        && input.mouseDown(0) && input.locked && !this.tvMissile && !this.fireLock,
      aim: cmd.aim,
      reload: !grenadeActive && !airdropClaiming && input.pressed('KeyR'),
      sprinting: this.player.sprinting,
      sliding: this.player.sliding,
      slideBlend: this.player.slideBlend,
      moveSpeed: this.player.speed2D,
      grounded: this.player.grounded,
      crouch: this.player.crouching,
      lookDx: (streakWheelBlocks ? 0 : input.dx) * 0.02,
      lookDy: (streakWheelBlocks ? 0 : input.dy) * 0.02,
      landImpact: this.player.landImpact,
      dead: !this.player.alive,
      unlimitedAmmo: readyActive,
      canAct: this.mode === 'playing' && input.locked
        && !this.tvMissile && !grenadeActive && !weaponDeviceActive
        && !airdropClaiming,
    });
    if (this.railgunActive
      && this.viewModel.def?.id === LASER_CANNON_ID
      && (this.viewModel.ammo[LASER_CANNON_ID]?.mag || 0)
        + (this.viewModel.ammo[LASER_CANNON_ID]?.reserve || 0) <= 0) {
      this.endLaserCannon();
    }
    this.grenadeView.update(dt, {
      selected: this.grenadeSelected,
      aiming: this.grenadeThrowAiming,
      pinned: this.grenadePinAt > 0,
      sprinting: this.player.sprinting,
      dead: !this.player.alive,
      moveSpeed: this.player.speed2D,
      grounded: this.player.grounded,
      lookDx: (streakWheelBlocks ? 0 : input.dx) * 0.02,
      lookDy: (streakWheelBlocks ? 0 : input.dy) * 0.02,
    });
    this.updateGrenadeTrajectory();
    // A settled sniper optic owns the frame too. Do not undo ViewModel's
    // scoped hide here; that regression put the rifle directly over the scope.
    this.viewModel.holder.visible = !this.viewModel.scoped
      && !(this.tvMissile || grenadeActive || this.deviceOwnsWeaponView());
    this.updateGrenades(dt);

    /* ---- deaths that bypass the damage pipeline (falling) ---- */
    if (!this.player.alive && this.mode === 'playing') {
      this.onPlayerKilled(this.player.killedBy, null);
    }

    /* ---- multi-kill window ---- */
    if (this.multiKillTimer > 0) {
      this.multiKillTimer -= dt;
      if (this.multiKillTimer <= 0) this.multiKillCount = 0;
    }

    this.effects.update(dt);
    this.hud.update(dt);
    this.updateListener();
  }

  stepPvp(dt) {
    const input = this.input;
    const player = this.player;
    const vm = this.viewModel;
    const readyActive = this.pvpReadyForActionActive;
    const canControl = this.mode === 'playing' && input.locked && !this.chatOpen;
    let movementDeviceActive = Boolean(
      this.casTargeting || this.firebombTargeting || this.streakCall?.type === 'strike'
    );
    let weaponDeviceActive = Boolean(
      this.casTargeting || this.firebombTargeting
      || this.streakCall || this.weaponReturnDelay > 0
    );
    let bodyControl = canControl && !movementDeviceActive;
    this.pvpVoteKickCooldown = Math.max(0, this.pvpVoteKickCooldown - dt);
    if (this.pvpCasPending && this.time >= this.pvpCasPendingUntil) {
      this.pvpCasPending = false;
    }
    if (this.pvpFirebombPending && this.time >= this.pvpFirebombPendingUntil) {
      this.pvpFirebombPending = false;
    }
    if (this.pvpVoteKick?.canVote && !this.pvpVoteKick.yourVote) {
      if (input.pressed('KeyY')) this.pvp.castVoteKick(true);
      else if (input.pressed('KeyN')) this.pvp.castVoteKick(false);
    }
    this.pvpUavRevealTime = Math.max(0, this.pvpUavRevealTime - dt);
    player.adsScale = this.grenadeSelected || this.grenadePinAt > 0
      ? 1
      : lerp(1, vm.def.adsFov < 0.5 ? 0.42 : 0.72, vm.adsBlend);
    const streakWheelBlocks = this.updateStreakWheelInput(
      input,
      dt,
      canControl && player.alive
        && !this.railgunActive
        && !this.tvMissile
        && !this.casTargeting
        && !this.firebombTargeting
        && !this.streakCall
        && this.grenadePinAt <= 0
    );

    if (this.casTargeting && player.alive && canControl) {
      this.updateCasTargetingInput(input, dt);
    } else if (this.firebombTargeting && player.alive && canControl) {
      this.updateFirebombTargetingInput(input, dt);
    } else if (this.tvMissile && player.alive && canControl) {
      if (input.locked) {
        this.steerTvMissileFromMouse(input.dx, input.dy, dt);
        if (input.mousePressed(0)) this.triggerTvMissileTerminalBoost();
      }
    } else if (canControl && player.alive && !streakWheelBlocks && !this.streakCall) {
      player.look(input.dx, input.dy);
    }

    if (player.alive && !this.railgunActive
      && !this.tvMissile && !this.casTargeting
      && !this.firebombTargeting
      && !this.streakCall && canControl && !streakWheelBlocks) {
      const equipmentSlot = pressedEquipmentSlot(input);
      if (!player.juggernaut && equipmentSlot === 'grenade') {
        this.toggleGrenade();
      } else if (!player.juggernaut && equipmentSlot === 'primary' && this.stowGrenade()) {
        vm.equip(this.loadout.primary);
      } else if (!player.juggernaut && equipmentSlot === 'secondary' && this.stowGrenade()) {
        const secondary = loadoutSecondaryOption(this.loadout);
        if (secondary?.live) vm.equip(this.loadout.secondary);
      } else if (!player.juggernaut && equipmentSlot === 'melee' && this.stowGrenade()) {
        vm.equip(this.loadout.melee);
      }
    }

    if (player.alive && canControl && !streakWheelBlocks) {
      if (input.pressed('Digit5')) this.activateStreakSlot(0);
      if (input.pressed('Digit6')) this.activateStreakSlot(1);
      if (input.pressed('Digit7')) this.activateStreakSlot(2);
    }
    this.updateStreakCall(dt);
    this.updatePendingDialogueVoices();
    this.updateWeaponReturn(dt);
    movementDeviceActive = Boolean(
      this.casTargeting || this.firebombTargeting || this.streakCall?.type === 'strike'
    );
    weaponDeviceActive = Boolean(
      this.casTargeting || this.firebombTargeting
      || this.streakCall || this.weaponReturnDelay > 0
      || streakWheelBlocks
    );
    bodyControl = canControl && !movementDeviceActive;

    if (this.fireLock && !input.mouseDown(0)) this.fireLock = false;
    if (this.jumpLock && !input.down('Space')) this.jumpLock = false;
    const airdropClaiming = this.updateAirdropInteraction(
      dt,
      input,
      player.alive && bodyControl && !weaponDeviceActive && !this.tvMissile
    );
    const grenadeCanAct = player.alive && bodyControl && !weaponDeviceActive
      && this.grenadeSelected && !this.railgunActive && !this.casTargeting
      && !this.firebombTargeting && !airdropClaiming;
    this.grenadeThrowAiming = grenadeCanAct
      && (input.mouseDown(2) || this.grenadeImpactThrowHeld);
    if (grenadeCanAct && !this.fireLock) {
      const grenadeAction = grenadeInputAction({
        selected: this.grenadeSelected,
        pinned: this.grenadePinAt > 0,
        leftPressed: input.mousePressed(0),
        leftDown: input.mouseDown(0),
        leftReleased: input.mouseReleased(0),
        rightDown: input.mouseDown(2),
        impactFused: grenadeDetonatesOnImpact(this.loadout.grenade),
        impactHeld: this.grenadeImpactThrowHeld,
      });
      if (grenadeAction === 'pull-pin') this.beginGrenadePin();
      else if (grenadeAction === 'throw-direct') this.requestGrenadeThrow({ direct: true });
      else if (grenadeAction === 'throw-cooked') this.requestGrenadeThrow();
      else if (grenadeAction === 'hold-impact') this.grenadeImpactThrowHeld = true;
      else if (grenadeAction === 'cancel-impact-hold') {
        this.grenadeImpactThrowHeld = false;
      }
    }
    const grenadeInputActive = this.grenadeSelected
      || this.grenadePinAt > 0
      || this.pvpGrenadeThrowQueued;
    const grenadeActionActive = grenadeInputActive || this.grenadeView.throwing;
    const move = bodyControl ? input.moveAxis() : { x: 0, z: 0 };
    this.pvpJumpBuffer = Math.max(0, this.pvpJumpBuffer - dt);
    const jumpPressed = bodyControl && input.pressed('Space') && !this.jumpLock;
    if (jumpPressed) {
      // Preserve a short tap until the next 45 Hz send and allow a tiny
      // landing buffer. A held key is consumed once, so touching the steep
      // stair plane cannot trigger a chain of prediction-only micro-jumps.
      this.pvpJumpQueued = true;
      this.pvpJumpBuffer = 0.18;
    }
    const jumpNow = bodyControl && player.grounded && this.pvpJumpBuffer > 0;
    if (jumpNow) this.pvpJumpBuffer = 0;
    const slidePressed = bodyControl && input.pressed('KeyC');
    const reloadPressed = !readyActive && !vm.def.melee
      && bodyControl && !weaponDeviceActive
      && !grenadeActionActive && !airdropClaiming && input.pressed('KeyR');
    this.pvpSlideQueued ||= slidePressed;
    this.pvpReloadQueued ||= reloadPressed;
    const cmd = {
      move,
      jump: jumpNow,
      crouch: bodyControl
        && (input.down('ControlLeft') || (input.down('KeyC') && !player.canSlide())),
      slide: slidePressed,
      sprint: bodyControl && input.down('ShiftLeft'),
      aim: !vm.def.melee && bodyControl && !weaponDeviceActive
        && !grenadeActionActive && !airdropClaiming && input.mouseDown(2),
      aimBlend: vm.adsBlend,
      speedMult: (grenadeActionActive
        ? 0.95
        : vm.def.moveMult * (1 - vm.adsBlend * 0.12))
        * loadoutMovementMultiplier(this.loadout)
        * readyForActionMovementMultiplier(readyActive),
      serverOwnsVitals: true,
    };
    player.adsBlend = vm.adsBlend;
    const movementCmd = player.alive ? cmd : {
      move: { x: 0, z: 0 },
      jump: false,
      crouch: false,
      slide: false,
      sprint: false,
      aim: false,
      aimBlend: 0,
      speedMult: 1,
      serverOwnsVitals: true,
    };
    const movementSteps = player.alive ? PVP_MOVEMENT_SUBSTEPS : 1;
    for (let i = 0; i < movementSteps; i++) {
      player.update(dt / movementSteps, {
        ...movementCmd,
        // Jump and slide are edge actions; held movement remains active in
        // both prediction substeps.
        jump: i === 0 && movementCmd.jump,
        slide: i === 0 && movementCmd.slide,
      });
    }
    // Player.update() places the camera on the corrected physics body. Apply
    // the inverse render offset afterwards, then let it converge continuously
    // across rendered frames. Aim, damage and collision remain server-owned.
    decayViewCorrection(this.pvpViewCorrection, dt);
    this.camera.position.add(this.pvpViewCorrection);
    this.recordPvpPose();
    if (!player.alive && this.mode === 'playing') this.mode = 'dead';

    const magazineReloadBlocksFire = !vm.def.shellReload && (
      vm.reloading || this.pvpServerReloading?.weapon === vm.def.id
    );
    const pvpTrigger = bodyControl
      && !weaponDeviceActive
      && !grenadeInputActive
      && !this.grenadeView.throwing
      && !airdropClaiming
      && input.mouseDown(0)
      && !this.tvMissile
      && !this.fireLock
      && !reloadPressed
      && !magazineReloadBlocksFire;
    const wasReloading = vm.reloading;
    vm.update(dt, {
      trigger: pvpTrigger,
      aim: cmd.aim,
      reload: reloadPressed,
      sprinting: player.sprinting,
      sliding: player.sliding,
      slideBlend: player.slideBlend,
      moveSpeed: player.speed2D,
      grounded: player.grounded,
      crouch: player.crouching,
      lookDx: (streakWheelBlocks ? 0 : input.dx) * 0.02,
      lookDy: (streakWheelBlocks ? 0 : input.dy) * 0.02,
      landImpact: player.landImpact,
      dead: !player.alive,
      unlimitedAmmo: readyActive,
      canAct: bodyControl && !weaponDeviceActive
        && !this.tvMissile && !grenadeActionActive && !airdropClaiming,
    });
    const railgunCommit = this.pvpRailgunFireCommitActive();
    this.grenadeView.update(dt, {
      selected: this.grenadeSelected,
      aiming: this.grenadeThrowAiming,
      pinned: this.grenadePinAt > 0,
      sprinting: player.sprinting,
      dead: !player.alive,
      moveSpeed: player.speed2D,
      grounded: player.grounded,
      lookDx: (streakWheelBlocks ? 0 : input.dx) * 0.02,
      lookDy: (streakWheelBlocks ? 0 : input.dy) * 0.02,
    });
    this.updateGrenadeTrajectory();
    this.notePvpAmmoPrediction();
    if (!wasReloading && vm.reloading) {
      this.pvpPredictedReload = { weapon: vm.def.id, seq: null };
      // ViewModel can begin an automatic reload after the local last round.
      // Queue it just like an R press; otherwise the animation can fill the
      // local magazine while the authoritative server never started a reload.
      // ARC-7 reloadEachShot is different: the authority automatically starts
      // its battery swap after accepting the charged shot. Sending this local
      // prediction as a reload request would be processed before the final
      // charge tick and cancel the shot.
      this.pvpReloadQueued = vm.def.id === LASER_CANNON_ID && railgunCommit
        ? false
        : true;
    }
    vm.holder.visible = !vm.scoped
      && !(this.tvMissile || grenadeActionActive || this.deviceOwnsWeaponView());

    this.pvpSendAcc += dt * 1000;
    if (this.pvpSendAcc >= PVP_TICK_MS) {
      this.pvpSendAcc %= PVP_TICK_MS;
      const seq = ++this.pvpInputSeq;
      const reload = Boolean(this.pvpReloadQueued && !railgunCommit);
      const grenadeThrow = Boolean(this.pvpGrenadeThrowQueued);
      const triggerEdge = (railgunCommit || pvpTrigger) && !this._lastShotTrigger;
      this._lastShotTrigger = railgunCommit || pvpTrigger;
      const meleeAttack = Boolean(this.pvpMeleeQueued);
      const weapon = vm.pendingWeapon || vm.def.id;
      const shotAim = pvpShotAimForInput(this.pvpShotAim, {
        weapon,
        trigger: railgunCommit ? true : pvpTrigger,
        yaw: player.yaw,
        pitch: player.pitch,
        now: performance.now(),
      });
      if (shotAim.discardPending) this.pvpShotAim = null;
      const inputSent = this.pvp.sendInput({
        seq,
        moveX: move.x,
        moveZ: move.z,
        jump: Boolean(this.pvpJumpQueued),
        crouch: cmd.crouch,
        slide: Boolean(this.pvpSlideQueued),
        sprint: railgunCommit ? false : cmd.sprint,
        aim: railgunCommit ? true : cmd.aim,
        trigger: railgunCommit ? true : pvpTrigger,
        reload,
        grenade: grenadeInputActive,
        grenadePin: Boolean(this.pvpGrenadePinQueued),
        grenadeThrow,
        grenadeAim: this.grenadeThrowAiming,
        meleeAttack,
        weapon,
        // Flying a warhead: the look angles are the missile's requested
        // heading, not the body's, and the server routes them accordingly.
        missileControl: Boolean(this.tvMissile),
        missileBoost: Boolean(this.tvMissile && this.pvpMissileBoostQueued),
        interact: airdropClaiming,
        yaw: this.tvMissile ? this.tvMissile.wantYaw : shotAim.yaw,
        pitch: this.tvMissile ? this.tvMissile.wantPitch : shotAim.pitch,
      });
      if (SHOT_DEBUG && triggerEdge && inputSent) {
        localShotLog('send', `seq=${seq} weapon=${weapon} trigger=1 ads=${cmd.aim ? 1 : 0} look=(${shotAim.yaw.toFixed(4)},${shotAim.pitch.toFixed(4)}) usesPending=${shotAim.usesPending ? 1 : 0}`);
      }
      // NOTE: keep pvpShotAim alive across the whole trigger hold. Releasing it
      // here after a single packet let the next held-trigger packet carry the
      // post-aimKick pitch, overwriting the pre-kick aim on the server and
      // pushing the authoritative round above the crosshair. The pending aim is
      // instead cleared on trigger release / TTL expiry via `discardPending`.
      if (reload) {
        if (this.pvpPredictedReload?.weapon !== vm.def.id) {
          this.pvpPredictedReload = { weapon: vm.def.id, seq };
        } else {
          this.pvpPredictedReload.seq = seq;
        }
      }
      if (inputSent) {
        this.pvpJumpQueued = false;
        this.pvpSlideQueued = false;
        this.pvpReloadQueued = false;
        this.pvpGrenadePinQueued = false;
        this.pvpMissileBoostQueued = false;
        this.pvpMeleeQueued = false;
      }
      if (inputSent && grenadeThrow) {
        this.pvpGrenadeThrowQueued = false;
        this.grenadePinAt = 0;
        this.grenadeThrowAiming = false;
        if (!this.grenadeView.throwing) this.grenadeView.reset();
        this.grenadeTrajectory.hide();
      }
    }

    for (const remote of this.pvpRemotes.values()) remote.update(dt);
    this.updatePvpSentryViews();
    this.updateUavDrones();
    if (this.missile) this.updateMissile(dt);
    if (this.tvMissile) this.updateTvMissile(dt);
    this.updateCasRuns(dt);
    this.updateFirebombRuns(dt);
    this.updateAttackHelicopters(dt);
    this.updateGrenades(dt);
    if (this.strikeFlash.intensity > 0) {
      this.strikeFlash.intensity *= Math.exp(-3.4 * dt);
      if (this.strikeFlash.intensity < 0.15) this.strikeFlash.intensity = 0;
    }
    this.effects.update(dt);
    this.hud.update(dt);
    this.updateListener();
  }

  updateListener() {
    const fwd = this._v1.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = this._v2.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.audio.setListener(this.camera.position, right, fwd);
  }

  beginActorKillerCamera(actor) {
    if (!actor || actor === this.player || !actor.position || actor.alive === false) {
      this.clearKillerCamera();
      return false;
    }
    this.killerCamera = createKillerCamera(this.camera, {
      kind: 'actor',
      actor,
    });
    this.killerCameraViewActive = false;
    return true;
  }

  beginPvpKillerCamera(killerId) {
    if (!killerId || killerId === this.pvp.playerId) {
      this.clearKillerCamera();
      return false;
    }
    const current = this.killerCamera?.targetRef;
    if (current?.kind === 'pvp' && current.id === killerId
      && this.killerCamera.phase !== 'done') {
      return true;
    }
    this.killerCamera = createKillerCamera(this.camera, {
      kind: 'pvp',
      id: killerId,
    });
    this.killerCameraViewActive = false;
    return true;
  }

  clearKillerCamera() {
    this.killerCamera = null;
    this.killerCameraViewActive = false;
  }

  killerCameraTarget() {
    const ref = this.killerCamera?.targetRef;
    if (ref?.kind === 'actor') return ref.actor || null;
    if (ref?.kind === 'pvp') return this.pvpRemotes.get(ref.id) || null;
    return null;
  }

  castKillerCameraWorld(origin, direction, distance) {
    this.raycaster.set(origin, direction);
    this.raycaster.near = 0.04;
    this.raycaster.far = distance;
    const hit = this.raycaster.intersectObjects(this.level.solids, false)[0];
    this.raycaster.near = 0;
    return hit ? hit.distance : null;
  }

  updateKillerCamera(dt) {
    const state = this.killerCamera;
    if (!state) {
      this.killerCameraViewActive = false;
      return false;
    }
    if (this.player.alive
      || this.mode === 'loadout'
      || this.mode === 'title'
      || this.mode === 'rooms'
      || this.mode === 'gameover') {
      this.clearKillerCamera();
      return false;
    }

    // Offline pause truly freezes the world. Preserve the current third-person
    // frame and its phase; online menus continue with the authoritative match.
    if (this.gameType === 'pve'
      && (this.mode === 'paused' || this.mode === 'settings' || this.mode === 'votekick')) {
      this.killerCameraViewActive = state.phase === 'follow' || state.phase === 'hold';
      if (this.killerCameraViewActive) {
        this.camera.position.copy(state.position);
        this.camera.quaternion.copy(state.quaternion);
      }
      return this.killerCameraViewActive;
    }

    const status = advanceKillerCamera(
      state,
      dt,
      this.camera,
      this.killerCameraTarget(),
      (origin, direction, distance) =>
        this.castKillerCameraWorld(origin, direction, distance),
      killerCameraHandoffReady(this.player.deathAnim)
    );
    if (status === 'done') {
      this.clearKillerCamera();
      return false;
    }
    this.killerCameraViewActive = status === 'active';
    return this.killerCameraViewActive;
  }

  updateMenuCamera(dt) {
    // A slow orbit of the command bunker, wide enough to sweep past the gate
    // bridge and the viaduct: high enough to look down on the roof deck,
    // low enough to stay under the ceiling.
    const t = this.time * 0.055;
    this.camera.position.set(Math.cos(t) * 30, 6.4 + Math.sin(t * 0.8) * 0.3, Math.sin(t) * 24);
    this.camera.lookAt(0, 1.2, 0);
    if (Math.abs(this.camera.fov - this.settings.fov) > 0.01) {
      this.camera.fov = this.settings.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The player is only a valid target once the match is actually running. */
  playerTargetable() {
    return this.player.alive && (this.mode === 'playing' || this.mode === 'dead');
  }

  syncLaserCannonThermalTargets(enabled) {
    const setLayer = (root, visible) => {
      root?.traverse((object) => {
        if (!object.isMesh) return;
        if (visible) object.layers.enable(LASER_CANNON_THERMAL_LAYER);
        else object.layers.disable(LASER_CANNON_THERMAL_LAYER);
      });
    };
    for (const bot of this.bots) {
      setLayer(
        bot.rig?.root,
        enabled && this.gameType === 'pve'
          && bot.alive && bot.team !== this.player.team
      );
    }
    for (const remote of this.pvpRemotes.values()) {
      setLayer(
        remote.rig?.root,
        enabled && this.gameType === 'pvp'
          && remote.alive && remote.team !== this.player.team
      );
    }
  }

  render(dt) {
    // the cloud layers sail by, Minecraft style, on menus and in play alike;
    // the low layer runs faster than the high one for a little parallax
    if (this.level.clouds) {
      for (let i = 0; i < this.level.clouds.length; i++) {
        const m = this.level.clouds[i].material.map;
        m.offset.x = (m.offset.x + dt * (i ? 0.0035 : 0.007)) % 1;
        m.offset.y = (m.offset.y + dt * (i ? 0.0008 : 0.0016)) % 1;
      }
    }

    // FOV follows the weapon (ADS zoom) plus a sprint / slide punch
    const speedPunch = 1 + (this.player.sprinting ? 0.045 : 0) + this.player.slideBlend * 0.06;
    const grenadeVisible = this.grenadeSelected
      || this.grenadePinAt > 0
      || this.grenadeView.throwing;
    // The warhead camera has its own wide, fixed optic - weapon zoom and the
    // sprint punch have no meaning once you are no longer looking through eyes.
    const targetFov = this.tvMissile
      ? 74
      : this.killerCameraViewActive
        ? this.settings.fov
        : this.settings.fov
          * (grenadeVisible || this.casTargeting || this.firebombTargeting
            || this.streakCall
            ? 1
            : this.viewModel.fovScale())
          * speedPunch;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
      this.effects.setViewportScale(this.pipeline.height, this.camera.fov * Math.PI / 180);
    }
    // Riding the missile overrides the eye camera entirely.
    if (this.tvMissile) this.applyTvMissileCamera();
    this.tvMissileCam = damp(this.tvMissileCam, this.tvMissile ? 1 : 0, 12, dt);

    const p = this.player;
    const loadoutView = this.mode === 'loadout';
    const thermalCam = !loadoutView
      && this.railgunActive
      && this.viewModel.def?.id === LASER_CANNON_ID
      && this.viewModel.scoped
      && p.alive
      ? 1
      : 0;
    this.syncLaserCannonThermalTargets(thermalCam > 0);
    const state = {
      damageFlash: loadoutView ? 0 : p.damageFlash,
      lowHealth: !loadoutView && p.alive ? clamp(1 - p.health / 42, 0, 1) : 0,
      death: loadoutView || p.alive
        ? 0
        : clamp((p.deathAnim ? p.deathAnim.t : 1) * 1.8, 0, 1),
      flash: !loadoutView && this.flashTimer > 0
        ? 0.3 * clamp(this.flashTimer / 0.15, 0, 1)
        : 0,
      missileCam: this.tvMissileCam,
      thermalCam,
    };
    // No hands in the warhead.
    const viewScene = loadoutView || this.tvMissileCam > 0.5 || this.killerCameraViewActive
      ? null
      : this.viewModel.scene;
    this.pipeline.render(this.scene, this.camera, viewScene, this.viewModel.camera, state, dt);

    /* ---- HUD ---- */
    const vm = this.viewModel;
    const spreadRad = grenadeVisible
      ? 0.008
      : vm.def ? vm.spread(p.speed2D, p.grounded, p.crouching) : 0.02;
    const fovRad = this.camera.fov * Math.PI / 180;
    const spreadPx = Math.tan(spreadRad) / Math.tan(fovRad / 2) * (this.pipeline.height / 2);
    this.hud.crosshairSpread = clamp(spreadPx, 2, 70);

    const a = this.ammoOf(vm);
    const pvpOwnSentry = this.pvpOwnSentryId ? this.pvpSentries.get(this.pvpOwnSentryId) : null;
    const streakState = {
      uav: this.uav.charges,
      strike: this.strikeCharges,
      uavTime: this.uav.time,
      sentry: this.sentryCharges,
      cas: this.casCharges,
      firebomb: this.firebombCharges,
      attack_helicopter: this.attackHelicopterCharges,
      juggernaut: this.juggernautCharges,
      railgun: this.railgunCharges,
      railgunActive: this.railgunActive,
      sentryHp: this.gameType === 'pvp'
        ? (pvpOwnSentry ? pvpOwnSentry.health : 0)
        : (this.sentry ? this.sentry.health : 0),
      slots: [...this.loadout.streaks],
      available: this.loadout.streaks.map((_, index) =>
        this.streakSlotAvailable(index)),
    };
    this.hud.render({
      mode: this.mode,
      gameType: this.gameType,
      camera: this.camera,
      mapName: this.map.name,
      mapId: this.mapId,
      maps: MAP_IDS.map((mid) => ({ id: mid, name: MAP_REGISTRY[mid].data.name })),
      yaw: p.yaw,
      fps: this.fps,
      showScoreboard: this.input.down('Tab') && this.mode !== 'gameover',
      hitDirections: p.hitDirections,
      crosshairHot: this.aimingAtEnemy(),
      player: {
        team: p.team,
        health: p.health, maxHealth: p.maxHealth, armor: p.armor, maxArmor: p.maxArmor,
        alive: p.alive, crouching: p.crouching, sprinting: p.sprinting, sliding: p.sliding,
        juggernaut: !!p.juggernaut, speed2D: p.speed2D,
        killedBy: p.killedBy, killedByWeapon: p.killedByWeapon,
        respawnIn: Math.max(0, this.respawnTimer),
      },
      weapon: grenadeVisible
        ? {
          id: this.loadout.grenade,
          name: loadoutOption('grenade', this.loadout.grenade)?.name || 'FRAG GRENADE',
          cls: this.grenadePinAt > 0
            ? 'PIN PULLED'
            : loadoutOption('grenade', this.loadout.grenade)?.type || 'LETHAL',
          mag: this.grenadesRemaining,
          magSize: GRENADES_PER_LIFE,
          reserve: 0,
          reloading: false,
          reloadProgress: 0,
          adsBlend: 0,
          scoped: false,
          fireMode: this.grenadePinAt > 0 ? 'RELEASE LMB' : 'LMB THROW / RMB AIM',
          grenade: true,
        }
        : vm.def ? {
          id: vm.def.id, name: vm.def.name, cls: vm.def.cls,
          mag: a.mag, magSize: vm.def.mag, reserve: a.reserve,
          reloading: vm.reloading, reloadProgress: vm.reloading ? clamp(vm.reloadT / vm.reloadTotal, 0, 1) : 0,
          adsBlend: vm.adsBlend, scoped: vm.scoped,
          scopeRecoil: vm.scopeRecoil, squareScope: !!vm.def.squareScope,
          chargeProgress: vm.chargeProgress,
          melee: !!vm.def.melee,
          fireMode: vm.def.melee
            ? 'LMB SLASH'
            : vm.def.chargeTime
              ? 'HOLD LMB TO CHARGE'
            : vm.def.auto
              ? 'AUTO'
              : vm.def.shellReload
                ? 'PUMP'
                : vm.def.boltTime
                  ? 'BOLT'
                  : 'SEMI',
        } : null,
      grenadeFuse: this.grenadePinAt > 0
        ? {
          remaining: Math.max(
            0,
            GRENADE_FUSE_SECONDS - (this.time - this.grenadePinAt)
          ),
          duration: GRENADE_FUSE_SECONDS,
        }
        : null,
      casTargeting: (this.casTargeting || this.firebombTargeting)
        ? {
          phase: (this.casTargeting || this.firebombTargeting).phase,
          cursor: { ...(this.casTargeting || this.firebombTargeting).cursor },
          start: (this.casTargeting || this.firebombTargeting).start
            ? { ...(this.casTargeting || this.firebombTargeting).start }
            : null,
          end: (this.casTargeting || this.firebombTargeting).end
            ? { ...(this.casTargeting || this.firebombTargeting).end }
            : null,
          bounds: { ...(this.casTargeting || this.firebombTargeting).bounds },
          width: this.firebombTargeting
            ? FIREBOMB_BLAST_RADIUS * 2
            : CAS_RUN_WIDTH,
          px: (this.casTargeting || this.firebombTargeting).px,
          pz: (this.casTargeting || this.firebombTargeting).pz,
          yaw: (this.casTargeting || this.firebombTargeting).yaw,
          enemies: [...((this.casTargeting || this.firebombTargeting).enemies || [])],
        }
        : null,
      streakDevice: this.streakCall
        ? {
          type: this.streakCall.type,
          progress: this.streakCall.progress,
          committed: this.streakCall.committed,
        }
        : null,
      match: this.match,
      score: {
        total: this.totalScore,
        kills: p.kills, deaths: p.deaths,
      },
      passive: loadoutOption('passives', this.loadout.passives[0]),
      streaks: streakState,
      streakWheel: this.streakWheel.open
        ? {
          open: true,
          selected: this.streakWheel.selected,
          cursorX: this.streakWheel.cursorX,
          cursorY: this.streakWheel.cursorY,
          slots: [...this.loadout.streaks],
          available: [...streakState.available],
        }
        : null,
      airdropInteraction: this.airdropInteraction,
      uavMarks: this.gameType === 'pvp'
        ? (this.uav.time > 0 && this.pvpUavMarks.length ? this.pvpUavMarks : null)
        : (this.uav.time > 0
          && this.uav.ping > UAV_SWEEP_INTERVAL_SECONDS - UAV_REVEAL_SECONDS)
          ? this.bots.filter((b) => b.alive && b.team !== p.team)
            .map((b) => ({
              x: b.position.x,
              y: b.position.y + 1.55,
              z: b.position.z,
              alpha: uavRevealAlpha(
                this.uav.ping - (UAV_SWEEP_INTERVAL_SECONDS - UAV_REVEAL_SECONDS)
              ),
            }))
          : null,
      missileCam: this.tvMissile && this.tvMissileCam > 0.35 ? {
        altitude: Math.max(0, this.tvMissile.state.position.y),
        diving: this.tvMissile.state.diving,
        speed: this.tvMissile.state.speed,
        x: this.tvMissile.state.position.x,
        z: this.tvMissile.state.position.z,
        targets: this.buildMissileHudTargets(),
      } : null,
      enemyTargets: this.buildEnemyHudTargets(),
      teammates: this.buildTeammateMarkers(),
      sentryMarkers: this.buildSentryMarkers(),
      scoreboard: this.buildScoreboard(),
      rooms: this.pvpRooms,
      voteKick: this.pvpVoteKick,
      voteKickCooldown: this.pvpVoteKickCooldown,
      voteKickPlayers: this.gameType === 'pvp'
        ? [...this.pvpRemotes.values()]
          .map((remote) => ({
            id: remote.id,
            name: remote.name,
            team: remote.displayTeam,
          }))
          .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name))
        : [],
      network: {
        status: this.pvpStatus,
        latency: this.pvpLatency,
        room: this.pvpRoom,
        playerId: this.pvp.playerId,
        playerName: this.pvpName,
        tickRate: PVP_TICK_RATE,
        banUntil: this.pvpBanUntil,
      },
    });
  }

  ammoOf(vm) {
    return vm.def ? vm.ammo[vm.def.id] : { mag: 0, reserve: 0 };
  }

  aimingAtEnemy() {
    if (!this.player.alive) return false;
    if ((this.frameParity = (this.frameParity || 0) + 1) % 4 !== 0) return this._hotCache;
    // same ray the bullets use, so the hot reticle never lies
    const origin = this._v1.copy(this.camera.position);
    const dir = this.camera.getWorldDirection(this._v2);
    const hit = this.gameType === 'pvp'
      ? this.castPvpVisual(origin, dir, 80)
      : this.castBullet(origin, dir, 80, this.player);
    this._hotCache = !!(hit && hit.actor && hit.actor.team !== this.player.team);
    return this._hotCache;
  }

  enemyHudTargetForActor(actor, extra = {}) {
    const crouched = this.gameType === 'pvp' ? actor.state?.crouch : actor.crouch;
    return {
      id: `${this.gameType}:${actor.id}`,
      team: actor.team,
      health: extra.health ?? actor.health,
      maxHealth: actor.maxHealth || this.ohp,
      armor: extra.armor ?? actor.armor,
      maxArmor: actor.maxArmor || 50,
      x: actor.position.x,
      y: actor.position.y + (crouched ? 1.72 : 2.12),
      z: actor.position.z,
      dead: extra.dead ?? !actor.alive,
      ...(extra.initialHealth === undefined ? {} : { initialHealth: extra.initialHealth }),
      ...(extra.initialArmor === undefined ? {} : { initialArmor: extra.initialArmor }),
    };
  }

  /**
   * Hostile soldiers are identified by a separate 2D HUD layer in the
   * warhead feed. World colours are deliberately irrelevant, so brick, rust
   * and red team decorations can never masquerade as targets.
   */
  buildMissileHudTargets() {
    if (!this.tvMissile || !this.player.alive || this.mode !== 'playing') return [];
    const actors = this.gameType === 'pvp'
      ? [...this.pvpRemotes.values()]
      : this.bots;
    const targets = [];
    for (const actor of actors) {
      if (!actor.alive || actor.team === this.player.team) continue;
      const crouched = this.gameType === 'pvp'
        ? Boolean(actor.state?.crouch)
        : Boolean(actor.crouch);
      const sliding = this.gameType === 'pvp' && Boolean(actor.state?.sliding);
      targets.push({
        id: `${this.gameType}:${actor.id}`,
        x: actor.position.x,
        y: actor.position.y + 0.04,
        z: actor.position.z,
        height: sliding ? 0.86 : crouched ? 1.34 : 1.9,
        radius: sliding ? 0.68 : 0.46,
      });
    }
    return targets;
  }

  rememberEnemyHudTarget(target, holdSeconds) {
    if (!target?.id) return;
    const existing = this.enemyHudHeldTargets.get(target.id);
    this.enemyHudHeldTargets.set(target.id, {
      ...existing,
      ...target,
      initialHealth: existing?.initialHealth ?? target.initialHealth ?? target.health,
      initialArmor: existing?.initialArmor ?? target.initialArmor ?? target.armor,
      expiresAt: this.time + holdSeconds,
    });
  }

  rememberEnemyHudDamage(actor, beforeHealth, beforeArmor) {
    if (!actor || actor.team === this.player.team || actor.isSentry) return;
    const target = this.enemyHudTargetForActor(actor, {
      initialHealth: beforeHealth,
      initialArmor: beforeArmor,
    });
    this.rememberEnemyHudTarget(
      target,
      target.dead ? ENEMY_VITAL_DEATH_HOLD : ENEMY_VITAL_HIT_HOLD
    );
  }

  buildEnemyHudTargets() {
    if (!this.player.alive || this.mode !== 'playing' || this.tvMissile) {
      this.enemyHudActor = null;
      this.enemyHudHeldTargets.clear();
      return [];
    }
    if (this.enemyHudMode !== this.gameType) {
      this.enemyHudMode = this.gameType;
      this.enemyHudActor = null;
      this.enemyHudHeldTargets.clear();
      this.enemyHudScanAt = 0;
    }

    // A dead selected actor becomes an independent held target. It no longer
    // occupies the live reticle slot while its slower lethal animation plays.
    if (this.enemyHudActor && !this.enemyHudActor.alive) {
      const actor = this.enemyHudActor;
      const id = `${this.gameType}:${actor.id}`;
      if (!this.enemyHudHeldTargets.has(id)) {
        this.rememberEnemyHudTarget(
          this.enemyHudTargetForActor(actor, { health: 0, armor: 0, dead: true }),
          ENEMY_VITAL_DEATH_HOLD
        );
      }
      this.enemyHudActor = null;
    }
    for (const [id, target] of this.enemyHudHeldTargets) {
      if (this.time >= target.expiresAt) this.enemyHudHeldTargets.delete(id);
    }

    // Selection includes a visibility ray, so scan at the network rate rather than once
    // per rendered frame. Health and armor still come from the live actor on
    // every HUD render once a target has been selected.
    if (this.time >= this.enemyHudScanAt) {
      this.enemyHudScanAt = this.time + PVP_TICK_MS / 1000;
      this.enemyHudActor = null;
      let bestScore = HUD_RETICLE_RADIUS;
      const actors = this.gameType === 'pvp'
        ? [...this.pvpRemotes.values()]
        : this.bots;

      for (const actor of actors) {
        if (!actor.alive || actor.team === this.player.team) continue;
        const crouched = this.gameType === 'pvp' ? actor.state?.crouch : actor.crouch;
        this._v1.set(
          actor.position.x,
          actor.position.y + (crouched ? 1.18 : 1.56),
          actor.position.z
        );
        this._v2.copy(this._v1).project(this.camera);
        if (this._v2.z < -1 || this._v2.z > 1
          || Math.abs(this._v2.x) > 1.05 || Math.abs(this._v2.y) > 1.05) continue;

        // Aspect compensation gives the same apparent activation radius in
        // both axes: about 24 low-resolution pixels around the reticle.
        const score = Math.hypot(this._v2.x * this.camera.aspect, this._v2.y);
        if (score >= bestScore || !this.hasLineOfSight(this.camera.position, this._v1)) continue;
        bestScore = score;
        this.enemyHudActor = actor;
      }
    }

    const targets = [...this.enemyHudHeldTargets.values()];
    const actor = this.enemyHudActor;
    if (actor && actor.alive && actor.team !== this.player.team) {
      const live = this.enemyHudTargetForActor(actor);
      const heldIndex = targets.findIndex((target) => target.id === live.id);
      if (heldIndex >= 0) {
        // The held values came from the damage event (and, in PVP, directly
        // from the authoritative server). Only follow the actor's position;
        // a not-yet-arrived authoritative snapshot must not restore stale health.
        targets[heldIndex] = {
          ...targets[heldIndex],
          x: live.x,
          y: live.y,
          z: live.z,
        };
      } else {
        targets.push(live);
      }
    }
    return targets;
  }

  buildTeammateMarkers() {
    if (this.teammateHudMode !== this.gameType) {
      this.teammateHudMode = this.gameType;
      this.teammateHudStates.clear();
      this.teammateHudScanAt = 0;
    }

    const actors = (this.gameType === 'pvp' ? [...this.pvpRemotes.values()] : this.bots)
      .filter((actor) => actor.alive && actor.team === this.player.team);

    // Visibility rays and reticle proximity are sampled at the same rate as
    // the authoritative PVP snapshots. Only one closest-to-reticle teammate
    // gets a name; every actually visible teammate still gets the small dot.
    if (this.time >= this.teammateHudScanAt) {
      this.teammateHudScanAt = this.time + PVP_TICK_MS / 1000;
      const next = new Map();
      let namedId = null;
      let bestScore = HUD_RETICLE_RADIUS;

      for (const actor of actors) {
        const crouched = this.gameType === 'pvp' ? actor.state?.crouch : actor.crouch;
        const markerY = actor.position.y + (crouched ? 1.68 : 2.08);
        this._v1.set(actor.position.x, markerY, actor.position.z);
        this._v3.copy(this._v1).applyMatrix4(this.camera.matrixWorldInverse);
        this._v2.copy(this._v1).project(this.camera);
        const inView = this._v3.z < -0.05
          && this._v2.z >= -1 && this._v2.z <= 1
          && Math.abs(this._v2.x) <= 0.98 && Math.abs(this._v2.y) <= 0.96;
        const visible = inView && this.hasLineOfSight(this.camera.position, this._v1);
        next.set(actor.id, { visible, showName: false });
        if (!visible) continue;

        this._v1.y = actor.position.y + (crouched ? 1.18 : 1.56);
        this._v2.copy(this._v1).project(this.camera);
        const score = Math.hypot(this._v2.x * this.camera.aspect, this._v2.y);
        if (score < bestScore) {
          bestScore = score;
          namedId = actor.id;
        }
      }
      if (namedId !== null) next.get(namedId).showName = true;
      this.teammateHudStates = next;
    }

    return actors.map((actor) => {
      const crouched = this.gameType === 'pvp' ? actor.state?.crouch : actor.crouch;
      const marker = this.teammateHudStates.get(actor.id) || {};
      return {
        id: actor.id,
        name: actor.name,
        team: actor.team,
        x: actor.position.x,
        y: actor.position.y + (crouched ? 1.68 : 2.08),
        z: actor.position.z,
        visible: Boolean(marker.visible),
        showName: Boolean(marker.showName),
      };
    });
  }

  /** Friendly sentries are identified through walls, but only while projected
   * inside the actual camera view; the HUD never clamps them to a screen edge. */
  buildSentryMarkers() {
    const sentries = this.gameType === 'pvp'
      ? [...this.pvpSentries.values()]
      : (this.sentry?.alive ? [this.sentry] : []);
    return sentries
      .filter((sentry) => sentry.team === this.player.team)
      .map((sentry) => ({
        id: sentry.id || 'local-sentry',
        team: sentry.team,
        x: sentry.position.x,
        y: sentry.position.y + 2.18,
        z: sentry.position.z,
      }));
  }

  buildScoreboard() {
    if (this.gameType === 'pvp') {
      const rows = [{
        name: this.player.name || 'YOU',
        team: this.player.team,
        kills: this.player.kills,
        deaths: this.player.deaths,
        score: this.player.score,
        isPlayer: true,
        alive: this.player.alive,
      }];
      for (const remote of this.pvpRemotes.values()) {
        rows.push({
          name: remote.name,
          team: remote.team,
          kills: remote.kills,
          deaths: remote.deaths,
          score: remote.score,
          isPlayer: false,
          alive: remote.alive,
        });
      }
      return rows;
    }
    const rows = [{
      name: 'YOU', team: 'blue', kills: this.player.kills, deaths: this.player.deaths,
      score: this.player.score, isPlayer: true, alive: this.player.alive,
    }];
    for (const b of this.bots) {
      rows.push({
        name: b.name, team: b.team, kills: b.kills, deaths: b.deaths,
        score: b.kills * 100, isPlayer: false, alive: b.alive,
      });
    }
    return rows;
  }
}
const game = new Game();
window.game = game;
})();})();})();})();})();})();