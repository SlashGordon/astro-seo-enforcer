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
  titleRule,
};

// Cross-page check: run by the runner after every file is parsed, not per page.
export { findDuplicateContent } from './duplicate-content.js';
export type { DuplicateContentPage } from './duplicate-content.js';
