import type { Rule } from '../types.js';
import { anchorTextRule } from './anchor-text.js';
import { canonicalRule } from './canonical.js';
import { duplicateIdRule } from './duplicate-id.js';
import { headingHierarchyRule } from './heading-hierarchy.js';
import { imageAltRule } from './image-alt.js';
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
  canonicalRule,
  anchorTextRule,
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
  jsDependencyRule,
  metaDescriptionRule,
  robotsRule,
  semanticHtmlRule,
  titleRule,
};
