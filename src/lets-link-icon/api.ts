export interface FaviconCandidate {
  url: string;
  source: string;
}

import { DEFAULT_FAVICON_SERVICE_TEMPLATES } from "./settings";
import {
  fetchWithTimeout,
  parseHttpUrl,
} from "@/security-utils";

const FAVICON_TEMPLATE_DOMAIN_TOKEN = /\$\{domain\}|\{domain\}/g;
const FAVICON_TEMPLATE_COMMENT_PREFIX = "#";

function buildFaviconCandidates(domain: string, serviceTemplates?: string): FaviconCandidate[] {
  const templates = (serviceTemplates || DEFAULT_FAVICON_SERVICE_TEMPLATES)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(FAVICON_TEMPLATE_COMMENT_PREFIX));

  return templates
    .map((template, index) => {
      const encodedDomain = encodeURIComponent(domain);
      const url = template.includes("${domain}") || template.includes("{domain}")
        ? template.replace(FAVICON_TEMPLATE_DOMAIN_TOKEN, encodedDomain)
        : template;
      const parsedUrl = parseHttpUrl(url);
      if (!parsedUrl) {
        return null;
      }
      return {
        url: parsedUrl.toString(),
        source: `custom-${index + 1}`,
      };
    })
    .filter((item): item is FaviconCandidate => Boolean(item));
}

export async function fetchFaviconCandidates(
  domain: string,
  serviceTemplates?: string
): Promise<FaviconCandidate[]> {
  const candidates = buildFaviconCandidates(domain, serviceTemplates);

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const response = await fetchWithTimeout(candidate.url, {
          method: "GET",
        }, 5000);
        void response.body?.cancel();
        return response.ok ? candidate : null;
      } catch {
        return null;
      }
    })
  );

  return results.filter((item): item is FaviconCandidate => Boolean(item));
}

export async function resolveBestFavicon(
  domain: string,
  serviceTemplates?: string
): Promise<string | null> {
  const candidates = await fetchFaviconCandidates(domain, serviceTemplates);
  return candidates[0]?.url ?? null;
}
