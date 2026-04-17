export const AgentRole = {
  PM: "pm",
  ARCHITECT: "architect",
  DEV: "dev",
  ANALYST: "analyst",
  REVIEWER: "reviewer",
} as const

export type AgentRole = typeof AgentRole[keyof typeof AgentRole]
