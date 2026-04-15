const PROJECT_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#d97706', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // purple
  '#eab308', // yellow
  '#0ea5e9', // sky
  '#84cc16', // lime
  '#e11d48', // rose
  '#7c3aed', // violet-dark
  '#059669', // green
  '#db2777', // fuchsia
  '#0891b2', // cyan-dark
  '#ca8a04', // yellow-dark
];

export function getProjectColor(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash + projectId.charCodeAt(i)) | 0;
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}
