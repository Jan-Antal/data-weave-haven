/**
 * IcoLookupField — IČO input + "Načítať z ARES" tlačidlo.
 *
 * Používa Supabase edge function `lookup-ico` (server-side ARES proxy
 * s 30-dňovou cache). Volaní zľava-doprava:
 *   onIcoChange — every keystroke (filtered to digits, max 8)
 *   onLookup    — only on success, with mapped AresCompanyData
 *
 * Auto-trigger: onBlur, ak je IČO 8 čísel a líši sa od posledného úspechu.
 */

import { useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { AresCompanyData, AresLookupResponse } from "@/types/ares";

interface IcoLookupFieldProps {
  ico: string;
  onIcoChange: (v: string) => void;
  onLookup: (data: AresCompanyData) => void;
  disabled?: boolean;
  /** Voliteľný placeholder pre input. */
  placeholder?: string;
}

export function IcoLookupField({
  ico,
  onIcoChange,
  onLookup,
  disabled,
  placeholder = "napr. 12345678",
}: IcoLookupFieldProps) {
  const [loading, setLoading] = useState(false);
  const lastFetchedRef = useRef<string | null>(null);

  const valid = /^\d{8}$/.test(ico);
  const canFetch = valid && !loading && !disabled;

  async function runLookup() {
    if (!canFetch) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<AresLookupResponse>(
        "lookup-ico",
        { body: { ico } }
      );

      if (error) {
        // Edge function returned non-2xx → supabase-js wraps it as FunctionsHttpError.
        // We try to parse the response body for our structured error.
        // The status is on error.context.response if present.
        const ctx = (error as unknown as {
          context?: { response?: Response };
        }).context;
        let status = 0;
        let serverMsg = "";
        if (ctx?.response) {
          status = ctx.response.status;
          try {
            const body = await ctx.response.clone().json();
            serverMsg = (body as { error?: string }).error ?? "";
          } catch {
            /* ignore */
          }
        }

        if (status === 400) {
          toast.error(serverMsg || "IČO musí mať presne 8 číslic");
        } else if (status === 404) {
          toast.warning(
            `IČO ${ico} sa v registri ARES nenašlo. Údaje vyplň ručne.`
          );
          lastFetchedRef.current = ico; // don't auto-retry same not-found IČO
        } else if (status === 503) {
          toast.error(
            "ARES je momentálne nedostupné, skús neskôr alebo vyplň ručne."
          );
        } else {
          toast.error("Chyba pri načítaní z ARES", {
            description: error.message,
          });
        }
        return;
      }

      if (!data?.data) {
        toast.error("ARES vrátil prázdnu odpoveď");
        return;
      }

      onLookup(data.data);
      lastFetchedRef.current = ico;

      if (data.source === "cache") {
        toast.success("Údaje načítané", { description: "z cache" });
      } else {
        toast.success("Údaje načítané z ARES");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleChange(raw: string) {
    // keep only digits, max 8
    const clean = raw.replace(/\D+/g, "").slice(0, 8);
    onIcoChange(clean);
  }

  function handleBlur() {
    // Auto-trigger if 8 digits AND IČO changed since last fetch
    if (valid && ico !== lastFetchedRef.current && !loading && !disabled) {
      void runLookup();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={ico}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canFetch) {
            e.preventDefault();
            void runLookup();
          }
        }}
        inputMode="numeric"
        maxLength={8}
        placeholder={placeholder}
        disabled={disabled}
        className="font-mono"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={runLookup}
        disabled={!canFetch}
        className="shrink-0 whitespace-nowrap"
        title={
          !valid ? "Zadaj 8 číslic IČO" : "Načítať údaje firmy z registra ARES"
        }
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            Načítavam…
          </>
        ) : (
          <>
            <Search className="h-4 w-4 mr-1.5" />
            Načítať z ARES
          </>
        )}
      </Button>
    </div>
  );
}
