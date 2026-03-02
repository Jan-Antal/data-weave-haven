import { useEffect, useState, useCallback } from "react";
import confetti from "canvas-confetti";
import type { AchievementDef } from "@/lib/achievements";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface CelebrationData {
  achievement: AchievementDef;
  previousTier: AchievementDef | null;
}

function playChime() {
  try {
    const ctx = new AudioContext();
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    play(523, 0, 0.25);
    play(659, 0.12, 0.25);
    play(784, 0.24, 0.35);
  } catch {
    // Web Audio not available
  }
}

function fireConfetti(isRare: boolean) {
  const count = isRare ? 200 : 100;
  const defaults = {
    colors: ["#FFD700", "#4CAF50", "#FFFFFF", "#2D5A3D"],
    spread: 360,
    startVelocity: 30,
    ticks: 150,
    origin: { x: 0.5, y: 0.45 },
  };

  confetti({ ...defaults, particleCount: count, scalar: 1.1 });
  if (isRare) {
    setTimeout(() => confetti({ ...defaults, particleCount: 100, scalar: 0.9, startVelocity: 40 }), 500);
    setTimeout(() => confetti({ ...defaults, particleCount: 80, scalar: 1.0, startVelocity: 35 }), 1200);
  } else {
    setTimeout(() => confetti({ ...defaults, particleCount: 60, scalar: 0.9, startVelocity: 25 }), 800);
  }
}

export function AchievementCelebration() {
  const [current, setCurrent] = useState<CelebrationData | null>(null);
  const [visible, setVisible] = useState(false);
  const { data: prefs } = useUserPreferences();

  const handleEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent<CelebrationData>).detail;
    setCurrent(detail);
    setVisible(true);

    fireConfetti(!!detail.achievement.rare);

    // Check sound preference
    const soundEnabled = (prefs as any)?.achievement_sound ?? false;
    if (soundEnabled) playChime();

    setTimeout(() => setVisible(false), 3500);
    setTimeout(() => setCurrent(null), 4000);
  }, [prefs]);

  useEffect(() => {
    window.addEventListener("achievement-unlocked", handleEvent);
    return () => window.removeEventListener("achievement-unlocked", handleEvent);
  }, [handleEvent]);

  if (!current) return null;

  const { achievement, previousTier } = current;
  const isTierUpgrade = previousTier !== null;

  return (
    <div
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100000] pointer-events-auto transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
      }`}
      onClick={() => { setVisible(false); setTimeout(() => setCurrent(null), 300); }}
      style={{ cursor: "pointer" }}
    >
      <div
        className="w-[400px] rounded-xl p-5 text-center shadow-2xl"
        style={{
          background: "#1a1a1a",
          border: "1px solid #FFD700",
          animation: "achievement-glow 2s ease-in-out infinite alternate",
        }}
      >
        {isTierUpgrade && (
          <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#FFD700" }}>
            Povýšení!
          </div>
        )}
        <div
          className="text-5xl mb-2"
          style={{ animation: "achievement-bounce 0.6s ease-out" }}
        >
          {achievement.emoji}
        </div>
        {isTierUpgrade && previousTier && (
          <div className="text-sm text-white/50 mb-1">
            <span className="line-through">{previousTier.emoji} {previousTier.name}</span>
            <span className="mx-2">→</span>
          </div>
        )}
        <div className="text-lg font-bold text-white">
          {achievement.emoji} {achievement.name}
        </div>
        <div className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>
          {achievement.description}
        </div>
      </div>

      <style>{`
        @keyframes achievement-glow {
          from { box-shadow: 0 0 20px rgba(255, 215, 0, 0.15); }
          to { box-shadow: 0 0 30px rgba(255, 215, 0, 0.3); }
        }
        @keyframes achievement-bounce {
          0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
          50% { transform: scale(1.15) rotate(3deg); }
          70% { transform: scale(0.95); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
