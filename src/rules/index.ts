import type { Rule } from '../types.js';
import { anchorTextRule } from './anchor-text.js';
import { canonicalRule } from './canonical.js';
import { duplicateIdRule } from './duplicate-id.js';
import { headingHierarchyRule } from './heading-hierarchy.js';
import { imageAltRule } from './image-alt.js';
import { imageSizeRule } from './image-size.js';
import { internalLinksRule } from './internal-links.js';
import { jsDependencyRule } from './js-dependency.js';
import { metaDescriptionRule } from './meta-description.js';
import { robotsRule } from './robots.js';
import { semanticHtmlRule } from './semantic-html.js';
import { structuredDataRule } from './structured-data.js';
import { thinContentRule } from './thin-content.js';
import { titleRule } from './title.js';

/** All per-page rules, executed in this order for every HTML file. */
export const allRules: Rule[] = [
  titleRule,
  metaDescriptionRule,
  headingHierarchyRule,
  semanticHtmlRule,
  imageAltRule,
  imageSizeRule,
  canonicalRule,
  anchorTextRule,
  internalLinksRule,
  jsDependencyRule,
  robotsRule,
  duplicateIdRule,
  thinContentRule,
  structuredDataRule,
];

export {
  anchorTextRule,
  canonicalRule,
  duplicateIdRule,
  headingHierarchyRule,
  imageAltRule,
  imageSizeRule,
  internalLinksRule,
  jsDependencyRule,
  metaDescriptionRule,
  robotsRule,
  semanticHtmlRule,
  structuredDataRule,
  thinContentRule,
  titleRule,
};

// Cross-page checks: run by the runner after every file is parsed, not per page.
export { findDuplicateContent } from './duplicate-content.js';
export type { DuplicateContentPage } from './duplicate-content.js';
export { findDuplicateValues } from './duplicate-values.js';
export type { DuplicateValuesPage, DuplicateValuesSpec } from './duplicate-values.js';
export { findOrphanPages } from './orphan-pages.js';
export type { OrphanPagesInput } from './orphan-pages.js';
export { findSitemapCoverage, extractLocs } from './sitemap-coverage.js';
export type {
  SitemapCoverageInput,
  SitemapCoverageResult,
  SitemapDoc,
} from './sitemap-coverage.js';
