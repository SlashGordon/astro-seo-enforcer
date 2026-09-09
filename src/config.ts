import type { Severity } from './types.js';

/* -------------------------------------------------------------------------- */
/*  Per-rule option shapes                                                     */
/* -------------------------------------------------------------------------- */

export interface TitleRuleOptions {
  /** Minimum length of the `<title>` text, inclusive. */
  minLength: number;
  /** Maximum length of the `<title>` text, inclusive. */
  maxLength: number;
  /** Fail the build when the same `<title>` is used on more than one page. */
  checkDuplicates: boolean;
}

export interface MetaDescriptionRuleOptions {
  /** Minimum length of the meta description, inclusive. */
  minLength: number;
  /** Maximum length of the meta description, inclusive. */
  maxLength: number;
  /**
   * Warn when the same meta description is used on more than one page —
   * templated pages that forget to vary it are a common programmatic-SEO slip.
   */
  checkDuplicates: boolean;
}

export interface HeadingHierarchyRuleOptions {
  /** Require exactly one `<h1>` element per page. */
  requireSingleH1: boolean;
  /** Fail when a heading is more than one level deeper than the previous heading. */
  enforceNoSkips: boolean;
  /** Require the first heading in the document to be an `<h1>`. */
  requireH1First: boolean;
  /**
   * Warn when the same `<h1>` text appears on more than one page. Duplicate
   * headings across a page set are a keyword-cannibalisation signal.
   */
  checkDuplicateH1: boolean;
}

export interface ThinContentRuleOptions {
  /** Severity emitted for every finding this rule produces. */
  severity: Severity;
  /** Minimum number of words expected in the page's main content. */
  minWords: number;
  /**
   * Count words inside the first `<main>` / `<article>` / `role="main"` region
   * instead of the whole `<body>`, so shared chrome does not mask thin pages.
   * Pages with no such region fall back to `<body>`.
   */
  scopeToMain: boolean;
}

export interface StructuredDataRuleOptions {
  /** Severity emitted for every finding this rule produces. */
  severity: Severity;
  /** Flag pages that ship no `<script type="application/ld+json">` at all. */
  require: boolean;
  /** `@type` values that must appear in the page's JSON-LD (e.g. `BreadcrumbList`). */
  requireTypes: string[];
}

export interface OrphanPagesRuleOptions {
  /** Severity emitted for every finding this rule produces. */
  severity: Severity;
  /** Pages that are reachable by definition and never counted as orphans. */
  entryPoints: string[];
  /** Dist-relative paths / prefixes / `RegExp`s to skip. */
  ignore: Array<string | RegExp>;
}

export interface SitemapCoverageRuleOptions {
  /** Severity emitted for every finding this rule produces. */
  severity: Severity;
  /** Also require that every indexable page appears in a sitemap. */
  requireInSitemap: boolean;
  /** Dist-relative paths / prefixes / `RegExp`s to exempt from `requireInSitemap`. */
  ignore: Array<string | RegExp>;
}

export interface SemanticHtmlRuleOptions {
  /** Tags that are treated as structural landmarks. */
  landmarkTags: string[];
  /** Minimum number of distinct landmark tags that must be present. */
  minLandmarks: number;
}

export interface AnchorTextRuleOptions {
  /** Lower-cased, punctuation-trimmed anchor texts considered non-descriptive. */
  bannedPhrases: string[];
}

export interface JsDependencyRuleOptions {
  /** Minimum number of visible text characters expected inside `<body>`. */
  minTextLength: number;
}

export interface CanonicalRuleOptions {
  /** Require the canonical `href` to be an absolute http(s) URL. */
  requireAbsolute: boolean;
}

export interface RobotsRuleOptions {
  /** Severity emitted when a blocking directive is found. */
  severity: Severity;
  /** Directives (looked up in the `content` attribute) that trigger the rule. */
  directives: string[];
}

