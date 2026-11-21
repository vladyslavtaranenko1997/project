import type { Edge, Graph, FuncInfo } from './analyzer';

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

function escapeLabel(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function graphToMermaid(graph: Graph, direction: 'LR' | 'TB' = 'LR'): string {
  const lines: string[] = [`flowchart ${direction}`];

  graph.nodes.forEach((node: FuncInfo, index: number) => {
    const id = sanitize(node.id) || `n${index}`;
    const label = node.container ? `${node.container}.${node.name}` : node.name;
    const kind = node.kind !== 'function' ? ` /${node.kind}` : '';
    lines.push(`    ${id}["${escapeLabel(label)}${kind}"]`);
  });

  graph.edges.forEach((edge: Edge) => {
    lines.push(`    ${sanitize(edge.from)} --> ${sanitize(edge.to)}`);
  });

  if (graph.nodes.length > 0 && graph.edges.length > 0) {
    lines.push('    classDef default fill:#82aaff,stroke:#4066a8,color:#ffffff');
  }

  return lines.join('\n');
}
