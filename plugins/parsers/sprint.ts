import type { StoryStatus } from "../types/story.ts"

export function patchStoryStatusInYaml(yaml: string, storyId: string, newStatus: StoryStatus): string {
  const lines = yaml.split("\n")
  let foundStory = false
  return lines
    .map((line) => {
      if (line.includes(`id: "${storyId}"`)) {
        foundStory = true
        return line
      }
      if (foundStory && line.trim().startsWith("status:")) {
        foundStory = false
        return line.replace(/status:\s*\S+/, `status: ${newStatus}`)
      }
      return line
    })
    .join("\n")
}
