import { tool } from "@opencode-ai/plugin";
import { runFeatureWorkflow } from "./workflows/feature.ts";
import { runReviewWorkflow } from "./workflows/review.ts";
import { runSprintWorkflow } from "./workflows/sprint.ts";
import { runEpicWorkflow, runEpicsOverview } from "./workflows/epic.ts";
import { getCurrentSessionId } from "./utils/session.ts";
import type { OpencodeClient } from "@opencode-ai/sdk";

type PluginCtx = {
  client: OpencodeClient;
  directory: string;
  worktree: string;
  project: { root: string };
};

async function WorkflowPlugin(ctx: PluginCtx) {
  const { client, directory } = ctx;

  return {
    tool: {
      // ─────────────────────────────────────────────────────────────────────
      // workflow_init — entry point
      // ─────────────────────────────────────────────────────────────────────
      workflow_init: tool({
        description:
          "List available BMAD automated workflows. Use this as a starting point to pick a workflow or continue manually.",
        args: {},
        async execute() {
          return `
# Available workflows

## workflow_epics — Roadmap overview
   Lists all existing epics with priority and inferred status.
   Recommended starting point.

## workflow_epic — New epic
   Chain: PM (scope) → PM (features)
   Generates: .workflow/epics/[epic].md, [epic]-features.md

## workflow_feature — New feature
   Chain: PM (PRD) → Architect (architecture) → PM (tasks)
   Generates: .workflow/[feature]/PRD.md, ARCHITECTURE.md, TASKS.md

## workflow_sprint — Sprint planning
   Chain: PM (plan) → PM (stories)
   Generates: .workflow/sprint-[date]/SPRINT-PLAN.md, STORIES.md

## workflow_review — Code review
   Chain: Analyst (analysis) → Reviewer (report)
   Generates: .workflow/review-[date]/ANALYSIS.md, REVIEW.md

---
All docs are saved in \`.workflow/\` at the project root.
Start with \`workflow_epics\` to see your roadmap, or \`workflow_epic\` to create your first epic.
          `.trim();
        },
      }),

      // ─────────────────────────────────────────────────────────────────────
      // workflow_epics — roadmap overview
      // ─────────────────────────────────────────────────────────────────────
      workflow_epics: tool({
        description:
          "Show a roadmap overview: list all existing epics from .workflow/epics/ with their priority, effort, and inferred status.",
        args: {},
        async execute() {
          const sessionId = await getCurrentSessionId(client, directory);
          return runEpicsOverview({ client, sessionId, directory });
        },
      }),

      // ─────────────────────────────────────────────────────────────────────
      // workflow_epic — create or define an epic
      // ─────────────────────────────────────────────────────────────────────
      workflow_epic: tool({
        description:
          "Automated epic workflow: PM defines scope and goals → PM suggests features to implement. Docs saved in .workflow/epics/. IMPORTANT: Never call this tool without explicit epic_name and epic_goal provided by the user. If either is missing, ask the user before calling.",
        args: {
          epic_name: tool.schema
            .string()
            .describe(
              "Short epic name explicitly provided by the user (e.g. 'User Authentication'). Never invent this.",
            ),
          epic_goal: tool.schema
            .string()
            .describe(
              "Business goal explicitly provided by the user. Never invent this.",
            ),
        },
        async execute(args) {
          const sessionId = await getCurrentSessionId(client, directory);
          return runEpicWorkflow({
            client,
            sessionId,
            directory,
            epicName: args.epic_name,
            epicGoal: args.epic_goal,
          });
        },
      }),

      // ─────────────────────────────────────────────────────────────────────
      // workflow_feature
      // ─────────────────────────────────────────────────────────────────────
      workflow_feature: tool({
        description:
          "Automated feature workflow: PM writes PRD → Architect designs architecture → PM breaks down tasks. Docs saved in .workflow/. IMPORTANT: Never call this tool without explicit feature_name and feature_description provided by the user. If either is missing, ask the user before calling.",
        args: {
          feature_name: tool.schema
            .string()
            .describe(
              "Short feature name explicitly provided by the user. Never invent this.",
            ),
          feature_description: tool.schema
            .string()
            .describe(
              "Detailed description explicitly provided by the user. Never invent this.",
            ),
        },
        async execute(args) {
          const sessionId = await getCurrentSessionId(client, directory);
          return runFeatureWorkflow({
            client,
            sessionId,
            directory,
            featureName: args.feature_name,
            featureDescription: args.feature_description,
          });
        },
      }),

      // ─────────────────────────────────────────────────────────────────────
      // workflow_review
      // ─────────────────────────────────────────────────────────────────────
      workflow_review: tool({
        description:
          "Automated code review workflow: Analyst investigates → Reviewer writes the report. Docs saved in .workflow/",
        args: {
          scope: tool.schema
            .string()
            .optional()
            .describe(
              "File or folder path to review (e.g. 'src/components/Button'). Leave empty to use the current git diff.",
            ),
        },
        async execute(args) {
          const sessionId = await getCurrentSessionId(client, directory);
          return runReviewWorkflow({
            client,
            sessionId,
            directory,
            scope: args.scope,
          });
        },
      }),

      // ─────────────────────────────────────────────────────────────────────
      // workflow_sprint
      // ─────────────────────────────────────────────────────────────────────
      workflow_sprint: tool({
        description:
          "Automated sprint planning workflow: PM creates the sprint plan → PM writes detailed user stories. Docs saved in .workflow/. IMPORTANT: Never call this tool without explicit sprint_goal provided by the user. If missing, ask the user before calling.",
        args: {
          sprint_goal: tool.schema
            .string()
            .describe(
              "Sprint goal explicitly provided by the user. Never invent this.",
            ),
          duration_weeks: tool.schema
            .number()
            .optional()
            .describe("Sprint duration in weeks (default: 2)"),
        },
        async execute(args) {
          const sessionId = await getCurrentSessionId(client, directory);
          return runSprintWorkflow({
            client,
            sessionId,
            directory,
            sprintGoal: args.sprint_goal,
            durationWeeks: args.duration_weeks,
          });
        },
      }),
    },
  };
}

export { WorkflowPlugin };
export default WorkflowPlugin;
