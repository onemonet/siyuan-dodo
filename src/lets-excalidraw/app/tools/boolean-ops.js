// Adapted from SiYuan Excalidraw V2; no global state.
import PolyBool from "./polybool-vendor.js";
import * as booleanGeometry from "./boolean-geometry.js";
import * as booleanElements from "./boolean-elements.js";
  const SUPPORTED_TYPES = ["ellipse", "rectangle", "diamond", "line", "arrow"];

  function isShadowCloneElement(element) {
    return Boolean(
      element?.groupIds?.some((groupId) => {
        return groupId.startsWith("ShadowCloneOf-");
      }),
    );
  }

  function supportsElement(element) {
    if (!element || element.isDeleted || element.locked
      || element.customData?.dodoMind || element.customData?.dodoMindEdge) return false;
    if (SUPPORTED_TYPES.includes(element.type)) {
      return !(booleanGeometry.isLinearElement(element) && element.roundness != null);
    }
    return isShadowCloneElement(element);
  }

  function getSelectedSupportedElements(selection) {
    return (selection?.elements || []).filter(supportsElement);
  }

  function getShadowCloneParentId(element) {
    const marker = element.groupIds?.find((groupId) => {
      return groupId.startsWith("ShadowCloneOf-");
    });
    return marker?.slice("ShadowCloneOf-".length) || null;
  }

  function getRenderableElements(elements) {
    const byId = new Map(elements.map((element) => [element.id, { ...element }]));
    elements.forEach((element) => {
      if (!isShadowCloneElement(element)) return;
      const parentId = getShadowCloneParentId(element);
      const parent = byId.get(parentId);
      if (!parent) return;
      byId.set(parentId, {
        ...parent,
        backgroundColor: element.backgroundColor,
        fillStyle: element.fillStyle,
      });
    });
    return [...byId.values()].filter((element) => !isShadowCloneElement(element));
  }

  function resolveStyle(elements) {
    const [source] = [...elements].sort((left, right) => {
      return booleanGeometry.rankStyleElement(right) - booleanGeometry.rankStyleElement(left);
    });
    return {
      strokeColor: source.strokeColor,
      backgroundColor: source.backgroundColor,
      fillStyle: source.fillStyle,
      strokeWidth: source.strokeWidth,
      strokeStyle: source.strokeStyle,
      roughness: source.roughness,
      opacity: source.opacity,
    };
  }

  function toShape(polygon) {
    return { regions: [polygon], inverted: false };
  }

  function runSplit(polybool, polygons) {
    const regions = [];

    polygons.forEach((polygon, index) => {
      const current = toShape(polygon);
      let remaining = current;

      polygons.forEach((other, otherIndex) => {
        if (index === otherIndex) return;
        const otherShape = toShape(other);
        if (index < otherIndex) {
          const intersection = polybool.intersect(current, otherShape);
          if (intersection.regions?.length) regions.push(...intersection.regions);
        }
        remaining = polybool.difference(remaining, otherShape);
      });

      if (remaining.regions?.length) regions.push(...remaining.regions);
    });

    return { regions, inverted: false };
  }

  function reduce(polybool, operation, polygons) {
    const initial = toShape(polygons[0]);
    const rest = polygons.slice(1);
    const reducers = {
      union: (shape, polygon) => polybool.union(shape, toShape(polygon)),
      difference: (shape, polygon) => polybool.difference(shape, toShape(polygon)),
      intersection: (shape, polygon) => polybool.intersect(shape, toShape(polygon)),
      xor: (shape, polygon) => polybool.xor(shape, toShape(polygon)),
    };
    if (operation === "split") return runSplit(polybool, polygons);
    return reducers[operation] ? rest.reduce(reducers[operation], initial) : null;
  }

  function buildInput(elements) {
    const renderableElements = getRenderableElements(elements);
    if (renderableElements.length < 2) {
      return { data: null, error: "boolean: insufficient-elements" };
    }

    const polygons = renderableElements
      .map((element) => booleanGeometry.traceElement(element))
      .filter((polygon) => polygon.length >= 2);
    if (polygons.length < 2) {
      return { data: null, error: "boolean: insufficient-polygons" };
    }

    return {
      data: { polygons, style: resolveStyle(renderableElements) },
      error: "",
    };
  }

  function perform(operation, elements) {
    const polybool = PolyBool;
    if (!polybool) return { data: null, error: "boolean: polybool-unavailable" };

    const input = buildInput(elements);
    if (input.error) return input;

    const result = reduce(polybool, operation, input.data.polygons);
    if (!result?.regions?.length) {
      return { data: null, error: `boolean: empty-result:${operation}` };
    }

    return {
      data: booleanElements.createElementsFromHierarchy(
        booleanGeometry.buildHierarchy(result.regions),
        input.data.style,
        elements,
      ),
      error: "",
    };
  }

export { buildInput, getSelectedSupportedElements, perform, reduce, supportsElement };
