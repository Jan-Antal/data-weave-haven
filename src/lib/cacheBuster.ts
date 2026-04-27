/**
 * Force cache invalidation when a new build is deployed.
 * Critical for installed PWA on iOS/Android where the service worker
 * keeps serving the old shell even after deploy.
 */

const HASH_KEY = "app_build_hash";
const LAST_BUST_KEY = "app_cache_busted_at";
const BUST_COOLDOWN_MS = 60_000; // prevent reload loops

declare const __BUILD_HASH__: string;

export async function clearAllCaches(): Promise<void> {
  // 1. CacheStorage (Workbox precache + runtime caches)
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {
      console.warn("[CacheBuster] Failed to clear caches", e);
    }
  }
  // 2. Service workers
  if ("serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch (e) {
      console.warn("[CacheBuster] Failed to unregister SW", e);
    }
  }
}

/**
 * Run on app boot. If build hash changed since last visit, nuke caches and reload once.
 * Protected by cooldown so we never enter an infinite reload loop.
 */
export async function bootstrapCacheCheck(): Promise<void> {
  try {
    const currentHash = typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "";
    if (!currentHash) return;

    const storedHash = localStorage.getItem(HASH_KEY);
    const lastBust = Number(localStorage.getItem(LAST_BUST_KEY) || 0);
    const now = Date.now();

    if (storedHash && storedHash !== currentHash && now - lastBust > BUST_COOLDOWN_MS) {
      console.info(`[CacheBuster] Build changed ${storedHash} -> ${currentHash}, clearing caches`);
      localStorage.setItem(LAST_BUST_KEY, String(now));
      localStorage.setItem(HASH_KEY, currentHash);
      await clearAllCaches();
      window.location.reload();
      // Stop further execution while reload is pending
      await new Promise(() => {});
      return;
    }

    if (!storedHash) {
      localStorage.setItem(HASH_KEY, currentHash);
    }
  } catch (e) {
    console.warn("[CacheBuster] bootstrap failed", e);
  }
}

/**
 * Manual force-refresh from the UI.
 */
export async function forceAppRefresh(): Promise<void> {
  localStorage.removeItem(HASH_KEY);
  localStorage.setItem(LAST_BUST_KEY, String(Date.now()));
  await clearAllCaches();
  window.location.reload();
}
