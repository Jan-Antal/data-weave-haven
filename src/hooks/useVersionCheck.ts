import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearAllCaches } from '@/lib/cacheBuster';

export function useVersionCheck() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const getScriptHash = () =>
      Array.from(document.querySelectorAll('script[src]'))
        .map(s => (s as HTMLScriptElement).src)
        .filter(src => src.includes('/assets/'))
        .sort()
        .join(',');

    const originalHash = getScriptHash();
    let reloading = false;

    // When a new SW takes control, reload to pick up the new shell.
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      console.info('[VersionCheck] SW controller changed, reloading');
      window.location.reload();
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    }

    const checkAndReload = async () => {
      try {
        const res = await fetch('/?_=' + Date.now(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        const html = await res.text();
        const matches = html.match(/\/assets\/[^"'\s]+\.js/g) || [];
        const newHash = matches.sort().join(',');

        if (originalHash && newHash && originalHash !== newHash) {
          console.info('[VersionCheck] New build detected, refreshing app');
          queryClient.invalidateQueries();

          // Try to push the SW to update; if it has a waiting worker, ask it to skip waiting.
          if ('serviceWorker' in navigator) {
            try {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg) {
                await reg.update();
                if (reg.waiting) {
                  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
              }
            } catch {
              // ignore
            }
          }

          // Fallback hard reload after 3s if controllerchange didn't fire.
          setTimeout(async () => {
            if (reloading) return;
            reloading = true;
            await clearAllCaches();
            window.location.reload();
          }, 3000);
        }
      } catch {
        // Network error — skip silently
      }
    };

    const interval = setInterval(checkAndReload, 2 * 60 * 1000);
    return () => {
      clearInterval(interval);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      }
    };
  }, [queryClient]);
}
