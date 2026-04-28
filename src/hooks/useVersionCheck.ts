/**
 * Version check hook — DISABLED.
 *
 * Previously this polled `/` every 2 minutes and reloaded the page when a new
 * build hash was detected, plus listened to `serviceWorker.controllerchange`
 * and reloaded immediately when a new SW took control.
 *
 * Both behaviours interrupted in-progress work (split panes, open sheets,
 * unsaved edits would disappear mid-task). New builds are now picked up
 * naturally on the next manual reload / app open, or via the explicit
 * "force refresh" button in the mobile header (`forceAppRefresh`).
 *
 * Kept as a no-op to preserve existing imports.
 */
export function useVersionCheck() {
  // Intentionally empty. Do not auto-reload during an active session.
}
