import { parse } from 'node-html-parser';
import { resolveConfig } from '../src/config.js';
import type { SeoEnforcerUserConfig } from '../src/config.js';
import type { PageContext } from '../src/types.js';
import { extractVisibleText } from '../src/util/dom.js';

/** Build a `PageContext` from an HTML string, exactly like the runner does. */
export function makeContext(
  html: string,
  userConfig: SeoEnforcerUserConfig = {},
  file = 'index.html',
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
<header><nav><a href="/about">About the widgets team</a></nav></header>
<main>
<h1>Widgets</h1>
<h2>Details</h2>
<p>Plenty of real crawlable text content here that is clearly not hidden behind any client side JavaScript whatsoever.</p>
<img src="/w.png" alt="A widget" width="200" height="150">
</main>
<footer>Copyright 2026</footer>
</body>
</html>`;
