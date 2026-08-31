import { describe, expect, it } from 'vitest';
import { anchorTextRule } from '../src/rules/anchor-text.js';
import { canonicalRule } from '../src/rules/canonical.js';
import { duplicateIdRule } from '../src/rules/duplicate-id.js';
import { headingHierarchyRule } from '../src/rules/heading-hierarchy.js';
import { imageAltRule } from '../src/rules/image-alt.js';
import { jsDependencyRule } from '../src/rules/js-dependency.js';
import { metaDescriptionRule } from '../src/rules/meta-description.js';
import { robotsRule } from '../src/rules/robots.js';
import { semanticHtmlRule } from '../src/rules/semantic-html.js';
import { titleRule } from '../src/rules/title.js';
import { CLEAN_PAGE, makeContext } from './helpers.js';

const rules = (extraHead = '', body = '') =>
  `<!doctype html><html><head>${extraHead}</head><body>${body}</body></html>`;

describe('titleRule', () => {
  it('flags a missing title', () => {
    const found = titleRule(makeContext(rules()));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'title', severity: 'error' });
    expect(found[0]?.message).toContain('Missing or empty');
  });

  it('flags a title that is too short', () => {
    const found = titleRule(makeContext(rules('<title>Too short</title>')));
    expect(found[0]?.message).toContain('too short');
  });

  it('flags a title that is too long', () => {
    const long = 'x'.repeat(80);
    const found = titleRule(makeContext(rules(`<title>${long}</title>`)));
    expect(found[0]?.message).toContain('too long');
  });

  it('accepts a title within range', () => {
    expect(titleRule(makeContext(CLEAN_PAGE))).toEqual([]);
  });

  it('respects custom length limits', () => {
    const ctx = makeContext(rules('<title>Short but allowed now</title>'), {
      rules: { title: { minLength: 5, maxLength: 40 } },
    });
    expect(titleRule(ctx)).toEqual([]);
  });

  it('is a no-op when disabled', () => {
    expect(titleRule(makeContext(rules(), { rules: { title: false } }))).toEqual([]);
  });
});

describe('metaDescriptionRule', () => {
  it('flags a missing description', () => {
    const found = metaDescriptionRule(makeContext(rules()));
    expect(found[0]?.message).toContain('Missing or empty');
  });

  it('flags a description that is too short', () => {
    const found = metaDescriptionRule(
      makeContext(rules('<meta name="description" content="tiny">')),
    );
    expect(found[0]?.message).toContain('too short');
  });

  it('flags a description that is too long', () => {
    const found = metaDescriptionRule(
      makeContext(rules(`<meta name="description" content="${'y'.repeat(200)}">`)),
    );
    expect(found[0]?.message).toContain('too long');
  });

  it('accepts a description within range', () => {
    expect(metaDescriptionRule(makeContext(CLEAN_PAGE))).toEqual([]);
  });
});

describe('headingHierarchyRule', () => {
  it('flags a page without an h1', () => {
    const found = headingHierarchyRule(makeContext(rules('', '<h2>Nope</h2>')));
    expect(found.some((v) => v.message.includes('No <h1>'))).toBe(true);
  });

  it('flags more than one h1', () => {
    const found = headingHierarchyRule(makeContext(rules('', '<h1>A</h1><h1>B</h1>')));
    expect(found.some((v) => v.message.includes('only one <h1>'))).toBe(true);
  });

  it('flags a skipped heading level', () => {
    const found = headingHierarchyRule(makeContext(rules('', '<h1>A</h1><h4>D</h4>')));
    expect(found.some((v) => v.message.includes('jumps from <h1> to <h4>'))).toBe(true);
  });

  it('accepts a well formed outline', () => {
    const found = headingHierarchyRule(
      makeContext(rules('', '<h1>A</h1><h2>B</h2><h3>C</h3><h2>D</h2>')),
    );
    expect(found).toEqual([]);
  });

  it('can require the first heading to be an h1', () => {
    const ctx = makeContext(rules('', '<h2>B</h2><h1>A</h1>'), {
      rules: { headingHierarchy: { requireH1First: true } },
    });
    const found = headingHierarchyRule(ctx);
    expect(found.some((v) => v.message.includes('First heading is <h2>'))).toBe(true);
  });
});

describe('semanticHtmlRule', () => {
  it('flags a div/span-only page', () => {
    const found = semanticHtmlRule(makeContext(rules('', '<div><span>hello</span></div>')));
    expect(found[0]?.message).toContain('expected at least 1');
  });

  it('accepts a page with a <main> landmark', () => {
    expect(semanticHtmlRule(makeContext(rules('', '<main>content</main>')))).toEqual([]);
  });

  it('accepts an ARIA landmark role as an equivalent', () => {
    expect(semanticHtmlRule(makeContext(rules('', '<div role="main">content</div>')))).toEqual([]);
  });

  it('honours a stricter minLandmarks', () => {
    const ctx = makeContext(rules('', '<main>content</main>'), {
      rules: { semanticHtml: { minLandmarks: 2 } },
    });
    expect(semanticHtmlRule(ctx)).toHaveLength(1);
  });
});

