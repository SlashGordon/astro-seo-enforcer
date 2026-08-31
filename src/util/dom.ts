import { NodeType } from 'node-html-parser';
import type { HTMLElement, TextNode } from 'node-html-parser';

/**
 * Depth-first, document-order iteration over every element descendant of `root`.
 *
 * `node-html-parser` only supports a subset of CSS selectors, so several rules
 * rely on this walker instead of `querySelectorAll('*')`.
 */
export function* walkElements(root: HTMLElement): Generator<HTMLElement> {
  const stack: HTMLElement[] = [];
  pushElementChildren(stack, root);

  while (stack.length > 0) {
    // `stack` is populated in reverse so `pop()` yields document order.
    const element = stack.pop() as HTMLElement;
    yield element;
    pushElementChildren(stack, element);
  }
}

function pushElementChildren(stack: HTMLElement[], parent: HTMLElement): void {
  const children = parent.childNodes;
  for (let i = children.length - 1; i >= 0; i--) {
    const node = children[i];
    if (node && node.nodeType === NodeType.ELEMENT_NODE) {
      stack.push(node as HTMLElement);
    }
  }
}

/** Lower-cased tag name of an element (empty string for the document root). */
export function tag(element: HTMLElement): string {
  return (element.tagName ?? '').toLowerCase();
}

/** Collapse whitespace and trim; optionally cut the string to `max` characters. */
export function truncate(input: string, max: number): string {
  const clean = input.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 1))}…` : clean;
}

/** Render a short, readable representation of an element for error messages. */
export function describeEl(element: HTMLElement, maxAttrs = 4): string {
  const name = tag(element) || 'node';
  const entries = Object.entries(element.attributes ?? {});
  const shown = entries
    .slice(0, maxAttrs)
    .map(([key, value]) => (value === '' ? key : `${key}="${truncate(String(value), 50)}"`));
  const overflow = entries.length > maxAttrs ? ' …' : '';
  return `<${name}${shown.length > 0 ? ` ${shown.join(' ')}` : ''}${overflow}>`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Minimal HTML entity decoder — enough for length/emptiness heuristics. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    const key = code.toLowerCase();
    if (key in NAMED_ENTITIES) return NAMED_ENTITIES[key] as string;
    if (key.startsWith('#')) {
      const codePoint = key.startsWith('#x')
        ? parseInt(key.slice(2), 16)
        : parseInt(key.slice(1), 10);
      if (Number.isFinite(codePoint) && codePoint > 0) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
    }
    return match;
  });
}

// Tags whose text content is never visible to a reader / crawler.
const NON_VISIBLE_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'head',
  'title',
]);

/**
 * Extract the visible text of `<body>` (or the whole document if there is no
 * body), with scripts, styles and other non-visible content removed.
 */
export function extractVisibleText(root: HTMLElement): string {
  const body = root.querySelector('body') ?? root;
  let buffer = '';

  const visit = (element: HTMLElement): void => {
    for (const child of element.childNodes) {
      if (child.nodeType === NodeType.TEXT_NODE) {
        buffer += ` ${(child as TextNode).rawText}`;
      } else if (child.nodeType === NodeType.ELEMENT_NODE) {
        const childElement = child as HTMLElement;
        if (NON_VISIBLE_TAGS.has((childElement.tagName ?? '').toLowerCase())) continue;
        visit(childElement);
      }
    }
  };

  visit(body);
  return decodeEntities(buffer).replace(/\s+/g, ' ').trim();
}
