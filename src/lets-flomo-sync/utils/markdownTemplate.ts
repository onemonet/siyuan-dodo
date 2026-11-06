const TEMPLATE_TOKENS = {
  time: "${time}",
  tags: "${tags}",
  content: "${content}",
} as const;

const CONTENT_PREFIX_REGEX = /^(\s*[^\s]*)\s*\${content}/;

function replaceTemplateTokens(
  template: string,
  content: string,
  time: string,
  tags: string,
): string {
  return template
    .replace(/\${time}/g, time)
    .replace(/\${tags}/g, tags)
    .replace(/\${content}/g, content);
}

function resolveContentLinePrefix(template: string): string {
  const templateLines = template.split("\n");
  const contentLine = templateLines.find((line) =>
    line.includes(TEMPLATE_TOKENS.content),
  );

  if (!contentLine) {
    return "";
  }

  return contentLine.match(CONTENT_PREFIX_REGEX)?.[1] || "";
}

export function applyTemplate(
  content: string,
  time: string,
  tags: string,
  template: string,
): string {
  if (!content.includes("\n")) {
    return replaceTemplateTokens(template, content, time, tags);
  }

  const lines = content.split("\n");
  const baseTemplate = replaceTemplateTokens(template, lines[0], time, tags);
  const contentPrefix = resolveContentLinePrefix(template);
  const remainingLines = lines.slice(1).map((line) => contentPrefix + line);
  return `${baseTemplate}\n${remainingLines.join("\n")}`;
}
