(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  const NODE_W = 190;
  const NODE_H = 44;
  const H_GAP = 90;
  const V_GAP = 18;
  const PADDING = 30;

  const state = {
    graph: null,
    selected: null,
    scale: 1,
  };

  const viewport = document.getElementById('viewport');
  const stats = document.getElementById('stats');
  const detailEmpty = document.getElementById('detail-empty');
  const detailBody = document.getElementById('detail-body');
  const SVG_NS = 'http://www.w3.org/2000/svg';

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.type === 'graph' && message.graph) {
      state.graph = message.graph;
      state.selected = null;
      render();
    }
  });

  function nodesById() {
    const map = new Map();
    state.graph.nodes.forEach((node) => map.set(node.id, node));
    return map;
  }

  function adjacency() {
    const out = new Map();
    const inMap = new Map();
    state.graph.nodes.forEach((node) => {
      out.set(node.id, []);
      inMap.set(node.id, []);
    });
    state.graph.edges.forEach((edge) => {
      if (out.has(edge.from) && inMap.has(edge.to)) {
        out.get(edge.from).push(edge.to);
        inMap.get(edge.to).push(edge.from);
      }
    });
    return { out, inMap };
  }

  function computeLevels() {
    const { out } = adjacency();
    const levels = new Map();
    const visiting = new Set();

    const levelOf = (id) => {
      if (levels.has(id)) {
        return levels.get(id);
      }
      if (visiting.has(id)) {
        return 0;
      }
      visiting.add(id);
      let level = 0;
      const targets = out.get(id) || [];
      targets.forEach((target) => {
        level = Math.max(level, levelOf(target) + 1);
      });
      visiting.delete(id);
      levels.set(id, level);
      return level;
    };

    state.graph.nodes.forEach((node) => levelOf(node.id));
    return levels;
  }

  function layout() {
    const levels = computeLevels();
    const columns = [];
    state.graph.nodes.forEach((node) => {
      const level = levels.get(node.id) || 0;
      if (!columns[level]) {
        columns[level] = [];
      }
      columns[level].push(node);
    });

    const columnHeights = columns.map((column) => column.length * (NODE_H + V_GAP) - V_GAP);
    const totalHeight = Math.max(PADDING * 2, Math.max(...columnHeights) + PADDING * 2);
    const totalWidth = Math.max(PADDING * 2, columns.length * (NODE_W + H_GAP) - H_GAP + PADDING * 2);

    const positions = new Map();
    columns.forEach((column, index) => {
      const columnHeight = columnHeights[index];
      const startY = (totalHeight - columnHeight) / 2;
      column.forEach((node, row) => {
        positions.set(node.id, {
          x: PADDING + index * (NODE_W + H_GAP),
          y: startY + row * (NODE_H + V_GAP),
        });
      });
    });

    return { positions, totalWidth, totalHeight };
  }

  function edgePath(from, to) {
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;

    if (from === to) {
      const loopY = from.y - 14;
      return {
        d: `M ${x1} ${y1} C ${x1 + H_GAP / 2} ${y1}, ${x1 + H_GAP / 2} ${loopY}, ${x1 - NODE_W / 3} ${loopY} ` +
           `C ${x2 + NODE_W / 6} ${loopY}, ${x2 - H_GAP / 2} ${y2 - 10}, ${x2} ${y2}`,
        selfLoop: true,
      };
    }

    const midX = (x1 + x2) / 2;
    return {
      d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
      selfLoop: false,
    };
  }

  function nodeLabel(node) {
    return node.container ? node.container + '.' + node.name : node.name;
  }

  function render() {
    viewport.innerHTML = '';
    if (!state.graph || state.graph.nodes.length === 0) {
      stats.textContent = '';
      return;
    }

    const { positions, totalWidth, totalHeight } = layout();
    const byId = nodesById();

    stats.textContent = state.graph.file + ' — ' +
      state.graph.nodes.length + ' functions · ' +
      state.graph.edges.length + ' internal calls · ' +
      'avg complexity ' + averageComplexity();

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', Math.round(totalWidth * state.scale));
    svg.setAttribute('height', Math.round(totalHeight * state.scale));
    svg.setAttribute('data-size', totalWidth + 'x' + totalHeight);

    const wrapper = document.createElementNS(SVG_NS, 'g');
    wrapper.setAttribute('transform', 'scale(' + state.scale + ')');

    const edgesGroup = document.createElementNS(SVG_NS, 'g');
    edgesGroup.setAttribute('class', 'edges');

    state.graph.edges.forEach((edge, index) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) {
        return;
      }
      const path = document.createElementNS(SVG_NS, 'path');
      const geometry = edgePath(from, to);
      const isSelfLoop = from === to;
      path.setAttribute('d', geometry.d);
      path.setAttribute('class', isSelfLoop ? 'edge self' : 'edge');
      path.setAttribute('marker-end', 'url(#arrow)');
      path.setAttribute('data-edge', index);
      path.setAttribute('data-from', edge.from);
      path.setAttribute('data-to', edge.to);
      edgesGroup.appendChild(path);
    });

    const nodesGroup = document.createElementNS(SVG_NS, 'g');
    nodesGroup.setAttribute('class', 'nodes');

    state.graph.nodes.forEach((node) => {
      const position = positions.get(node.id);
      if (!position) {
        return;
      }
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'node kind-' + node.kind);
      group.setAttribute('data-id', node.id);
      group.setAttribute('transform', 'translate(' + position.x + ',' + position.y + ')');
      group.setAttribute('tabindex', '0');

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('rx', '8');
      rect.setAttribute('width', NODE_W);
      rect.setAttribute('height', NODE_H);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'node-name');
      label.setAttribute('x', '12');
      label.setAttribute('y', '19');
      label.textContent = truncate(nodeLabel(node), 24);

      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('class', 'node-sub');
      sub.setAttribute('x', '12');
      sub.setAttribute('y', '34');
      sub.textContent = node.kind + ' · cx ' + node.complexity + ' · L' + (node.line + 1);

      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = nodeLabel(node) + '(' + node.params + ') — line ' + (node.line + 1);

      group.appendChild(rect);
      group.appendChild(label);
      group.appendChild(sub);
      group.appendChild(title);
      nodesGroup.appendChild(group);
    });

    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML =
      '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M 0 0 L 10 5 L 0 10 z" class="arrow-head"></path></marker>';

    wrapper.appendChild(defs);
    wrapper.appendChild(edgesGroup);
    wrapper.appendChild(nodesGroup);
    svg.appendChild(wrapper);
    viewport.appendChild(svg);

    applySelection();
  }

  function averageComplexity() {
    const nodes = state.graph.nodes;
    const sum = nodes.reduce((acc, node) => acc + node.complexity, 0);
    return (sum / nodes.length).toFixed(1);
  }

  function truncate(text, max) {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function applySelection() {
    const selected = state.selected;
    viewport.querySelectorAll('.node').forEach((element) => {
      element.classList.toggle('selected', !!selected && element.getAttribute('data-id') === selected);
    });
    viewport.querySelectorAll('.edge').forEach((element) => {
      const active = !!selected &&
        (element.getAttribute('data-from') === selected || element.getAttribute('data-to') === selected);
      element.classList.toggle('active', active);
    });
  }

  function selectNode(id, revealInCode) {
    state.selected = id;
    applySelection();
    showDetail(id);
    if (revealInCode) {
      vscode.postMessage({ type: 'select', id: id });
    }
  }

  function showDetail(id) {
    const node = state.graph.nodes.find((candidate) => candidate.id === id);
    if (!node) {
      return;
    }
    detailEmpty.classList.add('hidden');
    detailBody.classList.remove('hidden');

    document.getElementById('detail-name').textContent = nodeLabel(node) + '(' + node.params + ')';
    document.getElementById('detail-meta').innerHTML =
      '<span class="chip kind">' + node.kind + '</span>' +
      '<span class="chip">lines ' + (node.line + 1) + '–' + (node.endLine + 1) + '</span>' +
      '<span class="chip">complexity ' + node.complexity + '</span>';

    const docSection = document.getElementById('detail-doc-section');
    const docText = document.getElementById('detail-doc');
    if (node.doc) {
      docText.textContent = node.doc;
      docSection.classList.remove('hidden');
    } else {
      docText.textContent = '';
      docSection.classList.add('hidden');
    }

    const callsSection = document.getElementById('detail-calls-section');
    const callsList = document.getElementById('detail-calls');
    callsList.innerHTML = '';
    const calledLocally = state.graph.edges
      .filter((edge) => edge.from === id)
      .map((edge) => state.graph.nodes.find((candidate) => candidate.id === edge.to))
      .filter(Boolean);
    const callers = state.graph.edges
      .filter((edge) => edge.to === id)
      .map((edge) => state.graph.nodes.find((candidate) => candidate.id === edge.from))
      .filter(Boolean);

    calledLocally.forEach((target) => {
      callsList.appendChild(listItem('→ ' + nodeLabel(target), target.id));
    });
    callers.forEach((caller) => {
      callsList.appendChild(listItem('← ' + nodeLabel(caller), caller.id));
    });
    node.callsExternal.forEach((external) => {
      callsList.appendChild(listItem('⤴ ' + external + ' (external)', null));
    });

    if (calledLocally.length === 0 && callers.length === 0 && node.callsExternal.length === 0) {
      callsSection.classList.add('hidden');
    } else {
      callsSection.classList.remove('hidden');
    }
  }

  function listItem(text, nodeId) {
    const li = document.createElement('li');
    li.textContent = text;
    if (nodeId) {
      li.classList.add('link');
      li.addEventListener('click', () => selectNode(nodeId, false));
    }
    return li;
  }

  viewport.addEventListener('click', (event) => {
    const target = event.target.closest('.node');
    if (target) {
      selectNode(target.getAttribute('data-id'), event.detail === 2);
    }
  });

  viewport.addEventListener('keydown', (event) => {
    const target = event.target.closest('.node');
    if (target && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selectNode(target.getAttribute('data-id'), false);
    }
  });

  document.getElementById('reveal').addEventListener('click', () => {
    if (state.selected) {
      vscode.postMessage({ type: 'select', id: state.selected });
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
