# assurity-test-intelligence

A TypeScript/Node test-intelligence and release-assurance service: pass rate,
p95 duration, flaky-test detection, suite failure clusters, risk score and a
release gate.

## Why this exists

A green CI job can still hide a flaky suite or a slowing regression pack. This
service reduces a test run to the questions a quality lead asks before release:
what passed, what failed, what is flaky, how slow is the p95, and can the release
gate open?

## Formulas

```text
passRate   = passed / (passed + failed) * 100     // latest result per test
p95        = nearest-rank 95th percentile of durations
flaky      = test with both passed and failed results across runs
flakeRate  = flakyTests / distinctTests * 100
riskScore  = min(100, failed*10 + flaky*15
                    + max(0, 95-passRate)*5
                    + max(0, p95-5000)/100)

releaseGate = total > 0 AND passed > 0 AND failed = 0
              AND passRate >= 95 AND flakeRate <= 2
```

Status is evaluated from the latest result per test; flaky history is evaluated
across all recorded runs. Skipped tests are excluded from pass rate.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Liveness probe |
| POST | `/api/results` | Record a test result |
| GET | `/api/results` | List results |
| GET | `/api/summary` | Pass rate, p95, flakes, risk and gate |
| GET | `/` | Release Test Intelligence dashboard |

## Run

```bash
npm install
npm run dev
# or
npm run build && npm start
```

The server listens on `:8098` and seeds 50 tests with one flaky test.

## Test

```bash
npm test
npm run build
```

20 Vitest tests cover latest-result pass rate, p95, flaky detection, flake rate,
release gating, risk scoring, suite grouping, skipped tests, duplicate/invalid
results, empty runs and the API/dashboard routes.

## Design tokens

From Assurity's public site:

- Heading/body: ACSans (Manrope fallback)
- Background: `#FFFFFF`
- Surface: `#E9EAEC`
- Text: `#121822`
- Accent: `#C9F777`
- Secondary: `#8892EC`
- Muted: `#A8B8CD`
- Radius: `0px`
- Spacing unit: `8px`

## Docker

```bash
docker build -t assurity-test-intelligence .
docker run --rm -p 8098:8098 assurity-test-intelligence
```

## Honest scope

This is a tested reference service, not a CI plugin. It does not call Jenkins,
GitHub Actions, Azure DevOps or a test runner; it ingests normalized result
records and computes the quality metrics and release gate.

## License

MIT
