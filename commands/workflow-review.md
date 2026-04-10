---
description: Automated code review - Analyst investigates, Reviewer writes structured report. Saves docs in .workflow/
agent: analyst
---

Run the code review workflow in 2 steps.

Scope: $ARGUMENTS (use current git diff if empty)

## Step 1 - Analyst: Deep technical analysis

Act as a senior technical analyst. Perform a thorough analysis of: $ARGUMENTS (or current git diff if empty).

Look for: logic errors and edge cases, performance issues, complexity hotspots, security concerns, missing error handling, test coverage gaps.

Be methodical. List all findings with file references and line numbers.

Save analysis in `.workflow/review-[date]/ANALYSIS.md`.

---

**CHECKPOINT — Stop here and show the analysis to the user.**

Ask:
1. Do the findings look accurate?
2. Any areas you want to investigate deeper before the review report?

Wait for explicit confirmation before proceeding to Step 2.

---

## Step 2 - Reviewer: Structured review report

Only run after analysis is validated.

Act as a senior code reviewer. Write a structured review report based on the confirmed analysis.

Format:
- **CRITICAL** — Must fix before merge
- **HIGH** — Should fix before merge
- **MEDIUM** — Consider fixing
- **LOW** — Optional suggestions
- Verdict: APPROVED / CHANGES REQUESTED
- Summary of strengths

Save report in `.workflow/review-[date]/REVIEW.md`.

---

Display the verdict and list CRITICAL/HIGH issues to the user.
