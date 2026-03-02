export interface AchievementDef {
  key: string;
  emoji: string;
  name: string;
  description: string;
  hidden?: boolean;
  rare?: boolean;
  tier?: { group: string; level: number };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Project milestones
  { key: "first_project", emoji: "🎯", name: "První zakázka!", description: "Vytvořili jste svůj první projekt" },
  { key: "fast_delivery", emoji: "⚡", name: "Blesková dodávka", description: "Projekt z Přípravy do Expedice pod 30 dní" },
  { key: "hundredth_project", emoji: "💯", name: "Stovka", description: "100. projekt v systému" },

  // PM tiers
  { key: "pm_5", emoji: "🪑", name: "Učedník", description: "5 projektů jako PM", tier: { group: "pm", level: 1 } },
  { key: "pm_20", emoji: "🪵", name: "Truhlář", description: "20 projektů jako PM", tier: { group: "pm", level: 2 } },
  { key: "pm_50", emoji: "🏛️", name: "Mistr truhlář", description: "50 projektů jako PM", tier: { group: "pm", level: 3 } },
  { key: "pm_100", emoji: "👑", name: "Manufakturní král", description: "100 projektů jako PM", tier: { group: "pm", level: 4 } },

  // Konstruktér tiers
  { key: "konstr_1", emoji: "✏️", name: "První výkres", description: "1 projekt na 100%", tier: { group: "konstr", level: 1 } },
  { key: "konstr_10", emoji: "📐", name: "Šikovné ruce", description: "10 projektů na 100%", tier: { group: "konstr", level: 2 } },
  { key: "konstr_25", emoji: "🔧", name: "Strojní inženýr", description: "25 projektů na 100%", tier: { group: "konstr", level: 3 } },
  { key: "konstr_50", emoji: "🧠", name: "Technický mozek", description: "50 projektů na 100%", tier: { group: "konstr", level: 4 } },
  { key: "konstr_100", emoji: "🦾", name: "Terminátor TPV", description: "100 projektů na 100%", rare: true, tier: { group: "konstr", level: 5 } },

  // Usage
  { key: "first_doc", emoji: "📎", name: "Dokumentarista", description: "První dokument přes SharePoint" },
  { key: "plan_20", emoji: "📊", name: "Analytik", description: "Plán/Gantt otevřen 20×" },
  { key: "search_50", emoji: "🔍", name: "Detektiv", description: "50× použité vyhledávání" },
  { key: "excel_5", emoji: "📋", name: "Excel mág", description: "5× import TPV z Excelu" },

  // Time-based
  { key: "night_shift", emoji: "🌙", name: "Noční směna", description: "Přihlášení po 22:00" },
  { key: "weekend", emoji: "🎄", name: "Žádný odpočinek", description: "Přihlášení o víkendu" },
  { key: "early_bird", emoji: "☀️", name: "Ranní ptáče", description: "Přihlášení před 7:00" },

  // Hidden
  { key: "unicorn", emoji: "🦄", name: "Jednorožec", description: "Všechny milníky vyplněné a včas", hidden: true, rare: true },
  { key: "cleaner", emoji: "🧹", name: "Uklízeč", description: "10 projektů přesunuto do Koše", hidden: true },
  { key: "streak_30", emoji: "🔥", name: "Série", description: "30 dní přihlášení v řadě", hidden: true, rare: true },
  { key: "diamond", emoji: "💎", name: "Diamantová zakázka", description: "Projekt s cenou přes 10 000 000 Kč", hidden: true },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, a]));

export function getPreviousTier(def: AchievementDef): AchievementDef | null {
  if (!def.tier) return null;
  const prev = ACHIEVEMENTS.find(
    a => a.tier?.group === def.tier!.group && a.tier!.level === def.tier!.level - 1
  );
  return prev || null;
}
