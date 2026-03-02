const PROJECT_COLORS = [
  '#256422', '#3b82f6', '#2d7a2d', '#d97706', '#ef4444',
  '#48a344', '#8b5cf6', '#06b6d4', '#a7d9a2', '#f59e0b',
];

export function getProjectColor(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash + projectId.charCodeAt(i)) | 0;
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}
