import type { CustomIconRecord } from "./custom-icon";
import {
  decodeUriComponentSafely,
  hasSafePathSegments,
  stripHashAndQuery,
} from "../security-utils";

const LINK_ICON_WILDCARD_PREFIX = "*.";
const LINK_ICON_PROTOCOL_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;
const LINK_ICON_PROTOCOL_LESS_PREFIX = "//";
const LINK_ICON_HOST_SPLIT_REGEX = /[/?#]/;
const LINK_ICON_PORT_SUFFIX_REGEX = /:\d+$/;
const LINK_ICON_DOT_TRIM_REGEX = /^\.+|\.+$/g;
const LINK_ICON_HOST_ALLOWED_REGEX = /^[a-z0-9.-]+$|^[0-9a-f:]+$/i;
const LINK_ICON_IP_WILDCARD_RULES = new Set(["*.*.*.*", "*.*.*"]);
const LINK_ICON_LOCAL_URL_PREFIX = "/";
export const LINK_ICON_MANAGED_ICON_DIR = "/public/custom-link-icons";

export interface MergeCustomIconRecordsResult {
  icons: CustomIconRecord[];
  removedIcons: CustomIconRecord[];
  hasChanges: boolean;
}

function isCustomIconRecord(value: unknown): value is CustomIconRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as { href?: unknown; iconUrl?: unknown };
  return typeof record.href === "string" && typeof record.iconUrl === "string";
}

function sanitizeCustomIconRecord(record: CustomIconRecord): CustomIconRecord {
  return {
    href: record.href.trim(),
    iconUrl: record.iconUrl.trim(),
  };
}

function stripProtocolPrefix(value: string): string {
  if (LINK_ICON_PROTOCOL_REGEX.test(value)) {
    return value.replace(LINK_ICON_PROTOCOL_REGEX, "");
  }

  if (value.startsWith(LINK_ICON_PROTOCOL_LESS_PREFIX)) {
    return value.slice(LINK_ICON_PROTOCOL_LESS_PREFIX.length);
  }

  return value;
}

function stripPathQueryAndHash(value: string): string {
  return value.split(LINK_ICON_HOST_SPLIT_REGEX)[0] ?? "";
}

function stripTrailingPort(value: string): string {
  if (value.startsWith("[")) {
    const closingBracketIndex = value.indexOf("]");
    if (closingBracketIndex > 0) {
      return value.slice(1, closingBracketIndex);
    }
  }

  const colonCount = value.split(":").length - 1;
  if (colonCount === 1 && LINK_ICON_PORT_SUFFIX_REGEX.test(value)) {
    return value.replace(LINK_ICON_PORT_SUFFIX_REGEX, "");
  }

  return value;
}

function normalizeHostSegment(value: string): string {
  const protocolLessValue = stripProtocolPrefix(value);
  const hostLikeValue = stripPathQueryAndHash(protocolLessValue);
  const authLessValue = hostLikeValue.split("@").pop() ?? "";
  const hostValue = stripTrailingPort(authLessValue).replace(LINK_ICON_DOT_TRIM_REGEX, "");
  const colonCount = hostValue.split(":").length - 1;

  if (
    !hostValue ||
    /\s/.test(hostValue) ||
    hostValue.includes("*") ||
    !LINK_ICON_HOST_ALLOWED_REGEX.test(hostValue)
  ) {
    return "";
  }

  if (colonCount === 1) {
    return "";
  }

  return hostValue;
}

function hasRecordChanges(records: unknown[], nextIcons: CustomIconRecord[]): boolean {
  if (records.length !== nextIcons.length) {
    return true;
  }

  return nextIcons.some((icon, index) => {
    const rawRecord = records[index];
    if (!isCustomIconRecord(rawRecord)) {
      return true;
    }

    const sanitizedRecord = sanitizeCustomIconRecord(rawRecord);
    return sanitizedRecord.href !== icon.href || sanitizedRecord.iconUrl !== icon.iconUrl;
  });
}

export function isLocalIconUrl(iconUrl: string): boolean {
  return iconUrl.trim().startsWith(LINK_ICON_LOCAL_URL_PREFIX);
}

export function normalizeManagedIconUrl(iconUrl: string): string | null {
  const trimmedIconUrl = stripHashAndQuery(iconUrl.trim());
  const managedDirPrefix = `${LINK_ICON_MANAGED_ICON_DIR}/`;

  if (!trimmedIconUrl.startsWith(managedDirPrefix)) {
    return null;
  }

  const decodedIconUrl = decodeUriComponentSafely(trimmedIconUrl);
  if (
    !decodedIconUrl.startsWith(managedDirPrefix) ||
    decodedIconUrl.includes("\\") ||
    decodedIconUrl.includes("\0") ||
    decodedIconUrl.includes("//")
  ) {
    return null;
  }

  const relativePath = decodedIconUrl.slice(managedDirPrefix.length);
  if (!relativePath || relativePath.includes("/")) {
    return null;
  }

  if (!hasSafePathSegments(relativePath)) {
    return null;
  }

  return decodedIconUrl;
}

