/**
 * @deprecated Auto progress writes were removed.
 *
 * production_daily_logs is now a strictly manual source of truth — only
 * explicit user actions in src/pages/Vyroba.tsx (handleSaveLog, "Bez výroby"
 * toggle) may write to it. Completion / drag-drop / midflight import must
 * NOT write progress percentages, otherwise they overwrite real logged data
 * and break split-chain continuity.
 *
 * These exports remain as no-ops to keep any legacy import sites compiling.
 * Do not re-introduce write logic here.
 */
export async function autoUpdateProjectPercent(_projectId: string): Promise<void> {
  // no-op — manual logs only
}

export async function autoUpdateProjectPercents(_projectIds: Iterable<string>): Promise<void> {
  // no-op — manual logs only
}
