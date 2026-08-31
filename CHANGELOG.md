# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Unit test suite (Vitest) covering config resolution, the `exclude` matcher,
  every rule, the reporter and the end-to-end runner / integration hook.
- `demo/` end-to-end Astro site that wires the integration in via `file:..` and
  is built in CI as an integration test.
- Prettier setup with `format` / `format:check` scripts.

### Changed

- Widened the `astro` peer dependency range to `^3 || ^4 || ^5 || ^6 || ^7`.

## [0.1.0] - 2026-08-31

### Added

- Initial release.
- Astro integration hooking into `astro:build:done` that parses the generated
  static HTML with `node-html-parser` and fails the build on SEO violations.
- Configuration object with `enabled`, `exclude` (prefix / `*` / `**` glob /
  `RegExp`), `failOn` (`error` | `warning` | `never`) and per-rule options.
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

[Unreleased]: https://github.com/christophdieck/astro-seo-enforcer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/christophdieck/astro-seo-enforcer/releases/tag/v0.1.0
