#!/usr/bin/env bash
set -euo pipefail

# Requires Python 3 and PyYAML (`python3 -m pip install PyYAML`); dependencies are not installed here.
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'FAIL: Python 3 is required. Install Python 3 and rerun this script.' >&2
  exit 1
fi

if ! python3 -c 'import yaml' >/dev/null 2>&1; then
  printf '%s\n' 'FAIL: PyYAML is required. Install it with `python3 -m pip install PyYAML` and rerun; no packages were installed.' >&2
  exit 1
fi

python3 - <<'PY'
import json
import sys
from pathlib import Path

import yaml


def fail(message):
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


workflow_dir = Path(".github/workflows")
workflow_paths = sorted((*workflow_dir.glob("*.yml"), *workflow_dir.glob("*.yaml")))
if not workflow_paths:
    fail(f"No .yml or .yaml workflow files found in {workflow_dir}")

workflows = {}
for path in workflow_paths:
    try:
        with path.open(encoding="utf-8") as stream:
            document = yaml.load(stream, Loader=yaml.BaseLoader)
    except (OSError, yaml.YAMLError) as error:
        fail(f"Could not parse workflow YAML {path}: {error}")
    if not isinstance(document, dict):
        fail(f"Workflow YAML must have a mapping at its root: {path}")
    workflows[path] = document

uptime_path = workflow_dir / "uptime.yml"
uptime = workflows.get(uptime_path)
if uptime is None:
    fail(f"Generated Uptime workflow is missing: {uptime_path}")

config_path = Path(".upptimerc.yml")
try:
    with config_path.open(encoding="utf-8") as stream:
        config = yaml.load(stream, Loader=yaml.BaseLoader)
except (OSError, yaml.YAMLError) as error:
    fail(f"Could not parse Upptime config {config_path}: {error}")
if not isinstance(config, dict):
    fail(f"Upptime config must have a mapping at its root: {config_path}")

workflow_schedule = config.get("workflowSchedule")
if not isinstance(workflow_schedule, dict):
    fail(f"{config_path} must contain a workflowSchedule mapping")
configured_cron = workflow_schedule.get("uptime")
if not isinstance(configured_cron, str) or not configured_cron.strip():
    fail(f"{config_path} must contain a nonempty workflowSchedule.uptime value")

triggers = uptime.get("on")
if not isinstance(triggers, dict):
    fail(f"{uptime_path} must contain an on mapping")
schedule = triggers.get("schedule")
if not isinstance(schedule, list) or len(schedule) != 1:
    fail(f"{uptime_path} must contain exactly one schedule entry")
if not isinstance(schedule[0], dict):
    fail(f"{uptime_path} schedule entry must be a mapping")
generated_cron = schedule[0].get("cron")
if not isinstance(generated_cron, str) or not generated_cron.strip():
    fail(f"{uptime_path} schedule entry must contain a nonempty cron value")
if generated_cron != configured_cron:
    fail(
        f"Uptime cron mismatch: {config_path} has {configured_cron!r}, "
        f"but {uptime_path} has {generated_cron!r}"
    )

worker_config_path = Path("worker/wrangler.json")
if not worker_config_path.is_file():
    fail(f"Worker Wrangler config is missing: {worker_config_path}")
try:
    with worker_config_path.open(encoding="utf-8") as stream:
        worker_config = json.load(stream)
except (OSError, json.JSONDecodeError) as error:
    fail(f"Could not parse Worker Wrangler config {worker_config_path}: {error}")
if not isinstance(worker_config, dict):
    fail(f"Worker Wrangler config must have a mapping at its root: {worker_config_path}")

worker_triggers = worker_config.get("triggers")
if not isinstance(worker_triggers, dict):
    fail(f"{worker_config_path} must contain a triggers mapping")
worker_crons = worker_triggers.get("crons")
if not isinstance(worker_crons, list) or len(worker_crons) != 1:
    fail(f"{worker_config_path} must contain exactly one cron entry")
worker_cron = worker_crons[0]
if not isinstance(worker_cron, str) or not worker_cron.strip():
    fail(f"{worker_config_path} cron entry must be a nonempty string")
if worker_cron != configured_cron:
    fail(
        f"Worker cron mismatch: {worker_config_path} has {worker_cron!r}, "
        f"but {config_path} has {configured_cron!r}"
    )

print(f"PASS: parsed {len(workflow_paths)} workflow YAML files")
print(f"PASS: Uptime cron matches .upptimerc.yml ({configured_cron})")
print(f"PASS: Worker cron matches .upptimerc.yml ({worker_cron})")
PY
