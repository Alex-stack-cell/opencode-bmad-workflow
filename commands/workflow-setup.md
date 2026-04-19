---
description: Configure workflow preferences (language, local-model mode, context budget, shrink mode)
---

If the user passed arguments inline (for example `local_model=true context_budget=100000 shrink_mode=balanced language=fr`), parse them and call `workflow_setup` directly with the matching tool args. Do NOT ask questions when arguments are provided.

If the user passed NO arguments, call `workflow_setup` with no args — it will print the current config.

Available args for `workflow_setup`:

- `language` — one of `en, fr, es, de, pt, it, ja, zh`
- `local_model` — `true` or `false`. Enable for Qwen, DeepSeek-Coder, Devstral, Llama, or any model with < 32k usable context. Shrinks story/conventions before prompting and disables file-read tools in dev sessions.
- `context_budget` — integer token budget (default `32000`). Set this to ~80% of your model's usable context window.
- `shrink_mode` — `aggressive`, `balanced` (default), or `conservative`. Only applied when `local_model` is true.

If the user asked to change the language and did NOT specify which, ask: "Quelle langue pour les documents générés ? (en, fr, es, de, pt, it, ja, zh)" — then call `workflow_setup` with only the `language` arg.

After calling the tool, return its output verbatim. Do not summarize.
