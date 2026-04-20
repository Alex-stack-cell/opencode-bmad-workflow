# Running BMAD on local models — best practices

A pragmatic guide for running `opencode-bmad-workflow` on local models (Qwen, DeepSeek-Coder, Devstral, GLM, Llama) via LM Studio, Ollama, or similar runtimes.

## TL;DR

1. Pick a **tool-calling-trained** model ≥ 14B parameters for anything beyond trivial tasks
2. Load it with **≥ 32K context** (128K if your hardware allows)
3. Enable `localModel: true` in `ai-artifacts/.workflow-config.json` — the plugin will shrink prompts, disable file-exploration tools, and gate prompt size
4. For tasks that **modify** existing files, **inline the current file content in the story's Dev Notes** before running `/workflow-story-task`
5. Use **adversarial prompting** — force the model to verbalize its plan before editing, and state explicit "do not modify" constraints as hard rules

## Why local models fail on BMAD by default

Local LLMs under ~32K usable context break on long BMAD stories in three specific ways:

**1. Context saturation → compaction → loop.** A typical BMAD story is 5–10K tokens. With OpenCode's wrapper, system prompt, and tool schemas, the main session prompt is already 18–25K tokens. When the dev agent starts exploring with `read`/`glob`/`grep`, context fills fast and the runtime compacts — which erases the model's tool-call state. The model then re-explores from scratch, re-compacts, and loops forever.

**2. Hallucinated file contents.** When the dev agent can't read the file it's supposed to modify, it rewrites the file from scratch based on its training data's idea of what the code "should" look like. The existing code is destroyed.

**3. Weak negative-constraint following.** Models under ~24B parameters struggle with instructions like "do not modify X" or "do not delete Y". They drift toward producing complete, coherent files even when asked to make surgical additions only.

The plugin's local mode addresses problem #1 directly and problem #2 partially. Problem #3 requires a prompting pattern.

## Model selection

Tested on Apple Silicon (M-series) and NVIDIA consumer GPUs, running via LM Studio with MLX or llama.cpp + Metal.

| Model | Size (Q4_K_M) | Tool-use quality | Negative-constraint following | Recommendation |
|-------|---------------|------------------|-------------------------------|----------------|
| **Qwen2.5-Coder-32B** | ~18 GB | Excellent | Strong | **First choice** for BMAD. Best balance of quality and speed on 48 GB+ systems. |
| **Qwen2.5-Coder-14B** | ~8 GB | Very good | Good | Best option for 16 GB systems. Reliable on CREATE tasks, occasional drift on complex MODIFY. |
| **DeepSeek-Coder-V2-Lite-16B** | ~9 GB | Very good | Good | MoE architecture, fast inference. Strong on code, weaker on French instructions. |
| **Devstral Small 24B** | ~14 GB | Average | Average | Works on simple CREATE. Loops more often than Qwen. Slow tool-call emission. |
| **GLM-4.7 Flash 9B** | ~6 GB | Good (when prompted adversarially) | Weak | Capable when guided. Ignores negative constraints without adversarial prompting. |
| **Llama 3.x 8B** | ~5 GB | Poor | Poor | Not recommended. Tool-use unreliable even at 8B. |

Rule of thumb: **32B > 14B > everything else** for BMAD. Below 14B, you trade significant quality and need compensating prompting discipline.

## LM Studio tuning checklist

For any local model you try:

1. **Engine**: prefer **MLX** on Apple Silicon when available, otherwise **llama.cpp with Metal backend**
2. **GPU Offload**: 100% of layers on GPU — mixed CPU/GPU is always slower than full GPU
3. **Context length (`n_ctx`)**: at least 32K, preferably 64K–128K. Match your model's native max if your VRAM allows it
4. **Flash Attention**: ON when supported. If the model crashes with `swapaxes` or similar errors, try OFF (some quants of GLM, Phi have this issue)
5. **KV Cache type**: `Q8_0` — halves memory footprint vs F16 with no measurable quality loss
6. **Quant**: `Q4_K_M` is the sweet spot for 14B–32B. `Q5_K_M` if you have spare VRAM. Avoid `F16` and `Q8_0` — they waste memory for no practical gain
7. **Thinking mode**: if your model has a separate thinking mode (e.g. GLM, DeepSeek-R1), **disable it** for tool-use workflows — thinking tokens inflate the prompt and often degrade tool-call formatting

Verify the setup with Activity Monitor (macOS) or `nvidia-smi`: during generation, GPU should be at 80–100%. If it sits at 30–50%, you have CPU offload.

