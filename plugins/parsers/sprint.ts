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

export function epicIdFromStoryId(storyId: string): string {
  return storyId.split(".")[0]
}

export function getEpicStoryStatuses(yaml: string, epicId: string): StoryStatus[] {
  const lines = yaml.split("\n")
  const statuses: StoryStatus[] = []
  let currentIsEpicStory = false
  let awaitingStatus = false

  for (const line of lines) {
    const idMatch = line.match(/id:\s*"(\d+\.\d+)"/)
    if (idMatch) {
      currentIsEpicStory = idMatch[1].startsWith(`${epicId}.`)
      awaitingStatus = currentIsEpicStory
      continue
    }
    if (awaitingStatus && line.trim().startsWith("status:")) {
      const statusMatch = line.match(/status:\s*(\S+)/)
      if (statusMatch) statuses.push(statusMatch[1] as StoryStatus)
      awaitingStatus = false
    }
  }

  return statuses
}

export function patchEpicStatusInYaml(yaml: string, epicId: string, newStatus: string): string {
  const lines = yaml.split("\n")
  let foundEpic = false
  return lines
    .map((line) => {
      if (line.match(new RegExp(`id:\\s*"${epicId}"\\s*$`))) {
        foundEpic = true
        return line
      }
      if (foundEpic && /id:\s*"/.test(line)) {
        foundEpic = false
        return line
      }
      if (foundEpic && line.trim().startsWith("status:")) {
        foundEpic = false
        return line.replace(/status:\s*\S+/, `status: ${newStatus}`)
      }
      return line
    })
    .join("\n")
}
