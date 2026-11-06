  function isNodeElement(element) {
    if (!element || element.isDeleted) return false;
    if (element.type === "arrow" || element.type === "line" || element.type === "freedraw") return false;
    if (element.type === "text" && element.containerId) return false;
    return true;
  }

  function toNode(element) {
    return {
      id: element.id,
      element,
      x: element.x || 0,
      y: element.y || 0,
      width: element.width || 0,
      height: element.height || 0,
    };
  }

  function buildGraph(elements) {
    const source = elements || [];
    const nodes = [];
    const nodesById = new Map();
    source.forEach((element) => {
      if (!isNodeElement(element) || nodesById.has(element.id)) return;
      const node = toNode(element);
      nodes.push(node);
      nodesById.set(node.id, node);
    });
    if (!nodes.length) return null;

    const edges = [];
    const textByContainer = new Map();
    source.forEach((element) => {
      if (element?.isDeleted || element.type !== "text" || !element.containerId) return;
      textByContainer.set(element.containerId, element);
    });
    source.forEach((element) => {
      if (element?.isDeleted || element.type !== "arrow") return;
      const sourceId = element.startBinding?.elementId;
      const targetId = element.endBinding?.elementId;
      if (!sourceId || !targetId || sourceId === targetId) return;
      if (!nodesById.has(sourceId) || !nodesById.has(targetId)) return;
      const label = textByContainer.get(element.id);
      edges.push({
        id: element.id,
        source: sourceId,
        target: targetId,
        element,
        label: label
          ? { width: label.width || 0, height: label.height || 0 }
          : null,
      });
    });

    return { nodes, edges, nodesById };
  }

  function buildComponents(graph) {
    const parent = new Map();
    const find = (id) => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root);
      while (parent.get(id) !== root) {
        const next = parent.get(id);
        parent.set(id, root);
        id = next;
      }
      return root;
    };
    const union = (left, right) => {
      parent.set(find(left), find(right));
    };

    graph.nodes.forEach((node) => parent.set(node.id, node.id));
    graph.edges.forEach((edge) => {
      if (parent.has(edge.source) && parent.has(edge.target)) union(edge.source, edge.target);
    });

    const components = new Map();
    graph.nodes.forEach((node) => {
      const root = find(node.id);
      const component = components.get(root) || { nodes: [], edges: [], minX: node.x };
      component.nodes.push(node);
      component.minX = Math.min(component.minX, node.x);
      components.set(root, component);
    });
    graph.edges.forEach((edge) => {
      const component = components.get(find(edge.source));
      if (component) component.edges.push(edge);
    });
    return [...components.values()];
  }

  export { buildGraph, buildComponents, isNodeElement };
