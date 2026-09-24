import { createHash } from 'node:crypto';
import type { HTMLElement } from 'node-html-parser';
import { tag, walkElements } from './dom.js';

/** Directive name (lower-case) → source expressions, as written. */
export type CspPolicy = Map<string, string[]>;

/** Directives a page resource is checked against. */
export type CspDirective =
  | 'script-src-elem'
  | 'script-src-attr'
  | 'style-src-elem'
  | 'style-src-attr'
  | 'img-src'
  | 'media-src'
  | 'frame-src';

const FALLBACKS: Record<CspDirective, string[]> = {
  'script-src-elem': ['script-src-elem', 'script-src', 'default-src'],
  'script-src-attr': ['script-src-attr', 'script-src', 'default-src'],
  'style-src-elem': ['style-src-elem', 'style-src', 'default-src'],
  'style-src-attr': ['style-src-attr', 'style-src', 'default-src'],
  'img-src': ['img-src', 'default-src'],
  'media-src': ['media-src', 'default-src'],
  'frame-src': ['frame-src', 'child-src', 'default-src'],
};

/** Something a page loads or runs that a CSP governs. */
export type CspResource =
  | { directive: CspDirective; kind: 'url'; url: string; element: string }
  | { directive: CspDirective; kind: 'inline'; content: string; element: string };

export function parseCsp(value: string): CspPolicy {
  const policy: CspPolicy = new Map();
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    // Browsers ignore a repeated directive, so the first one wins.
    if (name && !policy.has(name.toLowerCase())) policy.set(name.toLowerCase(), sources);
  }
  return policy;
}

export interface CspDecision {
  allowed: boolean;
  /** The directive that decided, e.g. `script-src` for a `script-src-elem` check. */
  directive: string;
}

/**
 * Whether `policy` lets a page served from `pageUrl` load `resource`.
 * Resources that cannot be judged statically (nonces, `'strict-dynamic'`)
 * are treated as allowed.
 */
export function evaluateCsp(policy: CspPolicy, resource: CspResource, pageUrl: URL): CspDecision {
  const directive = FALLBACKS[resource.directive].find((name) => policy.has(name));
  if (!directive) return { allowed: true, directive: resource.directive };
  const sources = policy.get(directive)!;
  const lower = sources.map((source) => source.toLowerCase());

  if (directive.startsWith('script-src') && lower.includes("'strict-dynamic'")) {
    return { allowed: true, directive };
  }

  if (resource.kind === 'inline') {
    return { allowed: allowsInline(sources, resource), directive };
  }

  let url: URL;
  try {
    url = new URL(resource.url, pageUrl);
  } catch {
    return { allowed: true, directive };
  }
  return { allowed: sources.some((source) => matchesSource(source, url, pageUrl)), directive };
}

function allowsInline(sources: string[], resource: CspResource & { kind: 'inline' }): boolean {
  const lower = sources.map((source) => source.toLowerCase());
  const hashes = sources.filter((source) => /^'sha(256|384|512)-/i.test(source));
  const hasNonce = lower.some((source) => source.startsWith("'nonce-"));
  const isAttribute = resource.directive.endsWith('-attr');

  if (hasNonce && !isAttribute) return true;
  // With a hash or nonce present, browsers ignore 'unsafe-inline'.
  if (hashes.length > 0 || hasNonce) {
    if (isAttribute && !lower.includes("'unsafe-hashes'")) return false;
    const wanted = new Set(hashes.map((hash) => hash.slice(1, -1)));
    return ['sha256', 'sha384', 'sha512'].some((algorithm) =>
      wanted.has(cspHash(resource.content, algorithm)),
    );
  }
  return lower.includes("'unsafe-inline'");
}

/** The CSP hash source (without quotes) for inline `content`, e.g. `sha256-…`. */
export function cspHash(content: string, algorithm = 'sha256'): string {
  return `${algorithm}-${createHash(algorithm).update(content, 'utf8').digest('base64')}`;
}

const HOST_SOURCE = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*|(?:\*\.)?[^:/]+)(?::(\d+|\*))?(\/.*)?$/i;
const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };

