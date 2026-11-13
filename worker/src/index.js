const GITHUB_DISPATCH_URL =
  "https://api.github.com/repos/dhruvaldarji/aether-status/actions/workflows/uptime.yml/dispatches";
const REQUEST_TIMEOUT_MS = 30_000;

function logDispatch(level, details) {
  console[level](JSON.stringify(details));
}

async function scheduled(controller, env) {
  const context = {
    event: "uptime_workflow_dispatch",
    scheduledTime: new Date(controller.scheduledTime).toISOString(),
    cron: controller.cron,
  };
  const token = env?.GITHUB_TOKEN;

  if (typeof token !== "string" || token.trim() === "") {
    logDispatch("error", {
      ...context,
      outcome: "failure",
      error: "missing_github_token",
    });
    throw new Error("GITHUB_TOKEN is required");
  }

  let response;
  try {
    response = await fetch(GITHUB_DISPATCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.trim()}`,
        "Content-Type": "application/json",
        "User-Agent": "aether-status-uptime-worker",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      body: JSON.stringify({ ref: "main" }),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    logDispatch("error", {
      ...context,
      outcome: "failure",
      error: "request_failed",
    });
    throw new Error("GitHub workflow dispatch request failed");
  }

  const succeeded = response.status === 204;
  logDispatch(succeeded ? "log" : "error", {
    ...context,
    responseStatus: response.status,
    outcome: succeeded ? "success" : "failure",
  });

  if (!succeeded) {
    throw new Error(`GitHub workflow dispatch returned status ${response.status}`);
  }
}

export default { scheduled };
