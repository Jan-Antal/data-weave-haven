import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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
          console.info('[VersionCheck] New build detected, invalidating queries');
          queryClient.invalidateQueries();
        }
      } catch {
        // Network error — skip silently
      }
    };

    const interval = setInterval(checkAndReload, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [queryClient]);
}
