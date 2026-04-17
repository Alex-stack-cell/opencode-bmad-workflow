export const metaStatus = {
  name: "workflow_status",
  summary: "Project status",
  chain: "Reads sprint-status.yaml",
  generates: "(read-only)",
}

export const metaEpic = {
  name: "workflow_epic_save",
  summary: "New epic",
  chain: "PM (scope) → updates docs/OVERVIEW.md, docs/ROADMAP.md, sprint-status.yaml",
  generates: "ai-artifacts/planning-artifacts/epic-[n]-[slug].md",
}

export const metaStory = {
  name: "workflow_story_save",
  summary: "New story",
  chain: "PM (story) → Architect (tasks + dev notes) → updates sprint-status.yaml",
  generates: "ai-artifacts/implementation-artifacts/stories/[n-m]-[slug].md",
}

export const metaStoryUpdate = {
  name: "workflow_story_update",
  summary: "Update story status",
  chain: "Pure IO — updates sprint-status.yaml + story file (no LLM)",
  generates: "(updates existing files)",
}

export const metaStoryDev = {
  name: "workflow_story_dev",
  summary: "Implement story",
  chain: "Dev agent (implements tasks, updates checkboxes, updates Dev Agent Record)",
  generates: "(modifies project files + story file)",
}

export const metaStoryTasksList = {
  name: "workflow_story_tasks",
  summary: "List tasks in a story with index and status",
}

export const metaStoryTask = {
  name: "workflow_story_task",
  summary: "Implement one task at a time from a story (safer than workflow_story_dev)",
}

export const metaSprint = {
  name: "workflow_sprint_save",
  summary: "Sprint planning",
  chain: "PM (plan from backlog) → updates sprint-status.yaml story statuses",
  generates: "ai-artifacts/planning-artifacts/sprint-[slug].md",
}

export const metaReview = {
  name: "workflow_review_save",
  summary: "Code review",
  chain: "Analyst (analysis) → Reviewer (report)",
  generates: "ai-artifacts/planning-artifacts/review-[slug]/ANALYSIS.md, REVIEW.md",
}

export const metaTask = {
  name: "workflow_task",
  summary: "Quick task",
  chain: "Escalation check → Dev agent (direct implementation) → quick-tasks-log.yaml",
  generates: "ai-artifacts/quick-tasks-log.yaml",
}

export const metaConventions = {
  name: "workflow_conventions",
  summary: "Generate project conventions",
  chain: "Architect (codebase analysis) → ai-artifacts/conventions.md",
  generates: "ai-artifacts/conventions.md",
}

export const allMeta = [
  metaStatus,
  metaEpic,
  metaStory,
  metaStoryUpdate,
  metaStoryDev,
  metaStoryTasksList,
  metaStoryTask,
  metaSprint,
  metaReview,
  metaTask,
  metaConventions,
]
