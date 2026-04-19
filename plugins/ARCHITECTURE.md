# Plugin Architecture

## Target Structure

This document describes the target architecture for a full refactor.
Current code lives in `workflows/` and `utils/` (legacy). Migration is incremental.

```
plugins/
├── index.ts                   # entry: plugin registration only
├── tsconfig.json
│
├── types/                     # interfaces and pure types, no logic
│   ├── workflow.ts            # WorkflowCtx, WorkflowRunCtx, WorkflowConfig
│   ├── task.ts                # Task
│   └── story.ts               # StoryStatus
│
├── meta/                      # tool descriptors (name, summary, chain, generates)
│   └── index.ts
│
├── tools/                     # tool factories: args schema + execute wiring + orchestration
│   ├── epic.ts
│   ├── review.ts
│   ├── sprint.ts
│   ├── story.ts
│   ├── story-dev.ts
│   ├── story-task.ts          # list + single-task execution
│   ├── story-update.ts
│   └── task.ts
│
├── session/                   # OpenCode API wrapper, split by responsibility
│   ├── context.ts             # getCurrentSessionId, withSession
│   ├── agent.ts               # runAgentSession, runDevAgentSession
│   └── polling.ts             # waitForIdle
│
├── storage/                   # pure I/O only — no transformation logic
│   ├── config.ts              # loadConfig, saveConfig (.workflow-config.json)
│   ├── docs.ts                # readDoc, writeDoc
│   ├── sprint.ts              # readSprintStatus, writeSprintStatus
│   ├── stories.ts             # findStoryFile, readStoryFile, writeStoryFile
│   └── progress.ts            # writeProgressFile, clearProgressFile
│
└── parsers/                   # pure transformations — zero side effects, no I/O
    ├── slugify.ts             # slugify (string → slug)
    ├── sprint.ts              # patchStoryStatusInYaml
    ├── stories.ts             # patchStoryFileStatus
    └── tasks.ts               # parseTopLevelTasks, allTasksDone, parseUncheckedTopLevelTasks
```

## Principles

- **types/** → no logic, no imports from other layers
- **parsers/** → pure functions only, input → output, no side effects, no I/O
- **storage/** → I/O only, no transformation logic (delegates to parsers/)
- **session/** → OpenCode API interactions only
- **tools/** → orchestration: calls session/ + storage/ + parsers/, wires tool schema
- **meta/** → static descriptors only, imported by index.ts

## Migration Plan

1. Add new tools directly in the target structure (new files only)
2. Migrate existing workflows/ one file at a time
3. Migrate utils/ one module at a time (config → storage/config, etc.)
4. Update index.ts imports last
5. Delete legacy folders (workflows/, utils/) once all imports are updated

## Legacy → Target Mapping

| Legacy | Target |
|--------|--------|
| `workflows/epic.ts` | `tools/epic.ts` |
| `workflows/story.ts` | `tools/story.ts` |
| `workflows/story-dev.ts` | `tools/story-dev.ts` |
| `workflows/story-update.ts` | `tools/story-update.ts` |
| `workflows/sprint.ts` | `tools/sprint.ts` |
| `workflows/review.ts` | `tools/review.ts` |
| `workflows/task.ts` | `tools/task.ts` |
| `utils/session.ts` (withSession, withSession) | `session/context.ts` |
| `utils/session.ts` (runAgentSession, runDevAgentSession) | `session/agent.ts` |
| `utils/session.ts` (waitForIdle) | `session/polling.ts` |
| `utils/config.ts` | `storage/config.ts` |
| `utils/files.ts` (readDoc, writeDoc) | `storage/docs.ts` |
| `utils/files.ts` (slugify) | `parsers/slugify.ts` |
| `utils/status.ts` (readSprintStatus, writeSprintStatus) | `storage/sprint.ts` |
| `utils/status.ts` (patchStoryStatusInYaml) | `parsers/sprint.ts` |
| `utils/status.ts` (findStoryFile, readStoryFile, writeStoryFile) | `storage/stories.ts` |
| `utils/status.ts` (patchStoryFileStatus) | `parsers/stories.ts` |
| `utils/status.ts` (writeProgressFile, clearProgressFile) | `storage/progress.ts` |
| `utils/status.ts` (allTasksDone, parseUncheckedTopLevelTasks) | `parsers/tasks.ts` |
| `meta` exports in each workflow file | `meta/index.ts` |
