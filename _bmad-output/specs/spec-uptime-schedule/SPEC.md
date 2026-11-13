---
id: SPEC-uptime-schedule
companions:
  - https://github.com/dhruvaldarji/aether-specs/blob/main/_bmad-output/specs/spec-cloud-handoff/SPEC.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Uptime schedule and factory join

## Why

This spec fixes a pain. aether-status is the off-machine monitor for the Aether dashboard. A real outage must open an issue and email Dhruval. The email path works: a test outage on 2026-11-12 sent the email in 48 seconds. But the check almost never runs on its own. From 20:32Z on 2026-11-12 to 03:21Z on 2026-11-13, GitHub recorded 0 scheduled runs. After that, Uptime CI ran by schedule only twice in about 8 hours, against about 96 expected. So a real outage is almost never seen. This is also the first change that goes through `spec-cloud-handoff`.

## Capabilities

- **CAP-1**
  - **intent:** The Uptime CI check runs every 5 minutes, and no person starts it. GitHub's schedule or the Cloudflare Worker (CAP-4) starts it.
  - **success:** After the Worker is live, 3 Uptime CI runs in a row appear about 5 minutes apart. Each has `event: schedule` or is a `workflow_dispatch` run started by the Worker. No person starts a run in that window.
- **CAP-2**
  - **intent:** A real outage opens an issue and sends the alert email with no manual run.
  - **success:** In the acceptance window, `history/aether.yml` updates from the CAP-1 runs. An issue opens on the first CAP-1 run after the check target fails. Manual runs stay allowed. The acceptance test does not count them.
- **CAP-3**
  - **intent:** aether-status is a secondary repo of the AetherOS factory project at tier T0.
  - **success:** `.aether/hooks.yaml` names the primary, aether-specs (merged in d5232e9). The aether-specs manifest lists aether-status in `repos[]`. The `main` branch rules block direct pushes from people and agents and require the `Devin Review` status. The one bypass actor is the `aether-status-upptime` GitHub App, so check runs can still commit status history. A check run then commits history with no failed push.
- **CAP-4**
  - **intent:** A Cloudflare Worker on the Workers Free plan starts Uptime CI every 5 minutes, on cron `2-59/5 * * * *` (288 calls a day). It calls `POST /repos/dhruvaldarji/aether-status/actions/workflows/uptime.yml/dispatches` with `ref: main`.
  - **success:** The Worker's cron log shows calls every 5 minutes that get HTTP 204 back. Each call matches a new Uptime CI `workflow_dispatch` run. The Worker code and its `wrangler` config live in this repo under `worker/`.

## Constraints

- The schedule source of truth stays `.upptimerc.yml`. The weekly template update overwrites generated workflows, so a fix that lives only in a generated file comes back broken.
- The check stays independent of the Mac (launch rule LR-R2). The monitor must work when the Mac is down. So there is no self-hosted runner and no trigger that runs on this Mac.
- No secret value goes into the repo. The Access service token stays in repo secrets, so the repo can stay public.
- Every merge on aether-status needs the tap 2 card while the project is at T0.
- The Worker costs $0: the Workers Free plan, no paid service and no storage. Dhruval allowed the fallback only at no cost, so a design that needs a paid plan is out of scope.
- Dhruval creates the GitHub token and stores it as the Worker secret. The token is scoped to aether-status only, with Actions write and Metadata read. No agent creates, sees or stores the token value, because he creates every new credential himself.
- Deploying the Worker is outward-facing, so it needs Dhruval's approval.
- The Worker adds runs and removes nothing. GitHub's own schedule stays in place as the backup if the Worker fails.

## Non-goals

- A change to the check target or the check interval.
- A move off Upptime.
- The swap from `claude-review` to Devin Review in other repos.

## Success signal

- With no one at the keyboard, 3 Uptime CI runs in a row appear about 5 minutes apart, and the status history updates from them.

## Assumptions

- GitHub's documentation says scheduled runs can be delayed or dropped under load. That fits the 2 scheduled Uptime CI runs seen in about 8 hours on 2026-11-13. The builder found no cron or branch defect.
- The repo has no test suite. `scripts/verify.sh` parses every workflow file and proves that the cron in the generated `uptime.yml` equals `workflowSchedule.uptime` in `.upptimerc.yml`. For CAP-4 it also checks the Worker config cron.