export interface InternalLinksRuleOptions {
  /** Severity emitted for a link to a page or asset that is not in the build. */
  severity: Severity;
  /**
   * Also verify that a same-page `#fragment` link points at an element with a
   * matching `id` (or `<a name>`) in the current document. Cross-page fragments
   * are not resolved — only the target page's existence is checked.
   */
  checkFragments: boolean;
  /**
   * Severity for a broken `#fragment` finding. Defaults to `warning` because
   * anchors rendered by client-side JavaScript are absent from the built HTML,
   * so a failed check does not always mean a broken link.
   */
  fragmentSeverity: Severity;
  /**
   * Raw `href` values to skip: a plain string matches exactly, a `RegExp` is
   * tested against the attribute value. Useful for links resolved at runtime
   * (redirects, server routes) that do not exist as files in the build output.
   */
  ignore: Array<string | RegExp>;
}

export interface DuplicateContentRuleOptions {
  /** Severity emitted for every finding this rule produces. */
  severity: Severity;
  /**
   * Minimum text similarity (`0` to `1`) between two pages before they are
   * reported. `0.9` means the pages share at least ~90% of their five-word runs.
   */
  threshold: number;
  /**
   * Also flag any page whose share of five-word runs unique to it (present on no
   * other page) is below this. Catches many-way templating that no single pair
   * trips `threshold` on. `0` disables the pass.
   */
  minUniqueRatio: number;
  /**
   * Compare the first `<main>` / `<article>` / `role="main"` region instead of
   * the whole `<body>`, so shared nav and footer text is out of the comparison.
   * Pages with no such region fall back to `<body>`.
   */
  scopeToMain: boolean;
  /**
   * Ignore pages with fewer than this many words. Short pages overlap on shared
   * nav and footer text alone, which is not a real content problem.
   */
  minWords: number;
  /**
   * Skip the whole check when more than this many pages qualify. Every pair of
   * pages is compared, so the cost grows with the square of the page count.
   */
  maxPages: number;
}

export interface ImageSizeRuleOptions {
  /** Severity emitted for every finding this rule produces. */
  severity: Severity;
  /** Maximum weight of a single local image, in bytes, before it is flagged. */
  maxBytes: number;
  /**
   * Require every `<img>` to declare intrinsic `width` and `height` (either as
   * attributes or inline `style`). Missing dimensions cause layout shift (CLS),
   * a Core Web Vitals metric.
   */
  requireDimensions: boolean;
  /**
   * Flag an image whose intrinsic pixel dimensions exceed its displayed size by
   * more than this factor. `2` allows serving 2× assets for high-DPI screens.
   * Set to `0` to disable the scale check.
   */
  maxScaleFactor: number;
  /** File extensions (lower-case, no dot) treated as raster images to inspect. */
  extensions: string[];
}

/* -------------------------------------------------------------------------- */
/*  Public configuration                                                       */
/* -------------------------------------------------------------------------- */

export interface RulesConfig {
  title: boolean | Partial<TitleRuleOptions>;
  metaDescription: boolean | Partial<MetaDescriptionRuleOptions>;
  headingHierarchy: boolean | Partial<HeadingHierarchyRuleOptions>;
  semanticHtml: boolean | Partial<SemanticHtmlRuleOptions>;
  imageAlt: boolean;
  canonical: boolean | Partial<CanonicalRuleOptions>;
  anchorText: boolean | Partial<AnchorTextRuleOptions>;
  jsDependency: boolean | Partial<JsDependencyRuleOptions>;
  robots: boolean | Partial<RobotsRuleOptions>;
  duplicateId: boolean;
  imageSize: boolean | Partial<ImageSizeRuleOptions>;
  internalLinks: boolean | Partial<InternalLinksRuleOptions>;
  duplicateContent: boolean | Partial<DuplicateContentRuleOptions>;
  thinContent: boolean | Partial<ThinContentRuleOptions>;
  structuredData: boolean | Partial<StructuredDataRuleOptions>;
  orphanPages: boolean | Partial<OrphanPagesRuleOptions>;
  sitemapCoverage: boolean | Partial<SitemapCoverageRuleOptions>;
}

