import type { ReportSummary } from './reporter.js';
import type { ScoreRuleImpact, SeoScore } from './score.js';
import type { Violation } from './types.js';
import { escapeHtml } from './util/dom.js';
import { groupByFile } from './util/violations.js';

const GRADE_COLOR: Record<SeoScore['grade'], string> = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#d97706',
  D: '#ea580c',
  F: '#dc2626',
};

/** Render a self-contained (no external assets) HTML report — safe to use as a CI/CD artifact. */
export function formatHtmlReport(
  violations: readonly Violation[],
  summary: ReportSummary,
  score: SeoScore,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>astro-seo-enforcer report</title>
<style>${STYLES}</style>
</head>
<body>
<main>
<header>
  <h1>astro-seo-enforcer</h1>
  <p class="generated">Generated ${escapeHtml(new Date().toISOString())}</p>
</header>
${renderScoreCard(score)}
${renderSummary(summary)}
${renderRuleBreakdown(score.byRule)}
${renderViolations(violations)}
</main>
</body>
</html>`;
}

function renderScoreCard(score: SeoScore): string {
  const color = GRADE_COLOR[score.grade];
  return `<section class="score-card" style="--grade-color: ${color}">
  <div class="score-badge">
    <span class="score-value">${score.value}</span>
    <span class="score-max">/100</span>
  </div>
  <div class="score-grade">${escapeHtml(score.grade)}</div>
  <p class="score-label">SEO health score</p>
</section>`;
}

function renderSummary(summary: ReportSummary): string {
  return `<section class="stats">
  <div class="stat"><span class="stat-value">${summary.scannedFiles}</span><span class="stat-label">pages scanned</span></div>
  <div class="stat stat-error"><span class="stat-value">${summary.errorCount}</span><span class="stat-label">errors</span></div>
  <div class="stat stat-warning"><span class="stat-value">${summary.warningCount}</span><span class="stat-label">warnings</span></div>
</section>`;
}

function renderRuleBreakdown(byRule: readonly ScoreRuleImpact[]): string {
  if (byRule.length === 0) return '';
  const rows = byRule
    .map(
      (rule) => `  <tr>
    <td class="rule-name">${escapeHtml(rule.rule)}</td>
    <td class="num">${rule.errors}</td>
    <td class="num">${rule.warnings}</td>
    <td class="num">-${rule.impact.toFixed(2)}</td>
  </tr>`,
    )
    .join('\n');
  return `<section class="breakdown">
  <h2>Impact by rule</h2>
  <table>
    <thead><tr><th>Rule</th><th class="num">Errors</th><th class="num">Warnings</th><th class="num">Score impact</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</section>`;
}

function renderViolations(violations: readonly Violation[]): string {
  if (violations.length === 0) {
    return `<section class="empty"><p>✔ No SEO violations found.</p></section>`;
  }

  const files = groupByFile(violations);
  const sections = files
    .map(([file, fileViolations]) => {
      const items = fileViolations
        .map((violation) => {
          const hint = violation.hint ? `<p class="hint">↳ ${escapeHtml(violation.hint)}</p>` : '';
          return `      <li class="violation ${violation.severity}">
        <span class="badge ${violation.severity}">${violation.severity}</span>
        <span class="rule-tag">${escapeHtml(violation.rule)}</span>
        <p class="message">${escapeHtml(violation.message)}</p>
        ${hint}
      </li>`;
        })
        .join('\n');
      return `  <article class="file">
    <h3>${escapeHtml(file)}</h3>
    <ul>
${items}
    </ul>
  </article>`;
    })
    .join('\n');

  return `<section class="violations">
  <h2>Violations by page</h2>
${sections}
</section>`;
}

const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #f8fafc;
  --surface: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --error: #dc2626;
  --warning: #d97706;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1120;
    --surface: #131c2e;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --border: #1e293b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
main { max-width: 860px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
.generated { margin: 0 0 2rem; color: var(--muted); font-size: 0.85rem; }
h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }
section { margin-bottom: 2rem; }

.score-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
}
.score-badge { font-weight: 700; }
.score-value { font-size: 3rem; color: var(--grade-color); }
.score-max { font-size: 1.25rem; color: var(--muted); }
.score-grade {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.15rem 0.75rem;
  border-radius: 999px;
  background: var(--grade-color);
  color: #fff;
  font-weight: 700;
}
.score-label { margin: 0.5rem 0 0; color: var(--muted); font-size: 0.85rem; }

.stats { display: flex; gap: 1rem; }
.stat {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1rem;
  text-align: center;
}
.stat-value { display: block; font-size: 1.75rem; font-weight: 700; }
.stat-label { color: var(--muted); font-size: 0.8rem; }
.stat-error .stat-value { color: var(--error); }
.stat-warning .stat-value { color: var(--warning); }

table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
th, td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); text-align: left; }
th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
tbody tr:last-child td { border-bottom: none; }
.rule-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.empty { color: var(--muted); }

.file { margin-bottom: 1rem; }
.file h3 { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; margin: 0 0 0.5rem; }
.file ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.violation {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--muted);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}
.violation.error { border-left-color: var(--error); }
.violation.warning { border-left-color: var(--warning); }
.badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  color: #fff;
  margin-right: 0.4rem;
}
.badge.error { background: var(--error); }
.badge.warning { background: var(--warning); }
.rule-tag { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; color: var(--muted); }
.message { margin: 0.35rem 0 0; }
.hint { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.85rem; }
`;
