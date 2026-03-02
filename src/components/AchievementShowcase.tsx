import { ACHIEVEMENTS } from "@/lib/achievements";
import type { AchievementDef } from "@/lib/achievements";
import type { UserAchievement } from "@/hooks/useAchievements";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AchievementShowcaseProps {
  earned: UserAchievement[];
  userRole?: string;
}

const KONSTRUKTER_KEYS = new Set(["konstr_1", "konstr_10", "konstr_25", "konstr_50", "konstr_100"]);

export function AchievementShowcase({ earned, userRole }: AchievementShowcaseProps) {
  const earnedMap = Object.fromEntries(earned.map(e => [e.achievement_key, e]));
  const filteredAchievements = ACHIEVEMENTS.filter(
    (def) => !KONSTRUKTER_KEYS.has(def.key) || userRole === "konstrukter"
  );

  return (
    <div className="grid grid-cols-6 gap-2">
      {filteredAchievements.map((def) => {
        const achievement = earnedMap[def.key];
        const isEarned = !!achievement;

        return (
          <Tooltip key={def.key}>
            <TooltipTrigger asChild>
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg cursor-default transition-all ${
                  isEarned
                    ? "bg-amber-50 border border-amber-200 hover:scale-110"
                    : "bg-muted/50 border border-border opacity-40 grayscale"
                }`}
              >
                {isEarned
                  ? def.emoji
                  : def.hidden
                  ? "❓"
                  : <span className="grayscale opacity-50">{def.emoji}</span>}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px] text-center">
              {isEarned ? (
                <>
                  <div className="font-semibold text-xs">{def.emoji} {def.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(achievement.achieved_at).toLocaleDateString("cs-CZ")}
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {def.hidden ? "???" : def.name}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
