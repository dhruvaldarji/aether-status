import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const TEST_TOKEN = "test-github-token";
const RESPONSE_BODY_SECRET = "private-response-body";
const CONTROLLER = {
  scheduledTime: Date.parse("2026-11-13T12:00:00.000Z"),
  cron: "2-59/5 * * * *",
};

async function invoke({ fetchImplementation, env = { GITHUB_TOKEN: TEST_TOKEN }, timeoutSignal } = {}) {
  const logs = [];
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  const originalTimeout = AbortSignal.timeout;

  globalThis.fetch = fetchImplementation;
  console.log = (entry) => logs.push(entry);
  console.error = (entry) => logs.push(entry);
  if (timeoutSignal) {
    AbortSignal.timeout = timeoutSignal;
  }

  try {
    let error;
    try {
      await worker.scheduled(CONTROLLER, env);
    } catch (caught) {
      error = caught;
    }
    return { logs, error };
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
    AbortSignal.timeout = originalTimeout;
  }
}

function records(logs) {
  return logs.map((entry) => JSON.parse(entry));
}

test("sends one authenticated dispatch POST and logs its 204 result", async () => {
  const calls = [];
  const response = {
    status: 204,
    get body() {
      throw new Error(RESPONSE_BODY_SECRET);
    },
  };
  let timeoutMs;
  const result = await invoke({
    fetchImplementation: async (...args) => {
      calls.push(args);
      return response;
    },
    timeoutSignal: (milliseconds) => {
      timeoutMs = milliseconds;
      return new AbortController().signal;
    },
  });

  assert.equal(result.error, undefined);
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(
    url,
    "https://api.github.com/repos/dhruvaldarji/aether-status/actions/workflows/uptime.yml/dispatches",
  );
  assert.equal(options.method, "POST");
  assert.deepEqual(options.headers, {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${TEST_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "aether-status-uptime-worker",
    "X-GitHub-Api-Version": "2026-03-10",
  });
  assert.deepEqual(JSON.parse(options.body), { ref: "main" });
  assert.equal(options.redirect, "error");
  assert.equal(timeoutMs, 30_000);

  const [record] = records(result.logs);
  assert.equal(record.scheduledTime, "2026-11-13T12:00:00.000Z");
  assert.equal(record.cron, CONTROLLER.cron);
  assert.equal(record.responseStatus, 204);
  assert.equal(record.outcome, "success");
  assert.equal(result.logs.join("\n").includes(TEST_TOKEN), false);
  assert.equal(result.logs.join("\n").includes(RESPONSE_BODY_SECRET), false);
});

test("rejects missing and blank tokens before calling fetch", async () => {
  for (const env of [{}, { GITHUB_TOKEN: " \n\t" }]) {
    let fetchCalls = 0;
    const result = await invoke({
      env,
      fetchImplementation: async () => {
        fetchCalls += 1;
        return { status: 204 };
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.error?.message, "GITHUB_TOKEN is required");
    const [record] = records(result.logs);
    assert.equal(record.scheduledTime, "2026-11-13T12:00:00.000Z");
    assert.equal(record.cron, CONTROLLER.cron);
    assert.equal(record.error, "missing_github_token");
    assert.equal("responseStatus" in record, false);
  }
});

test("rejects every response status other than 204 without reading its body", async () => {
  for (const status of [200, 202, 500]) {
    let fetchCalls = 0;
    let bodyReads = 0;
    const result = await invoke({
      fetchImplementation: async () => {
        fetchCalls += 1;
        return {
          status,
          get body() {
            bodyReads += 1;
            return RESPONSE_BODY_SECRET;
          },
        };
      },
    });

    assert.equal(fetchCalls, 1);
    assert.equal(bodyReads, 0);
    assert.equal(result.error?.message, `GitHub workflow dispatch returned status ${status}`);
    const [record] = records(result.logs);
    assert.equal(record.responseStatus, status);
    assert.equal(record.outcome, "failure");
    assert.equal(result.logs.join("\n").includes(RESPONSE_BODY_SECRET), false);
    assert.equal(result.logs.join("\n").includes(TEST_TOKEN), false);
  }
});

test("rejects redirects and sanitizes the fetch error", async () => {
  let fetchCalls = 0;
  let redirectMode;
  const errorText = `redirect response included ${TEST_TOKEN}`;
  const result = await invoke({
    fetchImplementation: async (_url, options) => {
      fetchCalls += 1;
      redirectMode = options.redirect;
      throw new TypeError(errorText);
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(redirectMode, "error");
  assert.equal(result.error?.message, "GitHub workflow dispatch request failed");
  assert.equal(result.logs.join("\n").includes(errorText), false);
  assert.equal(result.logs.join("\n").includes(TEST_TOKEN), false);
  assert.deepEqual(records(result.logs)[0], {
    event: "uptime_workflow_dispatch",
    scheduledTime: "2026-11-13T12:00:00.000Z",
    cron: CONTROLLER.cron,
    outcome: "failure",
    error: "request_failed",
  });
});

test("rejects network failures without logging arbitrary error contents", async () => {
  const errorText = `socket failure ${TEST_TOKEN} ${RESPONSE_BODY_SECRET}`;
  const result = await invoke({
    fetchImplementation: async () => {
      throw new Error(errorText);
    },
  });

  assert.equal(result.error?.message, "GitHub workflow dispatch request failed");
  assert.equal(result.logs.join("\n").includes(errorText), false);
  assert.equal(result.logs.join("\n").includes(TEST_TOKEN), false);
  assert.equal(result.logs.join("\n").includes(RESPONSE_BODY_SECRET), false);
});

test("rejects timeout failures and passes the bounded timeout signal to fetch", async () => {
  const controller = new AbortController();
  controller.abort();
  let timeoutMs;
  let signal;
  const result = await invoke({
    timeoutSignal: (milliseconds) => {
      timeoutMs = milliseconds;
      return controller.signal;
    },
    fetchImplementation: async (_url, options) => {
      signal = options.signal;
      throw new DOMException(`timeout included ${TEST_TOKEN}`, "TimeoutError");
    },
  });

  assert.equal(timeoutMs, 30_000);
  assert.equal(signal, controller.signal);
  assert.equal(signal.aborted, true);
  assert.equal(result.error?.message, "GitHub workflow dispatch request failed");
  assert.equal(result.logs.join("\n").includes(TEST_TOKEN), false);
  assert.equal(result.logs.join("\n").includes("TimeoutError"), false);
});
