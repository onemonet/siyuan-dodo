import { detectDirection } from "./graph-layout";

  const INDENT = "    ";

  function escapeLabel(raw) {
    return String(raw ?? "")
      .replace(/"/g, "#quot;")
      .replace(/\s*\n\s*/g, "<br>")
      .trim();
  }

  function buildTextByContainer(allElements) {
    const textByContainer = new Map();
    (allElements || []).forEach((element) => {
      if (element?.type !== "text" || element.isDeleted || !element.containerId) return;
      textByContainer.set(element.containerId, element.text ?? "");
    });
    return textByContainer;
  }

  function getNodeLabel(node, textByContainer) {
    const element = node.element;
    if (element.type === "text") {
      return escapeLabel(element.text ?? element.rawText ?? element.originalText);
    }
    return escapeLabel(textByContainer.get(node.id));
  }

  function getShapeWrap(element) {
    if (element.type === "diamond") return ["{", "}"];
    if (element.type === "ellipse") return ["(", ")"];
    return ["[", "]"];
  }

  function buildMindNodeIds(graph) {
    const ids = new Set();
    graph.nodes.forEach((node) => {
      if ((node.element?.customData?.dodoMind?.mapId || node.element?.customData?.mindmap?.mapId)) ids.add(node.id);
    });
    return ids;
  }

  function getEdgeOperator(edge, mindNodeIds) {
    const element = edge.element;
    const dashed = element.strokeStyle === "dashed";
    const hasStart = Boolean(element.startArrowhead);
    const hasEnd = Boolean(element.endArrowhead);
    if (!hasStart && !hasEnd) {
      if (mindNodeIds.has(edge.source) && mindNodeIds.has(edge.target)) {
        return dashed ? "-.->" : "-->";
      }
      return dashed ? "-.-" : "---";
    }
    if (hasStart && hasEnd) return dashed ? "<-.->" : "<-->";
    if (hasEnd) return dashed ? "-.->" : "-->";
    return dashed ? "<-.-" : "<--";
  }

  function buildNodeDeclarations(graph, textByContainer) {
    const idByNode = new Map();
    const declarations = [...graph.nodes]
      .sort((left, right) => left.y - right.y || left.x - right.x)
      .map((node, index) => {
        const id = `n${index + 1}`;
        idByNode.set(node.id, id);
        const [open, close] = getShapeWrap(node.element);
        return `${id}${open}"${getNodeLabel(node, textByContainer)}"${close}`;
      });
    return { idByNode, declarations };
  }

  function buildEdgeLines(graph, idByNode, textByContainer, mindNodeIds) {
    const lines = [];
    const seen = new Set();
    graph.edges.forEach((edge) => {
      const sourceId = idByNode.get(edge.source);
      const targetId = idByNode.get(edge.target);
      if (!sourceId || !targetId) return;
      const operator = getEdgeOperator(edge, mindNodeIds);
      const label = escapeLabel(textByContainer.get(edge.id));
      const key = `${sourceId}|${operator}|${label}|${targetId}`;
      if (seen.has(key)) return;
      seen.add(key);
      lines.push(label
        ? `${sourceId} ${operator}|"${label}"| ${targetId}`
        : `${sourceId} ${operator} ${targetId}`);
    });
    return lines;
  }

  function exportMermaid(graph, allElements) {
    if (!graph?.nodes?.length) return null;
    const direction = detectDirection(graph) || "TD";
    const textByContainer = buildTextByContainer(allElements);
    const mindNodeIds = buildMindNodeIds(graph);
    const { idByNode, declarations } = buildNodeDeclarations(graph, textByContainer);
    const lines = [
      `flowchart ${direction}`,
      ...declarations.map((line) => INDENT + line),
      ...buildEdgeLines(graph, idByNode, textByContainer, mindNodeIds).map((line) => INDENT + line),
    ];
    return lines.join("\n");
  }

  export { exportMermaid };
