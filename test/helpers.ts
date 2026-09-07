import { parse } from 'node-html-parser';
import { resolveConfig } from '../src/config.js';
import type { SeoEnforcerUserConfig } from '../src/config.js';
import type { PageContext } from '../src/types.js';
import { extractMainText, extractVisibleText } from '../src/util/dom.js';

/** Build a `PageContext` from an HTML string, exactly like the runner does. */
export function makeContext(
  html: string,
  userConfig: SeoEnforcerUserConfig = {},
  file = 'index.html',
  siteFiles: Iterable<string> = [],
): PageContext {
  const root = parse(html, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { script: true, noscript: true, style: true, pre: true },
  });

  return {
    file,
    absolutePath: `/virtual/${file}`,
    distPath: '/virtual',
    root,
    bodyText: extractVisibleText(root),
    mainText: extractMainText(root),
    siteFiles: new Set(siteFiles),
    config: resolveConfig(userConfig),
  };
}

/** A document that passes every default rule — mutate pieces of it per test. */
export const CLEAN_PAGE = `<!doctype html>
<html lang="en">
<head>
<title>A perfectly reasonable page title about widgets</title>
<meta name="description" content="This description sits comfortably within the fifty to one hundred and sixty character window search engines like.">
<link rel="canonical" href="https://example.com/">
</head>
<body>
<header><nav><a href="#details">Jump to the widget details</a></nav></header>
<main>
<h1>Widgets</h1>
<h2 id="details">Details</h2>
<p>A widget is a small self-contained component that does exactly one job and does
it well. This page explains what widgets are, how they are built, why teams reach
for them, and where they tend to fall short once real traffic arrives. Every
widget starts life as a plain specification: a name, a set of inputs, a single
output, and a short list of promises about how it behaves when something goes
wrong. Good widgets are deliberately boring. They avoid clever tricks, they write
down their edge cases, and they fail loudly instead of quietly returning the
wrong answer. When you assemble many widgets into a larger machine, the boring
ones are the parts nobody thinks about again, while the clever ones are the parts
that wake an engineer at three in the morning.</p>
<p>Choosing a widget is mostly a question of trust. You are trusting the author to
have considered concurrency, invalid input, and the day the network disappears
for ninety seconds and then returns. The way that trust gets earned is a thorough
test suite, a changelog that reads as though a human wrote it, and a maintainer
who answers issues within a reasonable window. This page belongs to a small
catalogue of widget write-ups, each covering one family of widget and the
trade-offs that come with it. If you are new here, begin with the overview and
then follow the links at the foot of each entry to the widgets that pair well
with the one currently on your screen.</p>
<img src="/w.png" alt="A widget" width="200" height="150">
</main>
<footer>Copyright 2026</footer>
</body>
</html>`;