function matchesSource(source: string, url: URL, pageUrl: URL): boolean {
  const lower = source.toLowerCase();
  if (lower === "'self'") return url.origin === pageUrl.origin;
  if (lower.startsWith("'")) return false;
  if (lower === '*') return /^(https?|wss?):$/.test(url.protocol);
  if (/^[a-z][a-z0-9+.-]*:$/.test(lower)) {
    return url.protocol === lower || (lower === 'http:' && url.protocol === 'https:');
  }

  const match = HOST_SOURCE.exec(lower);
  if (!match) return false;
  const [, scheme, host, port, path] = match;

  if (scheme) {
    const wanted = `${scheme}:`;
    if (url.protocol !== wanted && !(wanted === 'http:' && url.protocol === 'https:')) return false;
  } else if (!/^https?:$/.test(url.protocol)) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (host!.startsWith('*.')) {
    if (!hostname.endsWith(host!.slice(1))) return false;
  } else if (host !== '*' && hostname !== host) {
    return false;
  }

  if (port && port !== '*') {
    if ((url.port || DEFAULT_PORTS[url.protocol]) !== port) return false;
  } else if (!port && url.port && url.port !== DEFAULT_PORTS[url.protocol]) {
    return false;
  }

  if (path && path !== '/') {
    return path.endsWith('/') ? url.pathname.startsWith(path) : url.pathname === path;
  }
  return true;
}

const EXECUTABLE_SCRIPT = /^((text|application)\/(x-)?(java|ecma)script|module)$/i;

/** Every script, stylesheet, image, frame and inline snippet a page ships. */
export function collectCspResources(root: HTMLElement): CspResource[] {
  const resources: CspResource[] = [];
  const addUrl = (directive: CspDirective, url: string | undefined, element: string): void => {
    const trimmed = url?.trim();
    if (trimmed && !/^javascript:/i.test(trimmed)) {
      resources.push({ directive, kind: 'url', url: trimmed, element });
    }
  };

  for (const element of walkElements(root)) {
    const name = tag(element);

    for (const [attribute, value] of Object.entries(element.attributes)) {
      const key = attribute.toLowerCase();
      if (key === 'style' && value.trim()) {
        resources.push({
          directive: 'style-src-attr',
          kind: 'inline',
          content: value,
          element: 'style=""',
        });
      } else if (key.startsWith('on') && value.trim()) {
        resources.push({
          directive: 'script-src-attr',
          kind: 'inline',
          content: value,
          element: `${key}=""`,
        });
      }
    }

    if (name === 'script') {
      const type = element.getAttribute('type')?.trim() ?? '';
      if (type && !EXECUTABLE_SCRIPT.test(type)) continue;
      const src = element.getAttribute('src');
      if (src !== undefined) addUrl('script-src-elem', src, '<script src>');
      else if (element.rawText.trim()) {
        resources.push({
          directive: 'script-src-elem',
          kind: 'inline',
          content: element.rawText,
          element: '<script>',
        });
      }
    } else if (name === 'style') {
      if (element.rawText.trim()) {
        resources.push({
          directive: 'style-src-elem',
          kind: 'inline',
          content: element.rawText,
          element: '<style>',
        });
      }
    } else if (name === 'link') {
      const rel = (element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
      const href = element.getAttribute('href');
      if (rel.includes('stylesheet')) addUrl('style-src-elem', href, '<link rel="stylesheet">');
      else if (rel.includes('modulepreload'))
        addUrl('script-src-elem', href, '<link rel="modulepreload">');
      else if (rel.includes('icon')) addUrl('img-src', href, '<link rel="icon">');
    } else if (
      name === 'img' ||
      (name === 'source' && element.parentNode?.tagName?.toLowerCase() === 'picture')
    ) {
      addUrl('img-src', element.getAttribute('src'), `<${name}>`);
      for (const url of srcsetUrls(element.getAttribute('srcset')))
        addUrl('img-src', url, `<${name} srcset>`);
    } else if (name === 'video' || name === 'audio' || name === 'source' || name === 'track') {
      addUrl('media-src', element.getAttribute('src'), `<${name}>`);
      if (name === 'video') addUrl('img-src', element.getAttribute('poster'), '<video poster>');
    } else if (name === 'iframe') {
      addUrl('frame-src', element.getAttribute('src'), '<iframe>');
    }
  }

  return resources;
}

function srcsetUrls(srcset: string | undefined): string[] {
  if (!srcset) return [];
  return srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
}
