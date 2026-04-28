# Odstránenie automatických refreshov aplikácie

## Problém
Aplikácia sa sama reloaduje aj počas práce → uživateľ stratí rozrobený stav (rozdelená práca, otvorené sheety, neuložené úpravy).

## Príčina
Pri riešení PWA cache busting sme pridali tri vrstvy auto-reloadu, ktoré bežia kým máš app otvorený:

1. **`useVersionCheck` (App.tsx)** — každé **2 minúty** fetchne `/`, porovná hashe `<script src="/assets/...">` a ak sa líšia, zavolá `window.location.reload()` (s 3s fallbackom). Toto sa spúšťa pri každom novom builde / preview revízii.
2. **Service Worker `controllerchange` listener (useVersionCheck)** — keď nový SW prevezme kontrolu (a pri `skipWaiting: true` + `clientsClaim: true` sa to deje automaticky a okamžite po deployi), zavolá `window.location.reload()`.
3. **`bootstrapCacheCheck` (main.tsx)** — porovnanie build hashu pri **štarte**. Toto je OK, deje sa to len pri load stránky, nie počas práce.

Body 1 a 2 sú tie, ktoré ti rušia prácu počas používania appky.

## Riešenie

### 1. `src/hooks/useVersionCheck.ts` — prepísať na "soft notify"
- Odstrániť `setInterval` polling každé 2 minúty.
- Odstrániť `window.location.reload()` v `controllerchange` handleri.
- Odstrániť automatický 3s fallback reload.
- Hook nechať existovať ako no-op (alebo úplne odstrániť volanie z `App.tsx`), aby sme nerozbili importy. Nová verzia sa načíta pri ďalšom prirodzenom otvorení / refreshi appky používateľom.

### 2. `vite.config.ts` — zjemniť PWA správanie
- `registerType: "autoUpdate"` → `"prompt"` (SW sa nainštaluje, ale aktivuje až pri ďalšom načítaní stránky).
- `clientsClaim: true` → `false` (nový SW si neprivlastní existujúce taby okamžite).
- `skipWaiting: true` ponechať pre samotného workera, ale bez `clientsClaim` a bez controllerchange reloadu sa už neprejaví ako zlomenie tvojej session.

### 3. `src/lib/cacheBuster.ts` a `bootstrapCacheCheck` v `main.tsx` — nechať
Tieto bežia len pri **štarte** appky (otvorenie taba / hard refresh) — to je správne správanie pre PWA cache busting a používateľa neruší. `forceAppRefresh()` (manuálne tlačidlo v `MobileHeader`) zostáva tiež nedotknuté.

## Výsledok
- Počas práce v aplikácii sa stránka **nikdy** sama nereloadne.
- Nové verzie sa naberú prirodzene pri ďalšom otvorení / hard refreshi / kliknutí na manuálne tlačidlo refresh v menu.
- PWA shell sa stále aktualizuje na pozadí, len bez prerušenia bežiacej session.

## Dotknuté súbory
- `src/hooks/useVersionCheck.ts` (prepísať na no-op)
- `vite.config.ts` (PWA options)
