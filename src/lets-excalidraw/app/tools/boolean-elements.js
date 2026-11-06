// Adapted from SiYuan Excalidraw V2; no global state.
  const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const ID_LENGTH = 21;
  const VERSION_NONCE_LIMIT = 2147483647;
  const TRANSPARENT = "transparent";

  function randomInt() {
    return Math.floor(Math.random() * VERSION_NONCE_LIMIT);
  }

  function createId() {
    return Array.from({ length: ID_LENGTH }, () => {
      return ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    }).join("");
  }

  function createLineElement(points, style) {
    if (!Array.isArray(points) || points.length < 2) return null;

    const [originX, originY] = points[0];
    const relativePoints = points.map(([x, y]) => [x - originX, y - originY]);
    const xs = relativePoints.map((point) => point[0]);
    const ys = relativePoints.map((point) => point[1]);

    return {
      id: createId(),
      type: "line",
      x: originX,
      y: originY,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      angle: 0,
      strokeColor: style.strokeColor || "#1e1e1e",
      backgroundColor: style.backgroundColor || TRANSPARENT,
      fillStyle: style.fillStyle || "hachure",
      strokeWidth: style.strokeWidth || 1,
      strokeStyle: style.strokeStyle || "solid",
      roughness: style.roughness ?? 1,
      opacity: style.opacity ?? 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: randomInt(),
      version: 1,
      versionNonce: randomInt(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      points: relativePoints,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
      polygon: true,
    };
  }

  function processInnerPolygons(polygons, style) {
    let backgroundPath = [];
    const closingPath = [];
    const borderPaths = [];
    const nestedElements = [];

    polygons.forEach((node) => {
      const path = [...node.path, node.path[0]];
      borderPaths.push(path);
      backgroundPath = backgroundPath.concat(path);
      closingPath.push(node.path[0]);
      if (node.innerPolygons.length) {
        nestedElements.push(...drawPolygonWithHoles(node, style).elements);
      }
    });

    return {
      backgroundPath: backgroundPath.concat(closingPath.reverse()),
      borderPaths,
      nestedElements,
    };
  }

  function drawPolygonWithHoles(node, style) {
    const elements = [];
    const selectedIds = [];
    const outerPath = [...node.path, node.path[0]];

    if (!node.innerPolygons.length) {
      const element = createLineElement(outerPath, style);
      if (element) {
        elements.push(element);
        selectedIds.push(element.id);
      }
      return { elements, selectedIds };
    }

    const inner = processInnerPolygons(node.innerPolygons, style);
    const background = createLineElement([...outerPath, ...inner.backgroundPath, outerPath[0]], {
      ...style,
      strokeColor: TRANSPARENT,
    });
    const borderStyle = { ...style, backgroundColor: TRANSPARENT };
    const outerBorder = createLineElement(outerPath, borderStyle);

    if (background) elements.push(background);
    if (outerBorder) elements.push(outerBorder);
    inner.borderPaths.forEach((path) => {
      const border = createLineElement(path, borderStyle);
      if (border) elements.push(border);
    });
    inner.nestedElements.forEach((element) => elements.push(element));

    if (background && outerBorder) {
      background.groupIds.push(`${"ShadowCloneOf-"}${outerBorder.id}`);
    }
    selectedIds.push(...elements.map((element) => element.id));

    return { elements, selectedIds };
  }

  function createElementsFromHierarchy(hierarchy, style, oldElements) {
    const newElements = [];
    const selectedIds = [];

    hierarchy.forEach((node) => {
      const result = drawPolygonWithHoles(node, style);
      newElements.push(...result.elements);
      selectedIds.push(...result.selectedIds);
    });

    return { newElements, oldElements, selectedIds };
  }

export { createElementsFromHierarchy, createLineElement };
