// Adapted from SiYuan Excalidraw V2; no global state.
const isLinearElement = (element) => ['line','arrow'].includes(element?.type);
  const TRANSPARENT = "transparent";
  const LINE_TYPES = ["line", "arrow"];
  const FILL_STYLE_RANK = [
    "dashed",
    "none",
    "hachure",
    "zigzag",
    "zigzag-line",
    "cross-hatch",
    "solid",
  ];

  const vector = {
    add(items) {
      return items.reduce((sum, item) => [sum[0] + item[0], sum[1] + item[1]], [0, 0]);
    },
    scale(factor, item) {
      return [item[0] * factor, item[1] * factor];
    },
    rotate(point, angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos];
    },
    length(point) {
      return Math.sqrt(point[0] ** 2 + point[1] ** 2);
    },
  };

  function traceRectangle(element) {
    return [
      [0, 0],
      [0, element.height],
      [element.width, element.height],
      [element.width, 0],
      [0, 0],
    ];
  }

  function traceDiamond(element) {
    return [
      vector.scale(0.5, [0, element.height]),
      vector.scale(0.5, [element.width, 0]),
      vector.add([vector.scale(0.5, [0, element.height]), [element.width, 0]]),
      vector.add([vector.scale(0.5, [element.width, 0]), [0, element.height]]),
      vector.scale(0.5, [0, element.height]),
    ];
  }

  function traceEllipse(element) {
    const points = [];
    const samples = 64;
    const step = (2 * Math.PI) / samples;

    for (let index = 0; index < samples; index += 1) {
      const theta = index * step;
      points.push([
        (element.width / 2) * Math.cos(theta) + element.width / 2,
        (element.height / 2) * Math.sin(theta) + element.height / 2,
      ]);
    }

    return points;
  }

  function traceLine(element) {
    if (element.roundness != null) return [];
    return (element.points || []).map((point) => [...point]);
  }

  function traceElement(element) {
    let polygon = [];
    let polygonOffset = [0, 0];

    if (element.type === "rectangle") polygon = traceRectangle(element);
    if (element.type === "diamond") polygon = traceDiamond(element);
    if (element.type === "ellipse") polygon = traceEllipse(element);
    if (LINE_TYPES.includes(element.type)) {
      if ((element.angle || 0) !== 0) {
        let minLocalX = 0;
        let minLocalY = 0;
        (element.points || []).forEach((point) => {
          minLocalX = Math.min(minLocalX, point[0]);
          minLocalY = Math.min(minLocalY, point[1]);
        });
        polygon = (element.points || []).map((point) => [
          point[0] - minLocalX,
          point[1] - minLocalY,
        ]);
        polygonOffset = [minLocalX, minLocalY];
      } else {
        polygon = traceLine(element);
      }
    }
    if (!polygon.length) return [];

    if ((element.angle || 0) === 0) {
      return polygon.map((point) => vector.add([point, [element.x, element.y]]));
    }

    return polygon
      .map((point) => vector.add([point, vector.scale(-0.5, [element.width, element.height])]))
      .map((point) => vector.rotate(point, element.angle))
      .map((point) => {
        return vector.add([
          point,
          [element.x, element.y],
          vector.scale(0.5, [element.width, element.height]),
          polygonOffset,
        ]);
      });
  }

  function rankStyleElement(element) {
    let score = (FILL_STYLE_RANK.indexOf(element.fillStyle) + 1) * 10;
    if (element.backgroundColor === TRANSPARENT) score -= 100;
    const lastPoint = element.points?.[element.points.length - 1];
    if (lastPoint && vector.length(lastPoint) > 8) score -= 100;
    return Math.max(0, score) + (element.opacity || 0) / 100;
  }

  function pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;

    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const [xi, yi] = polygon[index];
      const [xj, yj] = polygon[previous];
      const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
      if ((x === xi && y === yi) || (x === xj && y === yj)) return null;
    }

    return inside;
  }

  function buildHierarchy(polygons) {
    function insertPolygon(polygon, hierarchy) {
      for (const current of hierarchy) {
        let pointIndex = 0;
        let inside = null;
        do {
          inside = pointInPolygon(polygon[pointIndex], current.path);
          pointIndex += 1;
        } while (inside === null && pointIndex < polygon.length);
        if (inside) {
          current.innerPolygons = insertPolygon(polygon, current.innerPolygons);
          return hierarchy;
        }
      }

      const node = { path: polygon, innerPolygons: [] };
      for (let index = 0; index < hierarchy.length; index += 1) {
        let pointIndex = 0;
        let inside = null;
        do {
          inside = pointInPolygon(hierarchy[index].path[pointIndex], polygon);
          pointIndex += 1;
        } while (inside === null && pointIndex < hierarchy[index].path.length);
        if (inside) node.innerPolygons.push(hierarchy.splice(index--, 1)[0]);
      }
      hierarchy.push(node);
      return hierarchy;
    }

    return polygons.reduce((hierarchy, polygon) => insertPolygon(polygon, hierarchy), []);
  }

export { buildHierarchy, isLinearElement, rankStyleElement, traceElement };
