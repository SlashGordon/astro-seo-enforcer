import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import seoEnforcer from 'astro-seo-enforcer';

// `site` is required so the layout can emit absolute canonical URLs,
// which the `canonical` rule checks for.
export default defineConfig({
  site: 'https://astro-seo-enforcer.example.com',
  integrations: [
    // Emits sitemap-index.xml / sitemap-0.xml before seoEnforcer's
    // astro:build:done hook runs, so `sitemapCoverage` has something to check.
    sitemap(),
    seoEnforcer({
      // Fail the build on anything, so a regression in the demo pages
      // (or in the integration itself) turns the CI job red.
      failOn: 'warning',
    }),
  ],
});
