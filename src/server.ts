import { buildApp } from "./app.js";
import { TestIntelligenceService, TestResult } from "./intelligence.js";

const service = new TestIntelligenceService();
const base = Date.parse("2026-11-06T09:00:00Z");
const suites = ["Auth", "Checkout", "Search", "Profile"];

for (let i = 1; i <= 50; i += 1) {
  const suite = suites[i % suites.length];
  const result: TestResult = {
    id: `run-${i}`,
    suite,
    name: `test-${String(i).padStart(2, "0")}`,
    status: "passed",
    durationMs: 200 + i * 60,
    commit: "abc1234",
    startedAt: new Date(base + i * 1_000).toISOString()
  };
  service.record(result);
}

service.record({
  id: "run-flake-fail",
  suite: "Auth",
  name: "test-01",
  status: "failed",
  durationMs: 900,
  commit: "abc1234",
  startedAt: new Date(base).toISOString()
});
service.record({
  id: "run-flake-pass",
  suite: "Auth",
  name: "test-01",
  status: "passed",
  durationMs: 700,
  commit: "abc1234",
  startedAt: new Date(base + 60_000).toISOString()
});

const app = buildApp(service);
const port = Number(process.env.PORT ?? 8098);
await app.listen({ host: "0.0.0.0", port });
console.log(`assurity-test-intelligence listening on :${port}`);
