import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok  ${name}`);
  } else {
    failures.push(name);
    console.error(`FAIL  ${name} ${detail}`);
  }
}

const tmp = await mkdtemp(join(tmpdir(), 'code-atlas-'));
const bundlePath = join(tmp, 'analyzer.cjs');

await build({
  entryPoints: ['src/analyzer.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: bundlePath,
  logLevel: 'silent',
});

const { analyzeSource, isSupportedFile } = await import(pathToFileURL(bundlePath));

const sample = await readFile('samples/ai_generated_report.ts', 'utf8');
const graph = analyzeSource(sample, 'samples/ai_generated_report.ts');

const names = graph.nodes.map((node) => node.name);
check('finds top-level functions', ['generateReport', 'formatRow', 'summarize', 'runDefault'].every((n) => names.includes(n)), JSON.stringify(names));
check('finds class methods', graph.nodes.some((n) => n.container === 'Pipeline' && n.name === 'run'));
check('builds call edges', graph.edges.length >= 3, JSON.stringify(graph.edges));
check('generateReport -> formatRow edge', graph.edges.some((e) => {
  const from = graph.nodes.find((n) => n.id === e.from);
  const to = graph.nodes.find((n) => n.id === e.to);
  return from?.name === 'generateReport' && to?.name === 'formatRow';
}));
check('detects external calls', graph.externals.some((c) => c.includes('logger.info')), JSON.stringify(graph.externals));
const generateReport = graph.nodes.find((n) => n.name === 'generateReport');
check('counts complexity', generateReport.complexity >= 3, `complexity=${generateReport?.complexity}`);
check('extracts jsdoc', graph.nodes.every((n) => typeof n.doc === 'string'));
check('summarize complexity', (graph.nodes.find((n) => n.name === 'summarize')?.complexity ?? 0) >= 4);

check('supported file ts', isSupportedFile('a/b/c.ts'));
check('not supported file', !isSupportedFile('a/b/c.txt') && !isSupportedFile('noextension'));

const empty = analyzeSource('const x = 1;', 'empty.ts');
check('empty file yields no nodes', empty.nodes.length === 0 && empty.edges.length === 0);

await rm(tmp, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed.');
