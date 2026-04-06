

# Remove Dimensions from popis in CN Extraction Prompt

## What

Update the `CN_SYSTEM_PROMPT` in both edge functions to instruct the AI to **exclude dimensions (rozměry)** from the `popis` field. Dimensions are unnecessary information that clutters the description.

## Changes

### Files: `supabase/functions/extract-tpv/index.ts` and `supabase/functions/extract-tpv-from-sharepoint/index.ts`

In both files, update line 18 (the `popis` field description) from:

```
- popis: KOMPLETNÍ technický popis — materiály, kování, povrchové úpravy, rozměry, barvy, typ dřeva, ABS hrany, úchytky, mechanismy. Spoj VŠECHNY řádky popisu které k položce patří do jednoho textu.
```

To:

```
- popis: KOMPLETNÍ technický popis — materiály, kování, povrchové úpravy, barvy, typ dřeva, ABS hrany, úchytky, mechanismy. BEZ rozměrů (šířka, výška, hloubka, mm, cm). Spoj VŠECHNY řádky popisu které k položce patří do jednoho textu.
```

This removes "rozměry" from the included list and adds an explicit exclusion instruction.

### Deployment

Redeploy both `extract-tpv` and `extract-tpv-from-sharepoint` edge functions.

