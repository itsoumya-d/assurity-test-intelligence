export function dashboardPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Assurity · Test Intelligence</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
    :root {
      --as-font-heading: 'ACSans', 'Manrope', sans-serif;
      --as-font-body: 'ACSans', 'Manrope', sans-serif;
      --as-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --as-bg: #FFFFFF;
      --as-surface: #E9EAEC;
      --as-ink: #121822;
      --as-lime: #C9F777;
      --as-indigo: #8892EC;
      --as-muted: #A8B8CD;
      --as-radius: 0px;
      --as-space: 8px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--as-bg); color: var(--as-ink); font-family: var(--as-font-body); }
    header { background: var(--as-ink); color: #fff; padding: calc(var(--as-space) * 5) calc(var(--as-space) * 4) calc(var(--as-space) * 3); }
    .wrap { max-width: 1120px; margin: 0 auto; }
    .eyebrow { margin: 0 0 var(--as-space); color: var(--as-lime); font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0 0 var(--as-space); font-family: var(--as-font-heading); font-size: clamp(32px, 5vw, 52px); line-height: 1.02; letter-spacing: -0.02em; }
    header p { margin: 0; max-width: 700px; color: #A8B8CD; line-height: 1.65; }
    main { max-width: 1120px; margin: 0 auto; padding: calc(var(--as-space) * 3) calc(var(--as-space) * 4); }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: calc(var(--as-space) * 2); }
    .card { background: var(--as-surface); padding: calc(var(--as-space) * 2); }
    .label { margin: 0 0 6px; color: #565D66; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .value { margin: 0; font-family: var(--as-font-heading); font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
    .value small { font-size: 11px; color: #565D66; }
    .gate { display: inline-block; margin-top: calc(var(--as-space) * 2); padding: 8px 12px; background: var(--as-lime); color: var(--as-ink); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    .gate.closed { background: #FFE0E0; color: #B42318; }
    .panels { display: grid; grid-template-columns: 1.2fr .9fr; gap: calc(var(--as-space) * 2); margin-top: calc(var(--as-space) * 2); }
    .panel { background: var(--as-bg); border: 1px solid #E9EAEC; padding: calc(var(--as-space) * 2); }
    .panel h2 { margin: 0 0 var(--as-space); font-family: var(--as-font-heading); font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; color: #565D66; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; padding: 6px 4px; border-bottom: 1px solid #E9EAEC; }
    td { padding: 8px 4px; border-bottom: 1px solid #F0F0F0; }
    td.num { text-align: right; font-family: var(--as-font-mono); }
    .pill { display: inline-block; padding: 4px 8px; background: var(--as-lime); color: var(--as-ink); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
    .pill.fail { background: #FFE0E0; color: #B42318; }
    .status { margin-top: var(--as-space); font-size: 12px; color: #565D66; }
    @media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, 1fr); } .panels { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<header>
  <div class="wrap">
    <p class="eyebrow">Assurity · Quality engineering</p>
    <h1>Release Test Intelligence</h1>
    <p>Pass rate, p95 duration, flaky tests, failure clusters, risk score and the release gate for a CI test run.</p>
  </div>
</header>
<main>
  <section class="kpis">
    <article class="card"><p class="label">Pass rate</p><p class="value" id="pass">—</p></article>
    <article class="card"><p class="label">P95 duration</p><p class="value" id="p95">—</p></article>
    <article class="card"><p class="label">Flake rate</p><p class="value" id="flake">—</p></article>
    <article class="card"><p class="label">Risk score</p><p class="value" id="risk">—</p></article>
  </section>
  <span class="gate" id="gate">Checking release gate…</span>

  <section class="panels">
    <article class="panel">
      <h2>Suites</h2>
      <table>
        <thead><tr><th>Suite</th><th>Passed</th><th>Failed</th><th>Skipped</th><th>Pass rate</th></tr></thead>
        <tbody id="suites"><tr><td colspan="5">Loading…</td></tr></tbody>
      </table>
      <p class="status" id="status">Loading test results…</p>
    </article>
    <article class="panel">
      <h2>Flaky tests</h2>
      <table>
        <thead><tr><th>Test</th><th>Pass</th><th>Fail</th><th>Flake</th></tr></thead>
        <tbody id="flaky"><tr><td colspan="4">Loading…</td></tr></tbody>
      </table>
      <p class="status">The release gate opens only when pass rate >=95%, failed = 0 and flake rate <=2%.</p>
    </article>
  </section>
</main>
<script>
  fetch('/api/summary').then((r) => r.json()).then((data) => {
    document.getElementById('pass').textContent = data.passRate + '%';
    document.getElementById('p95').innerHTML = data.p95DurationMs + ' <small>ms</small>';
    document.getElementById('flake').textContent = data.flakeRate + '%';
    document.getElementById('risk').textContent = data.riskScore;
    const gate = document.getElementById('gate');
    gate.textContent = data.releaseGate ? 'Release gate open' : 'Release gate closed';
    gate.className = 'gate' + (data.releaseGate ? '' : ' closed');
    document.getElementById('suites').innerHTML = data.suites.map((suite) =>
      '<tr><td>' + suite.suite + '</td><td class="num">' + suite.passed + '</td><td class="num">' + suite.failed + '</td><td class="num">' + suite.skipped + '</td><td class="num">' + suite.passRate + '%</td></tr>'
    ).join('') || '<tr><td colspan="5">No results</td></tr>';
    document.getElementById('flaky').innerHTML = data.flakyTests.length ? data.flakyTests.map((test) =>
      '<tr><td>' + test.name + '</td><td class="num">' + test.passes + '</td><td class="num">' + test.failures + '</td><td><span class="pill fail">' + test.flakeRate + '%</span></td></tr>'
    ).join('') : '<tr><td colspan="4">No flaky tests</td></tr>';
    document.getElementById('status').textContent = data.total + ' results · ' + data.failed + ' failed · ' + data.skipped + ' skipped.';
  }).catch((error) => { document.getElementById('status').textContent = 'API offline: ' + error.message; });
</script>
</body>
</html>`;
}
