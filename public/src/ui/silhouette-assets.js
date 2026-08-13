// One shared catalogue for every UI surface that shows equipment. The same
// flat side-view artwork is used by the loadout screen and the low-resolution
// in-match canvas, so an item never changes visual language between menus,
// kill information and the HUD.
export const SILHOUETTE_IDS = Object.freeze([
  'rifle',
  'smg',
  'shotgun',
  'sniper',
  'machine_pistol',
  'desert_eagle',
  'frag',
  'incendiary',
  'molotov',
  'combat_knife',
  'laser_blade',
  'uav',
  'strike',
  'juggernaut',
  'sentry',
  'cas',
  'firebomb',
  'attack_helicopter',
  'minigun',
  'railgun',
]);

const SILHOUETTE_SET = new Set(SILHOUETTE_IDS);
const VECTOR_SILHOUETTE_IDS = new Set(['railgun']);
const SILHOUETTE_VERSIONS = Object.freeze({
  // Rasterized directly from the attributed low-poly Desert Eagle reference,
  // rather than a hand-drawn generic pistol outline.
  desert_eagle: 'reference-glb-2',
  // The ARC-7 artwork was rebuilt from buildRailgun(). Keep a URL revision so
  // browsers and reverse proxies cannot reuse the discarded placeholder SVG.
  railgun: 'buildRailgun-2',
});
const SILHOUETTE_ALIASES = Object.freeze({
  grenade: 'frag',
  frag_grenade: 'frag',
  knife: 'combat_knife',
  melee: 'combat_knife',
  missile: 'strike',
  tv_missile: 'strike',
  a10: 'cas',
  b2: 'firebomb',
  apache: 'attack_helicopter',
  ah64: 'attack_helicopter',
  heavy_revolver: 'desert_eagle',
});

const canvasImageCache = new Map();

function normalizedId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function silhouetteAssetId(id) {
  const normalized = normalizedId(id);
  const resolved = SILHOUETTE_ALIASES[normalized] || normalized;
  return SILHOUETTE_SET.has(resolved) ? resolved : null;
}

export function hasSilhouetteAsset(id) {
  return silhouetteAssetId(id) !== null;
}

export function silhouetteAssetUrl(id) {
  const resolved = silhouetteAssetId(id);
  if (!resolved) return null;
  const url = new URL(
    `../../assets/ui/loadout-silhouettes/${resolved}.${VECTOR_SILHOUETTE_IDS.has(resolved) ? 'svg' : 'png'}`,
    import.meta.url
  );
  if (SILHOUETTE_VERSIONS[resolved]) {
    url.searchParams.set('v', SILHOUETTE_VERSIONS[resolved]);
  }
  return url.href;
}

/**
 * Lazily preload an image for CanvasRenderingContext2D.drawImage().
 * Node HUD audits deliberately have no Image constructor, so they receive
 * null and exercise the small built-in fallback sprites instead.
 */
export function canvasSilhouetteImage(id) {
  const resolved = silhouetteAssetId(id);
  if (!resolved || typeof Image === 'undefined') return null;
  if (canvasImageCache.has(resolved)) return canvasImageCache.get(resolved);

  const image = new Image();
  image.decoding = 'async';
  image.src = silhouetteAssetUrl(resolved);
  image.addEventListener('error', () => {
    // A transient first request must not poison the Canvas cache forever.
    if (canvasImageCache.get(resolved) === image) canvasImageCache.delete(resolved);
  }, { once: true });
  canvasImageCache.set(resolved, image);
  return image;
}
