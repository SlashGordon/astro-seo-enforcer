# astro-seo-enforcer

[![Release](https://github.com/SlashGordon/astro-seo-enforcer/actions/workflows/release.yml/badge.svg)](https://github.com/SlashGordon/astro-seo-enforcer/actions/workflows/release.yml)

[![CI](https://github.com/SlashGordon/astro-seo-enforcer/actions/workflows/ci.yml/badge.svg)](https://github.com/SlashGordon/astro-seo-enforcer/actions/workflows/ci.yml)

> An Astro integration that parses your **final, generated static HTML** and **fails the build** when it detects SEO violations.

`astro-seo-enforcer` hooks into `astro:build:done`, walks the output directory,
parses every `.html` file with [`node-html-parser`](https://github.com/taoqf/node-html-parser)
and runs a set of configurable SEO rules. If anything is wrong it prints a
readable report and exits with a non-zero code so your CI/CD pipeline fails.

- ✅ Runs on the real HTML shipped to users — not on your source `.astro` files.
- ✅ Zero config to start, fully configurable when you need it.
- ✅ Fast: lightweight parser, single pass per file.
- ✅ CI friendly: non-zero exit code + grouped, colourised report.

---

## Installation

### Automatic setup

```bash
npx astro add astro-seo-enforcer
# or
pnpm astro add astro-seo-enforcer
# or
yarn astro add astro-seo-enforcer
```

This installs the package and adds it to the `integrations` array in your
`astro.config.*` for you. Then jump to [Configuration](#configuration).

### Manual setup

```bash
npm install -D astro-seo-enforcer
# or
pnpm add -D astro-seo-enforcer
# or
yarn add -D astro-seo-enforcer
```

Add it to your `astro.config.*`:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import seoEnforcer from 'astro-seo-enforcer';

export default defineConfig({
  // `site` is strongly recommended so Astro can emit absolute canonical URLs.
  site: 'https://example.com',
  integrations: [seoEnforcer()],
});
```

That's it. Run `astro build` and the checks execute automatically once the static
files have been written.

> **Note:** the integration only does something during `astro build`. It is a
> no-op during `astro dev`.

---

## Example output

```
astro-seo-enforcer — SEO violation report
────────────────────────────────────────────────────────────────

about/index.html  (2 error(s), 0 warning(s))
  ✖ error   [title] <title> is too short: 12 chars (min 30) — "About page".
  ✖ error   [canonical] Missing <link rel="canonical" href="…">.
             ↳ Emit a canonical link in your <head> (e.g. using Astro.url and the `site` config).

blog/hello/index.html  (0 error(s), 1 warning(s))
  ⚠ warning [anchorText] Non-descriptive link text "read more" (href="/blog/hello/full").
             ↳ Use link text that still makes sense out of context, e.g. "Read the setup guide".

────────────────────────────────────────────────────────────────
14 page(s) scanned  ·  2 error(s)  ·  1 warning(s)
```

With the default `failOn: "error"` this build exits with code `1`.

---

## Configuration

Everything is optional. Pass a config object to `seoEnforcer()`:

```js
import seoEnforcer from 'astro-seo-enforcer';

seoEnforcer({
  enabled: true,
  failOn: 'error', // 'error' | 'warning' | 'never'
  exclude: [
    '404.html', // exact file (this one is excluded by default)
    'drafts/**', // glob: everything under /drafts
    '**/*.amp.html', // glob across segments
    /^private\//, // RegExp against the POSIX relative path
  ],
  rules: {
    title: { minLength: 30, maxLength: 65, checkDuplicates: true },
    metaDescription: { minLength: 70, maxLength: 160 },
    headingHierarchy: { requireSingleH1: true, enforceNoSkips: true, requireH1First: true },
    semanticHtml: { landmarkTags: ['main', 'header', 'footer'], minLandmarks: 2 },
    imageAlt: true,
    canonical: { requireAbsolute: true },
    anchorText: { bannedPhrases: ['click here', 'read more', 'more', 'link', 'here'] },
    jsDependency: { minTextLength: 120 },
    robots: { severity: 'warning', directives: ['noindex', 'nofollow'] },
    duplicateId: true,
    imageSize: {
      severity: 'warning',
      maxBytes: 204800, // 200 KB
      requireDimensions: true,
      maxScaleFactor: 2,
    },
  },
});
```

For editor autocompletion you can use the `defineSeoEnforcerConfig` helper:

```js
import seoEnforcer, { defineSeoEnforcerConfig } from 'astro-seo-enforcer';

const seoConfig = defineSeoEnforcerConfig({
  rules: { title: { maxLength: 65 } },
});

export default defineConfig({
  integrations: [seoEnforcer(seoConfig)],
});
```

### Top-level options

| Option    | Type                              | Default        | Description                                                            |
| --------- | --------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `enabled` | `boolean`                         | `true`         | Master switch. `false` disables the integration completely.            |
| `exclude` | `Array<string \| RegExp>`         | `['404.html']` | Paths to skip. Supports plain prefixes, `*` / `**` globs and `RegExp`. |
| `failOn`  | `'error' \| 'warning' \| 'never'` | `'error'`      | Which severity breaks the build. `'never'` only prints the report.     |
| `rules`   | `object`                          | see below      | Per-rule configuration. Set any rule to `false` to disable it.         |

`exclude` patterns are matched against the **POSIX path relative to the build
output directory** (e.g. `blog/hello/index.html`).

### Rules

Set a rule to `false` to disable it, `true` to enable it with defaults, or pass
an object to override individual options.

| Rule               | Default severity | What it checks                                                                                                                                                                                                                      |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`            | error            | `<title>` exists and is `minLength`–`maxLength` chars. With `checkDuplicates`, the same title on two pages fails the build.                                                                                                         |
| `metaDescription`  | error            | `<meta name="description">` exists and is `minLength`–`maxLength` chars.                                                                                                                                                            |
| `headingHierarchy` | error            | Exactly one `<h1>` (`requireSingleH1`); no skipped levels such as `h2` → `h4` (`enforceNoSkips`); optional `requireH1First`.                                                                                                        |
| `semanticHtml`     | error            | At least `minLandmarks` distinct landmark tags from `landmarkTags` (or their ARIA-role equivalents) are present.                                                                                                                    |
| `imageAlt`         | error            | Every `<img>` has an `alt` attribute (`alt=""` is allowed for decorative images; a missing attribute is not).                                                                                                                       |
| `canonical`        | error            | Exactly one `<link rel="canonical">` with a non-empty `href`. With `requireAbsolute`, the href must be an absolute http(s) URL.                                                                                                     |
| `anchorText`       | warning          | `<a>` elements do not use generic text from `bannedPhrases`, and links are not left without any accessible name.                                                                                                                    |
| `jsDependency`     | error            | `<body>` contains at least `minTextLength` characters of visible text (a near-empty body suggests client-only rendering).                                                                                                           |
| `robots`           | warning          | Warns (configurable via `severity`) when `<meta name="robots">` / `googlebot` contains one of `directives` (`noindex` / `nofollow`).                                                                                                |
| `duplicateId`      | error            | No `id` attribute value is used more than once in a document.                                                                                                                                                                       |
| `imageSize`        | warning          | Local images are not heavier than `maxBytes` — checked for `<img src>` and for every `<img srcset>` / `<picture>` `<source srcset>` — declare `width`/`height` (`requireDimensions`, prevents CLS). Page speed is a ranking signal. |

#### Rule option reference

```ts
interface TitleRuleOptions {
  minLength: number; // default 30
  maxLength: number; // default 60
  checkDuplicates: boolean; // default true
}

interface MetaDescriptionRuleOptions {
  minLength: number; // default 50
  maxLength: number; // default 160
}

interface HeadingHierarchyRuleOptions {
  requireSingleH1: boolean; // default true
  enforceNoSkips: boolean; // default true
  requireH1First: boolean; // default false
}

interface SemanticHtmlRuleOptions {
  landmarkTags: string[]; // default ['main','header','nav','footer','article','section','aside']
  minLandmarks: number; // default 1
}

interface AnchorTextRuleOptions {
  bannedPhrases: string[]; // default ['click here','read more','more','link','here','learn more','continue','this page']
}

interface JsDependencyRuleOptions {
  minTextLength: number; // default 50
}

interface CanonicalRuleOptions {
  requireAbsolute: boolean; // default true
}

interface RobotsRuleOptions {
  severity: 'error' | 'warning'; // default 'warning'
  directives: string[]; // default ['noindex','nofollow']
}

interface ImageSizeRuleOptions {
  severity: 'error' | 'warning'; // default 'warning'
  maxBytes: number; // default 204800 (200 KB)
  requireDimensions: boolean; // default true
  maxScaleFactor: number; // default 2 (0 disables the scale check)
  extensions: string[]; // default ['png','jpg','jpeg','gif','webp']
}
```

> **Note:** `imageSize` reads the referenced files from the build output on disk.
> It only inspects local raster images — remote URLs (`http(s)://`, `//host/…`),
> inline `data:` URIs and vector `.svg` files are skipped. The `maxBytes` weight
> check covers every file the browser might download: `<img src>` plus every URL
> in an `<img srcset>` or a `<picture>` `<source srcset>`. The scale check looks
> only at the painted `<img src>` (responsive `srcset` candidates are meant to
> vary in size) and reads intrinsic dimensions straight from the image header (no
> pixel decoding), so it stays fast even on large sites.

---

## Recipes

### Only warn locally, fail in CI

```js
seoEnforcer({
  failOn: process.env.CI ? 'error' : 'never',
});
```

### A staging site that is intentionally `noindex`

```js
seoEnforcer({
  rules: { robots: false }, // or move `robots` to `severity: 'warning'` and ignore it
});
```

### Turn generic link text into a hard failure

`anchorText` is a warning by default. To make it break the build, keep it as a
warning and set `failOn: 'warning'`, or simply be stricter about your content —
the rule severity itself is fixed to keep the "errors vs. warnings" split
predictable.

---

## How it works

1. Astro finishes writing the static site.
2. The `astro:build:done` hook receives the output directory (`dir`).
3. `astro-seo-enforcer` recursively collects every `*.html` file, skipping
   anything matched by `exclude`.
4. Each file is read and parsed once with `node-html-parser`.
5. All enabled rules run against the parsed document; titles are also recorded
   globally for the cross-page duplicate check.
6. A grouped report is printed to `stderr`.
7. If the configured `failOn` threshold is reached, the integration sets
   `process.exitCode = 1` **and** throws, so `astro build` fails.

---

## Programmatic use

The internals are exported if you want to run the checks yourself (tests, custom
tooling, a standalone script):

```ts
import { runSeoChecks, resolveConfig, formatReport } from 'astro-seo-enforcer';

const config = resolveConfig({ rules: { robots: false } });
const result = await runSeoChecks({ distPath: './dist', config });

console.log(formatReport(result.violations, result));
if (result.errorCount > 0) process.exit(1);
```

---

## Development

```bash
npm install
npm test              # run the Vitest suite once
npm run test:watch
npm run build         # emit dist/
npm run typecheck
npm run format:check  # Prettier

# End-to-end: build a real Astro site with the integration wired in via file:..
npm install --prefix demo
npm run build --prefix demo
```

The [`demo/`](./demo) directory is a minimal Astro site whose pages are written
to satisfy the default rule set, so `npm run build --prefix demo` succeeds and
acts as an integration test. Break one of its pages and the build fails.

---

## Requirements

- Node.js `>= 18.14.1`
- Astro `>= 3` (tested against Astro 3–7)
- A static build (`output: 'static'`, the default). For hybrid/SSR builds only
  the pre-rendered pages present in the output directory are checked.

---

## License

MIT © SlashGordon

## Support

If this integration saves you time, consider buying me a coffee — it keeps the
maintenance going.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-SlashGordon-FFDD00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/SlashGordon)