export interface SeoEnforcerUserConfig {
  /** Master switch. Set to `false` to disable the integration entirely. */
  enabled?: boolean;
  /**
   * Patterns (POSIX, relative to the build output directory) that must be skipped.
   * Accepts plain path prefixes, `*` / `**` globs and `RegExp` instances.
   */
  exclude?: Array<string | RegExp>;
  /**
   * Which severity breaks the build:
   * - `"error"`   only errors fail the build (default)
   * - `"warning"` warnings fail the build as well
   * - `"never"`   never fail the build, only print the report
   */
  failOn?: 'error' | 'warning' | 'never';
  /** Per-rule configuration. Set a rule to `false` to disable it. */
  rules?: Partial<RulesConfig>;
}

/* -------------------------------------------------------------------------- */
/*  Resolved configuration (internal)                                          */
/* -------------------------------------------------------------------------- */

export interface ResolvedConfig {
  enabled: boolean;
  exclude: Array<string | RegExp>;
  failOn: 'error' | 'warning' | 'never';
  rules: {
    title: false | TitleRuleOptions;
    metaDescription: false | MetaDescriptionRuleOptions;
    headingHierarchy: false | HeadingHierarchyRuleOptions;
    semanticHtml: false | SemanticHtmlRuleOptions;
    imageAlt: boolean;
    canonical: false | CanonicalRuleOptions;
    anchorText: false | AnchorTextRuleOptions;
    jsDependency: false | JsDependencyRuleOptions;
    robots: false | RobotsRuleOptions;
    duplicateId: boolean;
    imageSize: false | ImageSizeRuleOptions;
    internalLinks: false | InternalLinksRuleOptions;
    duplicateContent: false | DuplicateContentRuleOptions;
    thinContent: false | ThinContentRuleOptions;
    structuredData: false | StructuredDataRuleOptions;
    orphanPages: false | OrphanPagesRuleOptions;
    sitemapCoverage: false | SitemapCoverageRuleOptions;
  };
}

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                   */
/* -------------------------------------------------------------------------- */

export const DEFAULT_TITLE: TitleRuleOptions = {
  minLength: 30,
  maxLength: 60,
  checkDuplicates: true,
};

export const DEFAULT_META_DESCRIPTION: MetaDescriptionRuleOptions = {
  minLength: 50,
  maxLength: 160,
  checkDuplicates: true,
};

export const DEFAULT_HEADING_HIERARCHY: HeadingHierarchyRuleOptions = {
  requireSingleH1: true,
  enforceNoSkips: true,
  requireH1First: false,
  checkDuplicateH1: true,
};

export const DEFAULT_THIN_CONTENT: ThinContentRuleOptions = {
  severity: 'warning',
  minWords: 250,
  scopeToMain: true,
};

export const DEFAULT_STRUCTURED_DATA: StructuredDataRuleOptions = {
  severity: 'warning',
  // Validate any JSON-LD that is present, but do not nag pages that ship none.
  require: false,
  requireTypes: [],
};

export const DEFAULT_ORPHAN_PAGES: OrphanPagesRuleOptions = {
  severity: 'warning',
  entryPoints: ['index.html'],
  ignore: [],
};

export const DEFAULT_SITEMAP_COVERAGE: SitemapCoverageRuleOptions = {
  severity: 'warning',
  requireInSitemap: true,
  ignore: [],
};

export const DEFAULT_SEMANTIC_HTML: SemanticHtmlRuleOptions = {
  landmarkTags: ['main', 'header', 'nav', 'footer', 'article', 'section', 'aside'],
  minLandmarks: 1,
};

export const DEFAULT_ANCHOR_TEXT: AnchorTextRuleOptions = {
  bannedPhrases: [
    'click here',
    'read more',
    'more',
    'link',
    'here',
    'learn more',
    'continue',
    'this page',
  ],
};

