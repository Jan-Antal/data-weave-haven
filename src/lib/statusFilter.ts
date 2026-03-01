export const EMPTY_STATUS_FILTER_VALUE = "__EMPTY_STATUS__";
export const EMPTY_STATUS_FILTER_LABEL = "— Bez statusu —";

export function isEmptyStatusValue(status: string | null | undefined): boolean {
  return status == null || status.trim() === "";
}

export function matchesStatusFilter(
  status: string | null | undefined,
  filterSet: Set<string> | null,
): boolean {
  if (!filterSet) return true;
  if (isEmptyStatusValue(status)) return filterSet.has(EMPTY_STATUS_FILTER_VALUE);
  return filterSet.has(status);
}

export function getStatusFilterOptionValues(statusLabels: string[]): string[] {
  return [...statusLabels, EMPTY_STATUS_FILTER_VALUE];
}

export function getStatusFilterLabel(value: string): string {
  return value === EMPTY_STATUS_FILTER_VALUE ? EMPTY_STATUS_FILTER_LABEL : value;
}