export function isManagedIconUrl(iconUrl: string): boolean {
  return normalizeManagedIconUrl(iconUrl) !== null;
}

export function normalizeLinkIconHref(rawHref: string): string {
  const normalizedValue = rawHref.trim().toLowerCase();
  if (!normalizedValue) {
    return "";
  }

  if (LINK_ICON_IP_WILDCARD_RULES.has(normalizedValue)) {
    return normalizedValue;
  }

  const protocolLessValue = stripProtocolPrefix(normalizedValue);
  const wildcardCandidate = protocolLessValue.startsWith(LINK_ICON_WILDCARD_PREFIX)
    ? protocolLessValue.slice(LINK_ICON_WILDCARD_PREFIX.length)
    : normalizedValue.startsWith(LINK_ICON_WILDCARD_PREFIX)
      ? normalizedValue.slice(LINK_ICON_WILDCARD_PREFIX.length)
      : "";

  if (wildcardCandidate) {
    const normalizedHost = normalizeHostSegment(wildcardCandidate);
    return normalizedHost ? `${LINK_ICON_WILDCARD_PREFIX}${normalizedHost}` : "";
  }

  return normalizeHostSegment(normalizedValue);
}

export function normalizeCustomIconRecord(record: CustomIconRecord): CustomIconRecord | null {
  const sanitizedRecord = sanitizeCustomIconRecord(record);
  const normalizedHref = normalizeLinkIconHref(sanitizedRecord.href);
  if (!normalizedHref || !sanitizedRecord.iconUrl) {
    return null;
  }

  return {
    href: normalizedHref,
    iconUrl: sanitizedRecord.iconUrl,
  };
}

export function mergeCustomIconRecords(records: unknown[]): MergeCustomIconRecordsResult {
  const normalizedRecords: CustomIconRecord[] = [];
  const invalidRecords: CustomIconRecord[] = [];

  records.forEach((record) => {
    if (!isCustomIconRecord(record)) {
      return;
    }

    const sanitizedRecord = sanitizeCustomIconRecord(record);
    const normalizedRecord = normalizeCustomIconRecord(sanitizedRecord);
    if (normalizedRecord) {
      normalizedRecords.push(normalizedRecord);
      return;
    }

    if (sanitizedRecord.iconUrl) {
      invalidRecords.push(sanitizedRecord);
    }
  });

  const keptHrefs = new Set<string>();
  const dedupedIcons: CustomIconRecord[] = [];
  const duplicateRecords: CustomIconRecord[] = [];

  for (let index = normalizedRecords.length - 1; index >= 0; index -= 1) {
    const icon = normalizedRecords[index];
    if (keptHrefs.has(icon.href)) {
      duplicateRecords.push(icon);
      continue;
    }

    keptHrefs.add(icon.href);
    dedupedIcons.push(icon);
  }

  dedupedIcons.reverse();
  duplicateRecords.reverse();

  return {
    icons: dedupedIcons,
    removedIcons: [...invalidRecords, ...duplicateRecords],
    hasChanges: hasRecordChanges(records, dedupedIcons),
  };
}

export function matchLinkIconRule(
  rule: string,
  domain: string,
  isIPAddress: (hostname: string) => boolean
): boolean {
  const normalizedRule = normalizeLinkIconHref(rule);
  const normalizedDomain = normalizeLinkIconHref(domain);
  if (!normalizedRule || !normalizedDomain) {
    return false;
  }

  if (LINK_ICON_IP_WILDCARD_RULES.has(normalizedRule)) {
    return isIPAddress(normalizedDomain);
  }

  if (normalizedRule.startsWith(LINK_ICON_WILDCARD_PREFIX)) {
    const baseDomain = normalizedRule.slice(LINK_ICON_WILDCARD_PREFIX.length);
    return normalizedDomain === baseDomain || normalizedDomain.endsWith(`.${baseDomain}`);
  }

  return normalizedDomain === normalizedRule;
}

export function getUnusedLocalIconUrls(
  icons: CustomIconRecord[],
  removedIcons: CustomIconRecord[],
  deleteList: string[] = []
): string[] {
  const activeLocalIconUrls = new Set(
    icons
      .map((icon) => normalizeManagedIconUrl(icon.iconUrl))
      .filter((iconUrl): iconUrl is string => Boolean(iconUrl))
  );
  const deleteCandidates = [
    ...removedIcons.map((icon) => icon.iconUrl.trim()),
    ...deleteList.map((iconUrl) => iconUrl.trim()),
  ];

  return [...new Set(deleteCandidates)]
    .map((iconUrl) => normalizeManagedIconUrl(iconUrl))
    .filter((iconUrl): iconUrl is string => Boolean(iconUrl))
    .filter((iconUrl) => !activeLocalIconUrls.has(iconUrl));
}
