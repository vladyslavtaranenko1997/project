import * as vscode from 'vscode';
import { analyzeSource, isSupportedFile, type Graph, type FuncInfo } from './analyzer';
import { graphToMermaid } from './mermaid';
import { buildDiagramHtml } from './webview';

const SUPPORTED_LANGUAGES = new Set([
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
]);

function analyzeDocument(document: vscode.TextDocument): Graph | null {
  if (!SUPPORTED_LANGUAGES.has(document.languageId) && !isSupportedFile(document.fileName)) {
    return null;
  }
  return analyzeSource(document.getText(), vscode.workspace.asRelativePath(document.uri, false) || document.fileName);
}

function activateExtension(context: vscode.ExtensionContext): void {
  const panels = new WeakMap<vscode.WebviewPanel, { documentUri: vscode.Uri; graph: Graph | null }>();

  const showDiagram = async (document: vscode.TextDocument): Promise<void> => {
    const graph = analyzeDocument(document);
    if (!graph) {
      void vscode.window.showWarningMessage('Code Atlas: this file type is not supported (use TypeScript/JavaScript).');
      return;
    }
    if (graph.nodes.length === 0) {
      void vscode.window.showInformationMessage(`Code Atlas: no functions found in ${graph.file}.`);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'codeAtlasDiagram',
      `Atlas: ${graph.file}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );
    panels.set(panel, { documentUri: document.uri, graph });
    panel.webview.html = buildDiagramHtml(panel.webview, context.extensionUri, graph);

    panel.webview.onDidReceiveMessage(
      async (message: { type: string; id?: string }) => {
        if (message.type === 'ready') {
          const entry = panels.get(panel);
          if (entry?.graph) {
            void panel.webview.postMessage({ type: 'graph', graph: entry.graph });
          }
          return;
        }
        if (message.type !== 'select' || typeof message.id !== 'string') {
          return;
        }
        const entry = panels.get(panel);
        if (!entry || !entry.graph) {
          return;
        }
        const node = entry.graph.nodes.find((candidate: FuncInfo) => candidate.id === message.id);
        if (!node) {
          return;
        }
        const editor = await vscode.window.showTextDocument(entry.documentUri, { preview: true, viewColumn: vscode.ViewColumn.One });
        const position = new vscode.Position(node.line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      },
      undefined,
      context.subscriptions,
    );

    panel.onDidDispose(() => panels.delete(panel), undefined, context.subscriptions);
  };

  const copyMermaid = async (document: vscode.TextDocument): Promise<void> => {
    const graph = analyzeDocument(document);
    if (!graph || graph.nodes.length === 0) {
      void vscode.window.showInformationMessage('Code Atlas: nothing to copy — no functions found.');
      return;
    }
    const direction = vscode.workspace.getConfiguration('code-atlas').get<string>('layoutDirection', 'LR');
    const mermaid = graphToMermaid(graph, direction === 'TB' ? 'TB' : 'LR');
    await vscode.env.clipboard.writeText(mermaid);
    void vscode.window.showInformationMessage(`Code Atlas: Mermaid flowchart for ${graph.nodes.length} nodes copied to clipboard.`);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('code-atlas.showDiagram', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await showDiagram(editor.document);
        return;
      }
      const pick = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'TypeScript/JavaScript': ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'] },
      });
      if (pick && pick[0]) {
        const doc = await vscode.workspace.openTextDocument(pick[0]);
        await showDiagram(doc);
      }
    }),
    vscode.commands.registerCommand('code-atlas.copyMermaid', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await copyMermaid(editor.document);
      }
    }),
  );
}

export function activate(context: vscode.ExtensionContext): void {
  activateExtension(context);
}

export function deactivate(): void {
  /* no persistent resources to release */
}