describe('imageAltRule', () => {
  it('flags an <img> without alt', () => {
    const found = imageAltRule(makeContext(rules('', '<img src="/a.png">')));
    expect(found[0]).toMatchObject({ rule: 'imageAlt', severity: 'error' });
  });

  it('accepts an empty alt (decorative image)', () => {
    expect(imageAltRule(makeContext(rules('', '<img src="/a.png" alt="">')))).toEqual([]);
  });

  it('reports one violation per offending image', () => {
    const found = imageAltRule(
      makeContext(rules('', '<img src="/a.png"><img src="/b.png" alt="ok"><img src="/c.png">')),
    );
    expect(found).toHaveLength(2);
  });
});

describe('canonicalRule', () => {
  it('flags a missing canonical link', () => {
    expect(canonicalRule(makeContext(rules()))[0]?.message).toContain('Missing');
  });

  it('flags a relative canonical href when requireAbsolute is on', () => {
    const found = canonicalRule(makeContext(rules('<link rel="canonical" href="/page/">')));
    expect(found[0]?.message).toContain('not an absolute');
  });

  it('flags multiple canonical links', () => {
    const html = rules(
      '<link rel="canonical" href="https://a.test/"><link rel="canonical" href="https://b.test/">',
    );
    expect(canonicalRule(makeContext(html))[0]?.message).toContain('exactly one is allowed');
  });

  it('accepts a single absolute canonical', () => {
    expect(
      canonicalRule(makeContext(rules('<link rel="canonical" href="https://a.test/page/">'))),
    ).toEqual([]);
  });

  it('allows relative canonicals when requireAbsolute is off', () => {
    const ctx = makeContext(rules('<link rel="canonical" href="/page/">'), {
      rules: { canonical: { requireAbsolute: false } },
    });
    expect(canonicalRule(ctx)).toEqual([]);
  });
});

describe('anchorTextRule', () => {
  it('flags generic link text', () => {
    const found = anchorTextRule(makeContext(rules('', '<a href="/x">Click here</a>')));
    expect(found[0]).toMatchObject({ rule: 'anchorText', severity: 'warning' });
  });

  it('normalises trailing punctuation before comparing', () => {
    expect(anchorTextRule(makeContext(rules('', '<a href="/x">Read more...</a>')))).toHaveLength(1);
  });

  it('flags links with no accessible name', () => {
    const found = anchorTextRule(makeContext(rules('', '<a href="/x"></a>')));
    expect(found[0]?.message).toContain('no discernible link text');
  });

  it('accepts an empty link that has an aria-label', () => {
    expect(
      anchorTextRule(makeContext(rules('', '<a href="/x" aria-label="Open menu"></a>'))),
    ).toEqual([]);
  });

  it('accepts descriptive link text', () => {
    expect(
      anchorTextRule(makeContext(rules('', '<a href="/x">Read the deployment guide</a>'))),
    ).toEqual([]);
  });
});

describe('jsDependencyRule', () => {
  it('flags a near-empty body', () => {
    const found = jsDependencyRule(makeContext(rules('', '<div id="app"></div>')));
    expect(found[0]).toMatchObject({ rule: 'jsDependency', severity: 'error' });
  });

  it('accepts a body with enough visible text', () => {
    expect(jsDependencyRule(makeContext(CLEAN_PAGE))).toEqual([]);
  });

  it('ignores text inside <script>', () => {
    const html = rules('', `<div>hi</div><script>${'console.log("x");'.repeat(50)}</script>`);
    expect(jsDependencyRule(makeContext(html))).toHaveLength(1);
  });
});

describe('robotsRule', () => {
  it('warns on a noindex directive', () => {
    const found = robotsRule(makeContext(rules('<meta name="robots" content="noindex, follow">')));
    expect(found[0]).toMatchObject({ rule: 'robots', severity: 'warning' });
    expect(found[0]?.message).toContain('noindex');
  });

  it('is silent when no blocking directive is present', () => {
    expect(robotsRule(makeContext(rules('<meta name="robots" content="index, follow">')))).toEqual(
      [],
    );
  });

  it('can be escalated to an error via config', () => {
    const ctx = makeContext(rules('<meta name="robots" content="nofollow">'), {
      rules: { robots: { severity: 'error' } },
    });
    expect(robotsRule(ctx)[0]?.severity).toBe('error');
  });
});

describe('duplicateIdRule', () => {
  it('flags a repeated id', () => {
    const found = duplicateIdRule(makeContext(rules('', '<div id="x"></div><span id="x"></span>')));
    expect(found[0]?.message).toContain('Duplicate id="x"');
  });

  it('accepts unique ids', () => {
    expect(duplicateIdRule(makeContext(rules('', '<div id="a"></div><div id="b"></div>')))).toEqual(
      [],
    );
  });
});
