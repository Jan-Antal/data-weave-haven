# Vynútiť reload cache na mobilnej PWA verzii

## Problém

Na nainštalovanej mobilnej PWA (home-screen ikona) sa stále zobrazuje stará verzia modulu **Výroba** (zoradené po projektoch) namiesto novej (po balíkoch). V Lovable preview to funguje správne, lebo prehliadač nemá registrovaný service worker pre `lovableproject.com`.

Príčina: aplikácia používa **vite-plugin-pwa** s Workbox service workerom (`registerType: "autoUpdate"`, `skipWaiting: true`). Starý SW si predcacheoval staré JS bundles a `index.html`. Aj po reštarte appky iOS/Android servíruje cached shell skôr, než sa nový SW stihne nainštalovať a prevziať klientov. `useVersionCheck` síce invaliduje React Query, ale **neprinúti SW skipWaiting/reload stránky**.

## Plán riešenia

### 1. Pridať tvrdý one-time cache buster (`src/main.tsx`)
Pri štarte appky:
- Spočítať `localStorage` verziu vs. `__BUILD_HASH__` (už definovaný vo vite.config).
- Ak sa nezhodujú → `caches.keys()` + `caches.delete(...)` pre všetky CacheStorage entries, `navigator.serviceWorker.getRegistrations()` + `registration.unregister()`, uložiť nový hash a `location.reload(true)` jedenkrát (chránené flagom aby nevznikla slučka).

Toto zabezpečí, že každý existujúci používateľ pri prvom otvorení po deployi dostane čistú inštanciu — vrátane mobilov, kde si predtým SW držal starý shell.

### 2. Upgradnúť `useVersionCheck` (`src/hooks/useVersionCheck.ts`)
Keď deteguje nový build hash:
- Zavolať `navigator.serviceWorker.getRegistration()?.update()`.
- Po `controllerchange` evente urobiť `window.location.reload()`.
- Súčasne invalidovať React Query (existujúce správanie zostáva).

### 3. Pridať manuálny "Force refresh" v menu (`src/components/mobile/MobileHeader.tsx` hamburger)
Položka **"Obnoviť aplikáciu"** ktorá:
- vyčistí všetky `caches`,
- odregistruje SW,
- vyčistí React Query cache,
- spraví `location.reload()`.

Použiteľné keď v budúcnosti niečo zasekne — užívateľ má samoobslužné riešenie bez nutnosti odinštalovať PWA.

### 4. Okamžitá inštrukcia pre teba (bez čakania na deploy)
Kým sa fix nenasadí, na iPhone/Androide:
- **iOS Safari PWA**: dlho podrž ikonu na home screen → *Odstrániť aplikáciu* → znovu otvor `projekty.am-interior.cz` v Safari → *Zdieľať → Pridať na plochu*.
- **Android Chrome PWA**: Nastavenia → Aplikácie → AMI → Úložisko → *Vymazať údaje a cache* → otvor znovu.

Po nasadení fixu (kroky 1–3) toto už nikdy nebudeš musieť robiť — nový build sa pretlačí automaticky pri prvom otvorení.

## Technické detaily

**Súbory:**
- `src/main.tsx` — pridať `bootstrapCacheCheck()` pred `createRoot()`.
- `src/hooks/useVersionCheck.ts` — pridať SW update + reload logiku.
- `src/components/mobile/MobileHeader.tsx` — pridať MenuItem "Obnoviť aplikáciu".

**Build hash zdroj:** `__BUILD_HASH__` global definovaný vo `vite.config.ts` (`Date.now().toString(36)` pri builde).

**LocalStorage kľúč:** `app_build_hash` (porovnanie). Flag `app_cache_busted_at` zabráni reload-loopu (max raz za 60s).

**Žiadne DB zmeny, žiadne nové dependencies.**