export const DEFAULT_JS_DEPENDENCY: JsDependencyRuleOptions = {
  minTextLength: 50,
};

export const DEFAULT_CANONICAL: CanonicalRuleOptions = {
  requireAbsolute: true,
};

export const DEFAULT_ROBOTS: RobotsRuleOptions = {
  severity: 'warning',
  directives: ['noindex', 'nofollow'],
};

export const DEFAULT_INTERNAL_LINKS: InternalLinksRuleOptions = {
  severity: 'error',
  checkFragments: true,
  fragmentSeverity: 'warning',
  ignore: [],
};

export const DEFAULT_DUPLICATE_CONTENT: DuplicateContentRuleOptions = {
  severity: 'warning',
  threshold: 0.9,
  minUniqueRatio: 0.2,
  scopeToMain: true,
  minWords: 200,
  maxPages: 1500,
};

export const DEFAULT_IMAGE_SIZE: ImageSizeRuleOptions = {
  severity: 'warning',
  // ~200 KB. Above this a single image starts to noticeably hurt LCP / load time.
  maxBytes: 200 * 1024,
  requireDimensions: true,
  maxScaleFactor: 2,
  extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
};

/* -------------------------------------------------------------------------- */
/*  Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Merge a single user-supplied rule value with its defaults.
 * - `false`                -> rule disabled
 * - `true` / `undefined`   -> rule enabled with defaults
 * - object                 -> rule enabled with defaults overridden by the object
 */
function resolveRule<T extends object>(
  value: boolean | Partial<T> | undefined,
  defaults: T,
): false | T {
  if (value === false) return false;
  if (value === undefined || value === true) return { ...defaults };
  return { ...defaults, ...value };
}

/** Merge a user configuration with the built-in defaults. */
export function resolveConfig(userConfig: SeoEnforcerUserConfig = {}): ResolvedConfig {
  const rules = userConfig.rules ?? {};

  return {
    enabled: userConfig.enabled ?? true,
    // The 404 page rarely has a canonical URL or a "real" description, so skip it by default.
    exclude: userConfig.exclude ?? ['404.html'],
    failOn: userConfig.failOn ?? 'error',
    rules: {
      title: resolveRule(rules.title, DEFAULT_TITLE),
      metaDescription: resolveRule(rules.metaDescription, DEFAULT_META_DESCRIPTION),
      headingHierarchy: resolveRule(rules.headingHierarchy, DEFAULT_HEADING_HIERARCHY),
      semanticHtml: resolveRule(rules.semanticHtml, DEFAULT_SEMANTIC_HTML),
      imageAlt: rules.imageAlt !== false,
      canonical: resolveRule(rules.canonical, DEFAULT_CANONICAL),
      anchorText: resolveRule(rules.anchorText, DEFAULT_ANCHOR_TEXT),
      jsDependency: resolveRule(rules.jsDependency, DEFAULT_JS_DEPENDENCY),
      robots: resolveRule(rules.robots, DEFAULT_ROBOTS),
      duplicateId: rules.duplicateId !== false,
      imageSize: resolveRule(rules.imageSize, DEFAULT_IMAGE_SIZE),
      internalLinks: resolveRule(rules.internalLinks, DEFAULT_INTERNAL_LINKS),
      duplicateContent: resolveRule(rules.duplicateContent, DEFAULT_DUPLICATE_CONTENT),
      thinContent: resolveRule(rules.thinContent, DEFAULT_THIN_CONTENT),
      structuredData: resolveRule(rules.structuredData, DEFAULT_STRUCTURED_DATA),
      orphanPages: resolveRule(rules.orphanPages, DEFAULT_ORPHAN_PAGES),
      sitemapCoverage: resolveRule(rules.sitemapCoverage, DEFAULT_SITEMAP_COVERAGE),
    },
  };
}

/** Identity helper that provides editor autocompletion for the config object. */
export function defineSeoEnforcerConfig(config: SeoEnforcerUserConfig): SeoEnforcerUserConfig {
  return config;
}