## Plugin configuration

Minimal local-mode config in `ai-artifacts/.workflow-config.json`:

```json
{
  "language": "fr",
  "localModel": true,
  "contextBudget": 24000,
  "shrinkMode": "balanced"
}
```

Setting `contextBudget` correctly is critical:

- It must be **≤ 80% of your model's loaded `n_ctx`** in LM Studio
- If `n_ctx = 32000` → set `contextBudget = 24000`
- If `n_ctx = 128000` → set `contextBudget = 100000`

A mismatch where `contextBudget` exceeds real `n_ctx` will cause LM Studio to reject prompts that the plugin thought were safe.

`shrinkMode` options:

- `conservative` — keep all ACs and Dev Notes verbatim; only scope the task block. Use when stories are short (< 3K tokens)
- `balanced` (default) — filter ACs by keyword overlap, filter Dev Notes by paragraph relevance. Fallback to "keep all" when filters would prune too much
- `aggressive` — stricter keyword thresholds, more pruning. Use only when hitting budget ceilings

The plugin retries with `aggressive` automatically if `balanced` exceeds the budget.

## Prompting patterns

### Pattern 1: inline existing file content for MODIFY tasks

Before running `/workflow-story-task N` on a task that modifies an existing file, append the current file to the story's Dev Notes:

```bash
STORY=$(ls ai-artifacts/implementation-artifacts/stories/*.md | head -1)
{
  echo ""
  echo "### Current state of \`src/app/service/weather.ts\` — EXTEND, do not rewrite"
  echo ""
  echo '```typescript'
  cat src/app/service/weather.ts
  echo '```'
  echo ""
  echo "**Hard constraints**: keep all existing exports, imports, and methods unchanged. Only add the new public methods requested in this task."
} >> "$STORY"
```

This gives the local model the same context a frontier model would fetch via `read`, without re-enabling exploration tools that trigger loops.

### Pattern 2: verbalize-before-edit

For tasks where semantic constraints matter more than pure code output, prompt the model to describe its plan first, before touching any file:

```
Before you edit anything:

1. Describe in 5 lines the existing structure of weather.ts
2. Explain how you will add searchCities and getCityByName WITHOUT
   deleting or modifying a single existing line
3. WAIT for my validation before editing

Then, and only then, produce a purely ADDITIVE diff.
FORBIDDEN: deleting a line, redefining a type, changing an import.
```

The model commits to its approach in writing. If the plan is wrong, you correct it before any code is written. This pattern rescued GLM-4.7 Flash 9B on a MODIFY task where it had previously rewritten the file from scratch.

### Pattern 3: explicit "do not modify" listed at the top of Dev Notes

BMAD Dev Notes sections that include a **hard constraints** sub-section at the very top are more reliably respected than constraints buried mid-document:

```markdown
## Dev Notes

### Hard constraints — violating these fails the task

- `citiesResource`: do not touch. Used by home page. Must remain byte-identical.
- `averageTemperature`: do not touch. Computed signal, home page depends on it.
- `getWeather(lat, lon): Promise<OpenMeteoResponse>`: do not change signature. Private, reused by new methods.
- No RxJS beyond `firstValueFrom`. No `Subject`, no `BehaviorSubject`.
- No `any`. No redefined types. Reuse imports from `../types/...`.

### Implementation details

(rest of dev notes here)
```

Negative constraints at the top of a section with a threatening header ("failing these fails the task") get ~2× the adherence from smaller models compared to inline mentions.

### Pattern 4: use `/workflow-task` (quick-task) for single-file CREATE

Quick tasks bypass the full BMAD ceremony and work extremely well on local models when the work is:

- A single file
- A pure create or a trivial additive modify
- Self-contained (no dependency on other unseen files)

Example that worked reliably on Devstral Small 24B in 37 seconds:

```
/workflow-task

