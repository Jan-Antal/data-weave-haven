import { useEffect } from 'react';

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
const VERSION_KEY = 'ami_app_version';

export function useVersionCheck() {
  useEffect(() => {
    const currentScripts = Array.from(document.querySelectorAll('script[src]'))
      .map(s => (s as HTMLScriptElement).src)
      .filter(src => src.includes('/assets/'))
      .join(',');

    const storedVersion = sessionStorage.getItem(VERSION_KEY);
    if (!storedVersion) {
      sessionStorage.setItem(VERSION_KEY, currentScripts);
    }

    const checkVersion = async () => {
      try {
        const res = await fetch('/?_=' + Date.now(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const html = await res.text();
        const matches = html.match(/\/assets\/[^"']+\.js/g) || [];
        const newVersion = matches.join(',');
        const stored = sessionStorage.getItem(VERSION_KEY);

        if (stored && newVersion && stored !== newVersion) {
          sessionStorage.setItem(VERSION_KEY, newVersion);
          showUpdateBanner();
        }
      } catch {
        // Network error — ignore silently
      }
    };

    const interval = setInterval(checkVersion, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);
}

function showUpdateBanner() {
  const existing = document.getElementById('ami-update-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'ami-update-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 99999;
    background: #1e40af;
    color: white;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: sans-serif;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;
  banner.innerHTML = `
    <span>🔄 <strong>Nová verze aplikace je k dispozici.</strong> Prosím obnovte stránku.</span>
    <button onclick="window.location.reload()" style="
      background: white;
      color: #1e40af;
      border: none;
      padding: 6px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    ">Obnovit nyní</button>
  `;
  document.body.prepend(banner);
}
