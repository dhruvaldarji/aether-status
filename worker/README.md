# Uptime scheduler Worker

This scheduled-only Worker dispatches the existing `uptime.yml` workflow on the same five-minute cron used by `.upptimerc.yml`. The native GitHub schedule remains enabled as a backup. The Worker performs one dispatch request per cron event; it has no HTTP handler, storage, retry, or deduplication behavior.

The configuration is intended for Cloudflare Workers Free and uses no paid bindings or services. It emits structured logs and traces at full sampling; the expected schedule is 288 invocations per day, so operators should still check current account quotas and Cloudflare observability pricing before deployment.

## Local checks

Requirements: Node.js 22.12 or later, npm, Python 3, and PyYAML for `scripts/verify.sh` and the cron-guard fixture tests.

From the repository root:

```sh
cd worker
npm ci
npm test
npm run dry-run
cd ..
bash scripts/verify.sh
```

The tests mock `fetch` and do not contact GitHub. The fixture tests run the verifier against temporary checkout copies; they do not modify tracked files. `npm run dry-run` builds and checks the Worker without uploading it or making a GitHub dispatch.

## Operator-only deployment and acceptance

Dhruval must explicitly approve each remote mutation before it happens, including token creation, `wrangler deploy`, and `wrangler secret put`. Setting a secret creates and immediately deploys a new Worker version. Dhruval creates the GitHub token and provisions it as `GITHUB_TOKEN` per AET-385; an agent must not create, request, receive, or handle the token. Do not put its value in source, config, command arguments, or chat.

For a fresh Worker, Dhruval performs these steps from this directory, with explicit approval before each remote mutation:

1. Create a GitHub fine-grained token restricted to the target repository, with `Actions: write` and `Metadata: read` permissions.
2. Deploy the source and cron configuration with `npm exec wrangler -- deploy`. Do this first so a secret command cannot be mistaken for deploying this source to a new Worker.
3. Immediately provision the secret interactively with `npm exec wrangler -- secret put GITHUB_TOKEN`. Cloudflare documents that this creates and deploys a new version of the existing Worker, so the final version includes the already-deployed source and cron plus the secret. Complete the two deployment steps back-to-back; scheduled invocations before secret provisioning will reject.

For later code-only releases, Dhruval must approve the remote mutation before running `npm exec wrangler -- deploy`. No `workers.dev` route or preview URL is enabled by this configuration.

Live acceptance is Dhruval/operator-owned and must not be run as a local test: after cron propagation (up to 15 minutes), verify three successive scheduled dispatches and their `workflow_dispatch` runs on `main`, confirm status history updates, and verify the specified outage alert behavior. AET-385 is T0; tap-2 merge approval and merge remain operator-owned.

References: [Cloudflare Wrangler deploy](https://developers.cloudflare.com/workers/wrangler/commands/deploy/), [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), and GitHub's [Create a workflow dispatch event](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event). The GitHub REST docs list `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2026-03-10` as standard headers.
