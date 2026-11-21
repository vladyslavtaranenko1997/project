import * as vscode from 'vscode';
import type { Graph } from './analyzer';

export function buildDiagramHtml(webview: vscode.Webview, extensionUri: vscode.Uri, graph: Graph): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
  const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.css'));
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Atlas</title>
  <link href="${stylesUri}" rel="stylesheet">
</head>
<body>
  <div id="app">
    <aside id="detail" aria-label="Function details">
      <div id="detail-empty">Select a node in the diagram to inspect it.</div>
      <div id="detail-body" class="hidden">
        <h2 id="detail-name"></h2>
        <div id="detail-meta"></div>
        <div id="detail-params"></div>
        <section id="detail-doc-section"><h3>Documentation</h3><pre id="detail-doc"></pre></section>
        <section id="detail-calls-section"><h3>Calls</h3><ul id="detail-calls"></ul></section>
        <button id="reveal">Reveal in code &rarr;</button>
      </div>
    </aside>
    <main id="canvas">
      <header id="stats"></header>
      <div id="viewport" tabindex="0"></div>
    </main>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
