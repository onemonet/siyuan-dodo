import { buildComponents } from "./graph-model";

  const RANK_GAP = 40;
  const NODE_GAP = 40;
  const COMPONENT_GAP = 80;
  const BARYCENTER_SWEEPS = 4;
  const LR_ASPECT_THRESHOLD = 1.2;
  const DIRECTION_BIAS = 0.5;

  // 按原始位置判断流向：先看每条边的走向投票（纵向偏移 ≥ 横向一半算 TD 票），
  // 平票或无边时退回整体宽高比（宽 > 高 × 1.2 才 LR）。V 形树等“整体偏宽但
  // 语义向下”的结构靠连线投票识别，避免被宽高比误判成 LR。
  function detectDirection(graph) {
    let tdVotes = 0;
    let lrVotes = 0;
    graph.edges.forEach((edge) => {
      const source = graph.nodesById.get(edge.source);
      const target = graph.nodesById.get(edge.target);
      if (!source || !target) return;
      const dx = Math.abs((target.x + target.width / 2) - (source.x + source.width / 2));
      const dy = Math.abs((target.y + target.height / 2) - (source.y + source.height / 2));
      if (dy >= dx * DIRECTION_BIAS) tdVotes += 1;
      else lrVotes += 1;
    });
    if (graph.edges.length && tdVotes !== lrVotes) {
      return tdVotes > lrVotes ? "TD" : "LR";
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    graph.nodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x + node.width);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + node.height);
    });
    const width = maxX - minX;
    const height = maxY - minY;
    return width > height * LR_ASPECT_THRESHOLD ? "LR" : "TD";
  }

  function buildAdjacency(nodes, edges) {
    const outgoing = new Map();
    const incoming = new Map();
    nodes.forEach((node) => {
      outgoing.set(node.id, new Map());
      incoming.set(node.id, new Map());
    });
    edges.forEach((edge) => {
      outgoing.get(edge.source)?.set(edge.target, edge);
      incoming.get(edge.target)?.set(edge.source, edge);
    });
    return { outgoing, incoming };
  }

  function findBackEdges(nodes, outgoing) {
    const backEdges = new Set();
    const state = new Map();
    const visit = (nodeId) => {
      state.set(nodeId, 1);
      outgoing.get(nodeId)?.forEach((edge, targetId) => {
        const targetState = state.get(targetId);
        if (targetState === 1) {
          backEdges.add(edge.id);
        } else if (!targetState) {
          visit(targetId);
        }
      });
      state.set(nodeId, 2);
    };
    nodes.forEach((node) => {
      if (!state.get(node.id)) visit(node.id);
    });
    return backEdges;
  }

  function assignLayers(nodes, outgoing, incoming, backEdges) {
    const layer = new Map();
    const pending = new Map();
    nodes.forEach((node) => {
      layer.set(node.id, 0);
      pending.set(node.id, 0);
    });
    nodes.forEach((node) => {
      incoming.get(node.id)?.forEach((edge) => {
        if (!backEdges.has(edge.id)) pending.set(node.id, pending.get(node.id) + 1);
      });
    });
    const queue = nodes.filter((node) => pending.get(node.id) === 0).map((node) => node.id);
    const ordered = new Set(queue);
    while (queue.length) {
      const nodeId = queue.shift();
      outgoing.get(nodeId)?.forEach((edge, targetId) => {
        if (backEdges.has(edge.id)) return;
        layer.set(targetId, Math.max(layer.get(targetId), layer.get(nodeId) + 1));
        pending.set(targetId, pending.get(targetId) - 1);
        if (pending.get(targetId) === 0 && !ordered.has(targetId)) {
          ordered.add(targetId);
          queue.push(targetId);
        }
      });
    }
    const layers = [];
    nodes.forEach((node) => {
      const index = layer.get(node.id) || 0;
      (layers[index] ||= []).push(node.id);
    });
    return layers.map((ids) => ids || []);
  }

  function orderByBarycenter(nodesById, layers, outgoing, incoming, backEdges) {
    const order = new Map();
    const sweepLayers = (downward) => {
      const sequence = downward ? layers : [...layers].reverse();
      sequence.forEach((ids) => {
        const keyed = ids.map((id) => {
          const neighbors = downward ? incoming.get(id) : outgoing.get(id);
          let sum = 0;
          let count = 0;
          neighbors?.forEach((edge, neighborId) => {
            if (backEdges.has(edge.id)) return;
            sum += order.get(neighborId) || 0;
            count += 1;
          });
          return {
            id,
            key: count ? sum / count : (order.get(id) || 0),
            x: nodesById.get(id).x,
          };
        });
        keyed.sort((left, right) => left.key - right.key || left.x - right.x);
        ids.length = 0;
        keyed.forEach((item, index) => {
          order.set(item.id, index);
          ids.push(item.id);
        });
      });
    };
    layers.forEach((ids) => ids.forEach((id, index) => order.set(id, index)));
    for (let sweep = 0; sweep < BARYCENTER_SWEEPS; sweep += 1) {
      sweepLayers(sweep % 2 === 0);
    }
    return order;
  }

  function getRankGap(edges, direction) {
    const labelSize = (edges || []).reduce((size, edge) => {
      const label = edge.label;
      if (!label) return size;
      return Math.max(size, direction === "LR" ? label.width : label.height);
    }, 0);
    return RANK_GAP + labelSize;
  }

  function placeLayers(nodesById, layers, direction, rankGap) {
    const positions = new Map();
    let rankCursor = 0;
    layers.forEach((ids) => {
      if (!ids.length) return;
      if (direction === "LR") {
        const columnHeight = ids.reduce((sum, id) => {
          return sum + nodesById.get(id).height;
        }, 0) + NODE_GAP * (ids.length - 1);
        const columnWidth = Math.max(...ids.map((id) => nodesById.get(id).width));
        let y = 0;
        ids.forEach((id, index) => {
          if (index > 0) y += NODE_GAP;
          const node = nodesById.get(id);
          positions.set(id, {
            x: rankCursor + (columnWidth - node.width) / 2,
            y: y - columnHeight / 2,
          });
          y += node.height;
        });
        rankCursor += columnWidth + rankGap;
        return;
      }
      const rowHeight = Math.max(...ids.map((id) => nodesById.get(id).height));
      const y = rankCursor;
      let x = 0;
      const rowIds = [];
      ids.forEach((id, index) => {
        if (index > 0) x += NODE_GAP;
        const node = nodesById.get(id);
        positions.set(id, { x, y: y + (rowHeight - node.height) / 2 });
        rowIds.push(id);
        x += node.width;
      });
      const rowWidth = x;
      rowIds.forEach((id) => {
        positions.get(id).x -= rowWidth / 2;
      });
      rankCursor += rowHeight + rankGap;
    });
    return positions;
  }

  function layoutSubgraph(nodes, edges, direction) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const { outgoing, incoming } = buildAdjacency(nodes, edges);
    const backEdges = findBackEdges(nodes, outgoing);
    const layers = assignLayers(nodes, outgoing, incoming, backEdges);
    orderByBarycenter(nodesById, layers, outgoing, incoming, backEdges);
    return placeLayers(nodesById, layers, direction, getRankGap(edges, direction));
  }

  function getComponentBounds(nodesById, positions) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    positions.forEach((position, id) => {
      const node = nodesById.get(id);
      minX = Math.min(minX, position.x);
      maxX = Math.max(maxX, position.x + node.width);
      minY = Math.min(minY, position.y);
      maxY = Math.max(maxY, position.y + node.height);
    });
    return { minX, maxX, minY, maxY };
  }

  function alignToOrigin(graph, positions) {
    let originX = Infinity;
    let originY = Infinity;
    graph.nodes.forEach((node) => {
      originX = Math.min(originX, node.x);
      originY = Math.min(originY, node.y);
    });
    positions.forEach((position) => {
      position.x += originX;
      position.y += originY;
    });
  }

  function layout(graph, options: { direction?: "TD" | "LR" } = {}) {
    if (!graph?.nodes?.length) return null;
    const direction = options.direction || detectDirection(graph);
    const components = buildComponents(graph)
      .sort((left, right) => left.minX - right.minX);
    const allPositions = new Map();
    let crossCursor = 0;
    components.forEach((component) => {
      const nodesById = new Map(component.nodes.map((node) => [node.id, node]));
      const positions = layoutSubgraph(component.nodes, component.edges, direction);
      const bounds = getComponentBounds(nodesById, positions);
      positions.forEach((position, id) => {
        allPositions.set(id, direction === "LR"
          ? { x: position.x, y: position.y - bounds.minY + crossCursor }
          : { x: position.x - bounds.minX + crossCursor, y: position.y });
      });
      crossCursor += (direction === "LR"
        ? bounds.maxY - bounds.minY
        : bounds.maxX - bounds.minX) + COMPONENT_GAP;
    });
    alignToOrigin(graph, allPositions);
    return allPositions;
  }

  export { layout, detectDirection };
