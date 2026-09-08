# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0](https://github.com/SlashGordon/astro-seo-enforcer/compare/v1.3.0...v1.4.0) (2026-09-08)

### Features

- intital commit ([73742e2](https://github.com/SlashGordon/astro-seo-enforcer/commit/73742e2a615eba3d26a46525ce43a273b91596fd))
- **rules:** add duplicateContent rule for near-identical pages ([6c17005](https://github.com/SlashGordon/astro-seo-enforcer/commit/6c170051b969b8751525ebb4f728665ee1c575e6))
- **rules:** add imageSize rule for page-speed optimization ([64ef8d6](https://github.com/SlashGordon/astro-seo-enforcer/commit/64ef8d620bd52ecb7e6b6bd348bb88f3e1506632))

### Bug Fixes

- added some keywords ([4f0f43d](https://github.com/SlashGordon/astro-seo-enforcer/commit/4f0f43dcb9efd71c6b2b6f2dc2f37ee9f821237f))
- imageSize now applies the maxBytes weight check to responsive image ([f925d16](https://github.com/SlashGordon/astro-seo-enforcer/commit/f925d1625b025d4b33549ffb74187ce4549e671d))
- update README.md, src/config.ts, src/index.ts (+4 more) ([055e644](https://github.com/SlashGordon/astro-seo-enforcer/commit/055e64495c2c8f628803ac73f23a15d882c09871))

## [Unreleased]

## [1.3.0] - 2026-09-07

### Added

- `duplicateContent` rule (warning by default) that flags pages whose visible
  text is near-identical to another page's. Similarity is the Jaccard overlap of
  the two pages' five-word runs; a pair at or above `threshold` (default `0.9`)
  is reported on both pages with the percentage. This catches templated listing
  pages and thin tag/location pages that keep distinct titles, which the
  exact-match `title` duplicate check misses. Pages shorter than `minWords`
  (default 200) are ignored, and the comparison is pairwise, so it is skipped
  with a single notice above `maxPages` (default 1500).

## [1.2.0] - 2026-09-07

### Added

- `internalLinks` rule (error by default) that checks every internal `<a href>`
  against the files Astro wrote to the output directory. Links resolve the way a
  static host serves files: `/blog/` and `/blog` both map to `blog/index.html`,
  an extensionless path also tries `<path>.html`, and a path with an extension
  must match a file exactly. With `checkFragments` (on by default), a same-page
  `#section` link must match an `id` or `<a name>` on the page. External links,
  `mailto:` / `tel:`, `href="#"` and query-only links are skipped; use `ignore`
  for paths that only exist at runtime, such as redirects or server routes.

### Changed

- The runner now indexes every file in the build output, static assets as well
  as HTML pages, so rules can resolve link targets. HTML parsing and rule
  execution are otherwise unchanged.

## [1.1.2] - 2026-09-01

### Changed

- Added `performance` and `optimization` keywords so the package is categorised
  under **Performance + SEO** in the Astro integrations directory.
- README: documented `astro add astro-seo-enforcer` for automatic setup
  alongside the existing manual install instructions.

## [1.1.1] - 2026-09-01

### Changed

- `imageSize` now applies the `maxBytes` weight check to responsive image
  candidates too: every URL in an `<img srcset>` and in a `<picture>`
  `<source srcset>`, not just `<img src>`. Each file is still reported at most
  once per page, and the `maxScaleFactor` scale check remains scoped to the
  painted `<img src>`.

## [1.1.0] - 2026-08-31

### Added

- `imageSize` rule (warning by default) that checks the real image files behind
  local `<img src>` for three page-speed problems: files heavier than `maxBytes`
  (default 200 KB), missing `width`/`height` (layout shift / CLS), and images
  served more than `maxScaleFactor`× (default 2×) larger than their displayed
  size. Reads intrinsic dimensions straight from PNG/JPEG/GIF/WebP headers with
  no extra dependencies; skips remote URLs, `data:` URIs and SVGs.

## [1.0.0] - 2026-08-31

First stable release.

### Added

- Astro integration hooking into `astro:build:done` that parses the generated
  static HTML with `node-html-parser` and fails the build on SEO violations.
- Configuration object with `enabled`, `exclude` (prefix / `*` / `**` glob /
  `RegExp`), `failOn` (`error` | `warning` | `never`) and per-rule options, plus
  the `defineSeoEnforcerConfig` helper.
- Rules:
  - `title` — presence + 30–60 char length, plus cross-page duplicate detection.
  - `metaDescription` — presence + 50–160 char length.
  - `headingHierarchy` — exactly one `<h1>`, no skipped levels, optional
    "first heading must be `<h1>`".
  - `semanticHtml` — requires structural landmark tags (or ARIA-role
    equivalents) instead of `<div>`/`<span>` only.
  - `imageAlt` — every `<img>` must have an `alt` attribute.
  - `canonical` — exactly one `<link rel="canonical">` with a valid, absolute
    `href`.
  - `anchorText` — flags generic link text ("click here", "read more", …) and
    links with no accessible name.
  - `jsDependency` — flags pages whose `<body>` has almost no static text.
  - `robots` — warns on `noindex` / `nofollow` directives.
  - `duplicateId` — flags repeated `id` attribute values.
- Grouped, colourised console report (respects `NO_COLOR` / `FORCE_COLOR` / TTY).
- Non-zero exit code (`process.exitCode = 1`) plus a thrown `SeoEnforcerError`
  when the `failOn` threshold is reached.
- Exported internals for programmatic use: `runSeoChecks`, `resolveConfig`,
  `formatReport`, `defineSeoEnforcerConfig`, `SeoEnforcerError` and their types.
- Unit test suite (Vitest) covering config resolution, the `exclude` matcher,
  every rule, the reporter and the end-to-end runner / integration hook.
- `demo/` end-to-end Astro site that wires the integration in via `file:..` and
  is built in CI as an integration test.
- Prettier setup with `format` / `format:check` scripts.

### Compatibility

- Astro `^3 || ^4 || ^5 || ^6 || ^7`.
- Node.js `>= 18.14.1`.

[Unreleased]: https://github.com/SlashGordon/astro-seo-enforcer/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/SlashGordon/astro-seo-enforcer/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/SlashGordon/astro-seo-enforcer/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/SlashGordon/astro-seo-enforcer/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/SlashGordon/astro-seo-enforcer/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/SlashGordon/astro-seo-enforcer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/SlashGordon/astro-seo-enforcer/releases/tag/v1.0.0
