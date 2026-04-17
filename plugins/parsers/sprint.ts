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

export function computeNextStoryNum(yaml: string, epicId: number): number {
  if (!yaml) return 1
  const nums = [...yaml.matchAll(/id:\s*"(\d+)\.(\d+)"/g)]
    .filter(([, eId]) => Number(eId) === epicId)
    .map(([, , sNum]) => Number(sNum))
  return nums.length > 0 ? Math.max(...nums) + 1 : 1
}

export function appendStoryToYaml(yaml: string, epicId: number, storyId: string, title: string, slug: string): string {
  const newEntry = [
    `      - id: "${storyId}"`,
    `        title: "${title}"`,
    `        status: ready-for-dev`,
    `        parent: ${epicId}`,
    `        file: implementation-artifacts/stories/${epicId}-${storyId.split(".")[1]}-${slug}.md`,
  ].join("\n")

  if (!yaml) {
    return [
      `epics:`,
      `  - id: ${epicId}`,
      `    name: ""`,
      `    status: planned`,
      `    priority: HIGH`,
      `    goal: ""`,
      `    stories:`,
      newEntry,
    ].join("\n") + "\n"
  }

  const lines = yaml.split("\n")
  let inTargetEpic = false
  let lastStoryLineIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*-\s+id:\s+\d+/.test(line)) {
      inTargetEpic = line.includes(`id: ${epicId}`) || line.includes(`id: "${epicId}"`)
    }
    if (inTargetEpic && /^\s*-\s+id:\s+"[\d.]+"|^\s*stories:/.test(line)) {
      lastStoryLineIdx = i
    }
  }

  if (lastStoryLineIdx === -1) return yaml + "\n" + newEntry + "\n"

  let insertIdx = lastStoryLineIdx + 1
  while (insertIdx < lines.length) {
    const l = lines[insertIdx]
    if (/^\s{2}-\s+id:\s+\d/.test(l) && !l.includes(`id: "${epicId}`)) break
    insertIdx++
  }

  lines.splice(insertIdx, 0, newEntry)
  return lines.join("\n")
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
