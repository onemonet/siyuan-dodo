# Dodo custom-view UI resources

Browser-ready resources for HTML authored inside SiYuan Agent. Vite copies this
public directory to `dist/vendor/custom-view/`; plugin code does not inject or
load either library automatically. Each HTML app references its chosen local
library. The Agent's `reference(basecoat|web-awesome)` supplies examples.

- Basecoat 1.1.0: standalone default/Vega CSS, all JS and a small selection of
  individual minified JS components. Upstream files are unmodified.
- Web Awesome 3.14.0: free `dist-cdn` browser JS (components, shared chunks,
  utilities, internal modules, translations) and CSS, plus the autoloader and
  full entry. React/SSR wrappers, declarations and upstream skill files are
  omitted. The autoloader requests only components used by the page.

Both are MIT licensed; see each version directory's `LICENSE.md`. Original
third-party notices in the distributions are preserved. Web Awesome embeds
Font Awesome Free system SVG icons (Fonticons, Inc., CC BY 4.0;
https://fontawesome.com/license/free and https://creativecommons.org/licenses/by/4.0/).
Its default **additional named icon** resolver uses the external Font Awesome
service; use inline SVG or local `src` URLs in offline HTML apps.

`sources.json` records exact official npm tarballs and verified SHA-512 integrity.
To reproduce, download those archives, verify their integrity, extract them,
and copy the listed browser files without transforming them. Keep the versioned
directories used by existing saved HTML when adding a newer version.

Upstream: https://basecoatui.com/ and https://webawesome.com/.
