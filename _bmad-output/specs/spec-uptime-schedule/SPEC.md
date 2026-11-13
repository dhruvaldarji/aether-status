---
id: SPEC-uptime-schedule
companions:
  - https://github.com/dhruvaldarji/aether-specs/blob/main/_bmad-output/specs/spec-cloud-handoff/SPEC.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Uptime schedule and factory join

## Why

This spec fixes a pain. aether-status is the off-machine monitor for the Aether dashboard. A real outage must open an issue and email Dhruval. The email path works: a test outage on 2026-11-12 sent the email in 48 seconds. But the check never runs on its own. From 20:32Z on 2026-11-12 to 01:05Z on 2026-11-13, GitHub recorded 0 runs with `event: schedule`, and all 6 runs were started by hand. A disable and re-enable of the workflow at 23:35Z did not help. So a real outage sends nothing. This is also the first change that goes through `spec-cloud-handoff`.

## Capabilities

- **CAP-1**
  - **intent:** The Uptime CI workflow starts on its schedule. No person or script starts it.
  - **success:** After the merge, 3 consecutive Uptime CI runs with `event: schedule` appear, about 5 minutes apart.
- **CAP-2**
  - **intent:** A real outage opens an issue and sends the alert email with no manual run.
  - **success:** The `history/aether.yml` file updates from scheduled runs only, and an issue opens on the first scheduled run after the check target fails.
- **CAP-3**
  - **intent:** aether-status is a secondary repo of the AetherOS factory project at tier T0.
  - **success:** `.aether/hooks.yaml` names the primary, aether-specs. The aether-specs manifest lists aether-status in `repos[]`. The `master` branch rules block direct pushes and require the `Devin Review` status.

## Constraints

- The schedule source of truth stays `.upptimerc.yml`. The weekly template update overwrites generated workflows, so a fix that lives only in a generated file comes back broken.
- The check stays independent of the Mac (launch rule LR-R2). No self-hosted runner, and no trigger that runs on this Mac, because the monitor must work when the Mac is down.
- No secret value goes into the repo. The Access service token stays in repo secrets, so the repo can stay public.
- Every merge on aether-status needs the tap 2 card while the project is at T0.

## Non-goals

- A change to the check target or the check interval.
- A move off Upptime.
- The swap from `claude-review` to Devin Review in other repos.

## Success signal

- With no one at the keyboard, 3 scheduled Uptime CI runs in a row appear about 5 minutes apart, and the status history updates from them.

## Assumptions

- The root cause is not known yet. The builder finds it and records it, with evidence, in the pull request Decision log.
- The repo has no test suite. The verify command parses every workflow file (`actionlint` or an equivalent parse). It also proves that the cron in the generated `uptime.yml` equals the `workflowSchedule.uptime` value in `.upptimerc.yml`.

## Open Questions

- If GitHub never fires schedules for this repo, for a reason the repo cannot fix, is an outside trigger acceptable as the fallback? One example is a Cloudflare Worker cron that dispatches the workflow.
