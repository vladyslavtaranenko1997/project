import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

await build({
  entryPoints: ['src/analyzer.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: '/tmp/code-atlas-analyzer.cjs',
  logLevel: 'silent',
});
const { analyzeSource } = await import(pathToFileURL('/tmp/code-atlas-analyzer.cjs'));

const sample = await readFile('samples/ai_generated_report.ts', 'utf8');
const graph = analyzeSource(sample, 'ai_generated_report.ts');

const css = await readFile('media/main.css', 'utf8');
const js = await readFile('media/main.js', 'utf8');
const template = await readFile('docs/index.template.html', 'utf8');

const escapedJson = JSON.stringify(graph).replace(/</g, '\\u003c');

const html = template
  .replace('<link href="../media/main.css" rel="stylesheet">', `<style>\n${css}\n  </style>`)
  .replace('<script src="../media/main.js"></script>', `<script>\n${js}\n  </script>`)
  .replace('__GRAPH_JSON__', escapedJson);

if (html.includes('__GRAPH_JSON__') || html.includes('../media/')) {
  throw new Error('inlining failed');
}

await writeFile('docs/index.html', html);
console.log(`docs/index.html written, ${html.length} bytes, ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
