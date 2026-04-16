import type { StoryStatus } from "../types/story.ts"

export function patchStoryFileStatus(content: string, newStatus: StoryStatus): string {
  return content.replace(/^(## Status\n)\S+/m, `$1${newStatus}`)
}
