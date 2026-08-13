const GEO_ENDPOINT = String(process.env.PVP_GEO_ENDPOINT || 'http://ip-api.com/json')
  .replace(/\/+$/, '');
const GEO_TIMEOUT_MS = Math.max(500, Number(process.env.PVP_GEO_TIMEOUT_MS) || 2500);
const GEO_CACHE_MS = 6 * 60 * 60 * 1000;
const GEO_FAILURE_CACHE_MS = 5 * 60 * 1000;
const GEO_CACHE_LIMIT = 2048;

const countryCache = new Map();

export function normalizeCountryCode(value) {
  const country = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

export function publicRegionResult(country) {
  const normalized = normalizeCountryCode(country);
  return {
    country: normalized,
    // An unavailable lookup is advisory-only and must never falsely accuse a
    // direct player of using an overseas proxy.
    outsideChina: Boolean(normalized && normalized !== 'CN'),
  };
}

function cacheCountry(ip, country, now) {
  if (countryCache.size >= GEO_CACHE_LIMIT && !countryCache.has(ip)) {
    countryCache.delete(countryCache.keys().next().value);
  }
  countryCache.set(ip, {
    country,
    expiresAt: now + (country ? GEO_CACHE_MS : GEO_FAILURE_CACHE_MS),
  });
}

export async function lookupIpCountry(ip, fetchImpl = globalThis.fetch, now = Date.now()) {
  if (!ip || typeof fetchImpl !== 'function') return null;
  const cached = countryCache.get(ip);
  if (cached && cached.expiresAt > now) return cached.country;
  if (cached) countryCache.delete(ip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
  timer.unref?.();
  let country = null;
  try {
    const response = await fetchImpl(
      `${GEO_ENDPOINT}/${encodeURIComponent(ip)}?fields=status,countryCode`,
      {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      }
    );
    if (response.ok) {
      const body = await response.json();
      country = body?.status === 'fail'
        ? null
        : normalizeCountryCode(body?.countryCode ?? body?.country);
    }
  } catch {
    country = null;
  } finally {
    clearTimeout(timer);
  }
  cacheCountry(ip, country, now);
  return country;
}

export function clearRegionCache() {
  countryCache.clear();
}
