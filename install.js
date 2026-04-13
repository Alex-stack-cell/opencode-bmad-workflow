#!/usr/bin/env node
// opencode-bmad-workflow — cross-platform installer
// Usage: npx opencode-bmad-workflow install

import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import chalk from "chalk"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// ─── UI ───────────────────────────────────────────────────────────────────────

const ok   = (msg) => console.log(`${chalk.green("✓")} ${msg}`)
const warn = (msg) => console.log(`${chalk.yellow("⚠")}  ${msg}`)
const info = (msg) => console.log(`${chalk.dim("·")} ${msg}`)
const fail = (msg) => { console.error(`${chalk.red("✗")} ${msg}`); process.exit(1) }
const hr   = () => console.log(chalk.dim("─".repeat(44)))

// ─── Resolve dirs ─────────────────────────────────────────────────────────────

const SRC_DIR = __dirname

function resolveTarget() {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  const home = process.env.HOME || process.env.USERPROFILE
  if (!home) fail("Cannot determine home directory. Set OPENCODE_CONFIG_DIR manually.")
  return path.join(home, ".config", "opencode")
}

// ─── File copy ────────────────────────────────────────────────────────────────

function copyDir(srcDir, destDir, { skipExisting = false } = {}) {
  if (!fs.existsSync(srcDir)) return { copied: 0, skipped: 0 }
  fs.mkdirSync(destDir, { recursive: true })

  let copied = 0, skipped = 0
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src  = path.join(srcDir,  entry.name)
    const dest = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      const sub = copyDir(src, dest, { skipExisting })
      copied += sub.copied; skipped += sub.skipped
    } else if (skipExisting && fs.existsSync(dest)) {
      skipped++
    } else {
      fs.copyFileSync(src, dest)
      copied++
    }
  }
  return { copied, skipped }
}

// ─── opencode.json patch ──────────────────────────────────────────────────────

const PLUGIN_ID = "opencode-bmad-workflow"

function patchConfig(configPath) {
  let data = {}

  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8")
    try {
      data = JSON.parse(raw)
    } catch {
      warn(`opencode.json is not valid JSON — skipping plugin registration`)
      warn(`Add manually: ${chalk.cyan(`"plugin": ["${PLUGIN_ID}"]`)}`)
      return
    }
  }

  const plugins = Array.isArray(data.plugin)
    ? data.plugin
    : data.plugin ? [data.plugin] : []

  if (plugins.some((p) => p === PLUGIN_ID || p === "./plugins")) {
    ok(`opencode.json already has ${chalk.cyan(PLUGIN_ID)} registered`)
    return
  }

  data.plugin = [...plugins, PLUGIN_ID]
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2) + "\n")
  ok(`Registered ${chalk.cyan(PLUGIN_ID)} in opencode.json`)
}

// ─── Dependency install ───────────────────────────────────────────────────────

function installDeps(targetDir) {
  if (!fs.existsSync(path.join(targetDir, "package.json"))) return

  const has = (cmd) => { try { execSync(`${cmd} --version`, { stdio: "ignore" }); return true } catch { return false } }
  const hasBun = has("bun")
  const hasNpm = has("npm")

  if (!hasBun && !hasNpm) {
    warn("Neither bun nor npm found — run " + chalk.cyan("npm install") + " manually in " + targetDir)
    return
  }

  const cmd = hasBun ? "bun install --silent" : "npm install --silent"
  try {
    execSync(cmd, { cwd: targetDir, stdio: "inherit" })
    ok(`Dependencies installed ${chalk.dim(`(${hasBun ? "bun" : "npm"})`)}`)
  } catch {
    warn("Dependency install failed — run it manually in " + targetDir)
  }
}

// ─── Agent verification ───────────────────────────────────────────────────────

const REQUIRED_AGENTS = {
  pm:        "workflow_epic, workflow_story, workflow_sprint",
  architect: "workflow_story (tasks + dev notes)",
  analyst:   "workflow_review",
  reviewer:  "workflow_review",
  dev:       "workflow_story_dev (needs tool calling support)",
}

function verifyAgents(agentsDir) {
  const missing = Object.keys(REQUIRED_AGENTS).filter(
    (a) => !fs.existsSync(path.join(agentsDir, `${a}.md`))
  )
  if (missing.length === 0) {
    ok("All required agents found")
    return
  }
  warn(`Missing agents: ${chalk.yellow(missing.join(", "))}`)
  for (const a of missing) info(`${chalk.bold(a + ".md")}  →  ${REQUIRED_AGENTS[a]}`)
}

// ─── Idempotency check ────────────────────────────────────────────────────────

function isAlreadyInstalled(target) {
  const pluginDir = path.join(target, "plugins")
  const configPath = path.join(target, "opencode.json")
  if (!fs.existsSync(pluginDir)) return false
  if (!fs.existsSync(configPath)) return false
  try {
    const data = JSON.parse(fs.readFileSync(configPath, "utf8"))
    const plugins = Array.isArray(data.plugin) ? data.plugin : []
    return plugins.some((p) => p === PLUGIN_ID || p === "./plugins")
  } catch { return false }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)
  const force = args.includes("--force")
  const target = resolveTarget()

  console.log()
  console.log(chalk.bold("opencode-bmad-workflow") + chalk.dim(" — installer"))
  hr()
  console.log(`${chalk.dim("source")}  ${SRC_DIR}`)
  console.log(`${chalk.dim("target")}  ${target}`)
  console.log()

  // opencode present?
  const hasOpencode = (() => { try { execSync("opencode --version", { stdio: "ignore" }); return true } catch { return false } })()
  if (!hasOpencode) warn(`opencode not found in PATH — install from ${chalk.cyan("https://opencode.ai")} first`)

  // Already installed?
  if (!force && isAlreadyInstalled(target)) {
    ok("Already installed — run with " + chalk.cyan("--force") + " to reinstall")
    console.log()
    return
  }

  // Copy files
  if (SRC_DIR !== target) {
    for (const dir of ["commands", "plugins"]) {
      const { copied } = copyDir(path.join(SRC_DIR, dir), path.join(target, dir))
      if (copied > 0) ok(`Copied ${chalk.bold(dir + "/")} (${copied} files)`)
    }

    const { copied, skipped } = copyDir(
      path.join(SRC_DIR, "agents"),
      path.join(target, "agents"),
      { skipExisting: true }
    )
    ok(`Agents: ${chalk.green(copied + " added")}, ${chalk.dim(skipped + " already existed (not overwritten)")}`)

    const pkgSrc  = path.join(SRC_DIR, "package.json")
    const pkgDest = path.join(target,  "package.json")
    if (fs.existsSync(pkgSrc) && !fs.existsSync(pkgDest)) fs.copyFileSync(pkgSrc, pkgDest)
  } else {
    ok("Already in config directory — skipping file copy")
  }

  // Dependencies
  console.log()
  installDeps(target)

  // Config
  console.log()
  patchConfig(path.join(target, "opencode.json"))

  // Agents
  console.log()
  verifyAgents(path.join(target, "agents"))

  // Done
  console.log()
  hr()
  ok(chalk.bold("Installation complete") + " — restart opencode to activate")
  console.log()
  console.log("Quick start:")
  console.log(`  ${chalk.cyan("/workflow-setup")}    → set your language (fr, en, es…)`)
  console.log(`  ${chalk.cyan("/workflow-init")}     → list all available workflows`)
  console.log(`  ${chalk.cyan("/workflow-epic")}     → create your first epic`)
  console.log()
}

main()
