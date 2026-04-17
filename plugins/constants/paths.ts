export const Paths = {
  // Static artifact files
  CONFIG: "ai-artifacts/.workflow-config.json",
  SPRINT_STATUS: "ai-artifacts/sprint-status.yaml",
  PROGRESS: "ai-artifacts/.dev-progress.md",
  QUICK_TASKS_LOG: "ai-artifacts/quick-tasks-log.yaml",
  CONVENTIONS: "ai-artifacts/conventions.md",
  STORIES_DIR: "ai-artifacts/implementation-artifacts/stories",

  // Static doc files
  OVERVIEW: "docs/OVERVIEW.md",
  ROADMAP: "docs/ROADMAP.md",

  // Dynamic preview dirs
  epicPreviewDir: (slug: string) => `ai-artifacts/.previews/epic-${slug}`,
  storyPreviewDir: (epicId: number, slug: string) => `ai-artifacts/.previews/story-${epicId}-${slug}`,
  sprintPreviewDir: (slug: string) => `ai-artifacts/.previews/sprint-${slug}`,
  reviewPreviewDir: (slug: string) => `ai-artifacts/.previews/review-${slug}`,

  // Dynamic final paths
  epicFile: (id: string | number, slug: string) => `ai-artifacts/planning-artifacts/epic-${id}-${slug}.md`,
  storyFile: (epicId: number | string, storyNum: number, slug: string) =>
    `ai-artifacts/implementation-artifacts/stories/${epicId}-${storyNum}-${slug}.md`,
  sprintPlanFile: (slug: string) => `ai-artifacts/planning-artifacts/sprint-${slug}.md`,
  reviewDocsDir: (slug: string) => `ai-artifacts/planning-artifacts/review-${slug}`,
} as const
