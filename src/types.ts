import type { HTMLElement } from 'node-html-parser';
import type { ResolvedConfig } from './config.js';

/** Severity of a single finding. */
export type Severity = 'error' | 'warning';

/** A single SEO problem detected on a page. */
export interface Violation {
  /** POSIX path of the page relative to the build output directory. */
  file: string;
  /** Identifier of the rule that produced the finding. */
  rule: string;
  /** Whether this finding is blocking (`error`) or advisory (`warning`). */
  severity: Severity;
  /** Human readable description of what is wrong. */
  message: string;
  /** Optional suggestion on how to fix it. */
  hint?: string;
}

/** Everything a rule needs in order to inspect one page. */
export interface PageContext {
  /** POSIX path of the page relative to the build output directory. */
  file: string;
  /** Absolute path of the page on disk. */
  absolutePath: string;
  /** Parsed document root (from `node-html-parser`). */
  root: HTMLElement;
  /** Normalised visible text content of `<body>` (script/style/head stripped). */
  bodyText: string;
  /** Fully resolved configuration. */
  config: ResolvedConfig;
}

/** A rule is a pure function that turns a page into zero or more violations. */
export type Rule = (ctx: PageContext) => Violation[];