Add a method formatCityName(raw: string): string to
src/app/pipes/city-name.pipe.ts that trims, title-cases,
and normalizes accents.
```

Reserve `/workflow-story` for multi-task features where the plan phase (PM + architect agents) actually earns its cost.

## Verification gates after every task

Local models produce plausible-looking code that doesn't always compile or respect constraints. Run these gates **every time** before moving to the next task:

### Gate 1: diff should be additive when the task said "do not modify"

```bash
git diff path/to/file.ts | grep "^-" | grep -v "^---"
```

If this returns any line when the task was supposed to be additive, the model deleted something. Revert and re-prompt.

### Gate 2: compilation

```bash
npx tsc --noEmit           # TypeScript
cargo check                # Rust
go vet ./...               # Go
```

### Gate 3: no redefined types or duplicated interfaces

```bash
grep -rn "interface Foo" src/
grep -rn "type Bar" src/
```

If the model redefined a type inline instead of importing the existing one, you'll have subtle drift later.

### Gate 4: no regression on unrelated files

```bash
git diff --stat
```

Scan for files that weren't part of the task scope. Extra modifications = scope drift.

### Gate 5: manual smoke test

For UI changes, run the dev server and click through the affected flow. Type-checking is not feature-checking.

## When to fall back to a frontier model

Local mode is the right choice when:

- You're offline or air-gapped
- The task is small, well-scoped, and self-contained
- You accept iteration time (local is 5–10× slower than Claude/GPT on the same task)
- You can't or won't send code to a cloud provider

Switch back to frontier (Claude, GPT-4, Gemini) when:

- The task spans 4+ files with non-trivial dependencies
- The PM/Architect phases need nuanced product judgment
- You're on a deadline and iteration speed matters more than cost
- The model you're running keeps violating negative constraints even with adversarial prompting (sign that it's undersized)

BMAD supports hybrid setups — assign frontier models to `pm.md` and `architect.md` agents for planning, local to `dev.md` for implementation. Configure per-agent via the `model:` frontmatter in `~/.config/opencode/agents/*.md`:

```yaml
---
description: Dev agent
mode: subagent
model: ollama/qwen2.5-coder:32b
---
```

```yaml
---
description: Product manager
mode: subagent
model: anthropic/claude-sonnet-4-6
---
```

## Performance expectations

Measured on an Apple Silicon M-series with LM Studio, MLX engine, 32K–128K context, Q4_K_M quant:

| Step | Frontier (Claude/GPT) | Qwen2.5-Coder-32B local | GLM-4.7 Flash 9B local |
|------|----------------------|-------------------------|------------------------|
| `/workflow-epic` | 10–20 s | 30–60 s | 60–90 s |
| `/workflow-story` | 30–60 s | 2–4 min | 1–2 min |
| Single-task CREATE | 10–20 s | 30–60 s | 30–60 s |
| Single-task MODIFY | 15–30 s | 1–2 min | 1–2 min |
| Full 5-task story | 3–5 min | 10–20 min | 8–15 min |

Local is slower. The tradeoff is privacy, offline capability, and zero marginal cost per token.

## Known failure modes and workarounds

**Symptom**: the model enters an infinite loop of `read` → `glob` → `read`
→ **Cause**: `localModel: false` or file tools re-enabled
→ **Fix**: set `localModel: true` in config; the plugin disables exploration tools in dev sessions

**Symptom**: "prompt too large" / "number of tokens keeps being greater than context length"
→ **Cause**: LM Studio `n_ctx` too small for your story + conventions + wrapper overhead
→ **Fix**: raise `n_ctx` in LM Studio; set `contextBudget` in plugin config to ~80% of it

**Symptom**: the model rewrites a file instead of extending it
→ **Cause**: no current file content in the prompt, model hallucinates from training
→ **Fix**: apply Pattern 1 (inline existing file content in Dev Notes) + Pattern 2 (verbalize-before-edit)

**Symptom**: the model ignores "do not modify X" constraints
→ **Cause**: undersized model (< 14B) with weak negative-constraint following
→ **Fix**: apply Pattern 3 (hard constraints block at top of Dev Notes) + upgrade to 14B–32B class

**Symptom**: model crashes with `swapaxes` / `AttributeError` on LM Studio
→ **Cause**: Flash Attention bug specific to that model's architecture or quant
→ **Fix**: disable Flash Attention for that model in LM Studio settings

**Symptom**: prompt size check in plugin says "ok" but LM Studio rejects
→ **Cause**: `contextBudget` set higher than real `n_ctx`
→ **Fix**: align the two numbers (see Plugin configuration)

**Symptom**: story status stays `ready-for-dev` after running `workflow_story_task`
→ **Cause**: known limitation — only `workflow_story_dev` updates sprint-status to `in-progress`
→ **Workaround**: run `/workflow-story-update` manually, or run all tasks via `workflow_story_dev`. To be fixed in a future release.

## Further reading

- Main plugin README: [../README.md](../README.md)
- Plugin architecture: [../plugins/ARCHITECTURE.md](../plugins/ARCHITECTURE.md)
- BMAD methodology: [github.com/bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)
- OpenCode dynamic context pruning: [github.com/Opencode-DCP/opencode-dynamic-context-pruning](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning)
