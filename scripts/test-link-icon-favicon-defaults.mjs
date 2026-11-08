import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

async function importModule(path) {
  const result = await build({
    entryPoints: [path], bundle: true, write: false,
    format: "esm", platform: "node", logLevel: "silent",
  });
  return import("data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].contents).toString("base64"));
}

const settings = await importModule("src/lets-link-icon/settings.ts");
const {
  DEFAULT_FAVICON_SERVICE_TEMPLATES: defaults,
  LEGACY_DEFAULT_FAVICON_SERVICE_TEMPLATES: old,
  migrateLegacyFaviconServiceTemplates: migrate,
  defaultLinkIconConfig,
  linkIconSettings,
} = settings;
const expected = [
  "https://www.boltp.com/favicon/${domain}.png",
  "https://a.favicon.im/${domain}",
  "https://www.google.com/s2/favicons?domain=${domain}&sz=64",
  "https://icons.duckduckgo.com/ip3/${domain}.ico",
];
assert.deepEqual(defaults.split("\n"), expected);
assert.deepEqual(old.split("\n"), [
  "https://favicon.im/${domain}",
  ...expected.slice(2),
]);
const faviconItem=linkIconSettings.find(item=>item.key==="faviconServiceTemplates");
assert.equal(faviconItem?.value,defaults);
assert.equal(faviconItem?.placeholder,defaults);
assert.equal(defaultLinkIconConfig.faviconServiceTemplates,defaults);
assert.equal(migrate(old),defaults,"Previous stock defaults must upgrade");
assert.equal(migrate(defaults),defaults,"New defaults stay unchanged");
const custom=old+"\nhttps://my-custom-favicon.example/${domain}";
assert.equal(migrate(custom),custom,"User-customized source lists must not be overwritten");
assert.equal(migrate("https://cdn.myicons.example/${domain}"),
  "https://cdn.myicons.example/${domain}");
assert.equal(migrate(""),"","Empty custom setting stays untouched");
assert.equal(migrate(undefined),undefined);

const source=readFileSync("src/settings.ts","utf8");
assert(source.includes("migrateLegacyFaviconServiceTemplates"),
  "Plugin settings loader must migrate old defaults");
assert(source.includes('normalizedSettings["link-icon"]'),
  "Only link-icon settings should be migrated");
assert(source.includes("linkIconSettings.faviconServiceTemplates = migrateLegacyFaviconServiceTemplates"),
  "Normalized persisted setting should receive the updated default");

const {fetchFaviconCandidates,resolveBestFavicon}=await importModule("src/lets-link-icon/api.ts");
const oldFetch=globalThis.fetch;
const urls=[];
let failure=new Set();
globalThis.fetch=async input=>{
  const url=String(input);
  urls.push(url);
  return {ok:!failure.has(url),body:{cancel:async()=>{}}};
};
try {
  const domain="example.com";
  const expectedUrls=[
    "https://www.boltp.com/favicon/example.com.png",
    "https://a.favicon.im/example.com",
    "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    "https://icons.duckduckgo.com/ip3/example.com.ico",
  ];
  const candidates=await fetchFaviconCandidates(domain);
  assert.deepEqual(candidates.map(c=>c.url),expectedUrls,
    "Default providers must be tried in the requested order");
  assert.deepEqual(urls,expectedUrls);
  urls.length=0;
  failure=new Set(expectedUrls.slice(0,2));
  const chosen=await resolveBestFavicon(domain);
  assert.equal(chosen,expectedUrls[2],
    "If a preferred provider fails, the next successful fallback wins");
  assert.deepEqual(urls,expectedUrls);
  urls.length=0;
  failure=new Set(expectedUrls);
  assert.equal(await resolveBestFavicon(domain),null,
    "If all configured providers fail, no icon is returned");
  urls.length=0;
  failure=new Set();
  const customUrl="https://icons.example.com/example.com.png";
  assert.equal(await resolveBestFavicon(domain,
    "https://icons.example.com/${domain}.png"),customUrl);
  assert.deepEqual(urls,[customUrl],
    "Explicit user service configuration must override defaults");
} finally {
  globalThis.fetch=oldFetch;
}
console.log("PASS: Favicon defaults (boltp, favicon.im, Google, DuckDuckGo), previous defaults migration, customized list preservation, ordered fallbacks");