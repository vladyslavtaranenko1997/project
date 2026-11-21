# Code Atlas — Code Diagrams for VS Code

Code Atlas turns the active TypeScript/JavaScript file into an interactive
call-graph diagram, so you can understand unfamiliar or AI-generated code at a
glance: which functions exist, how they call each other, and where to start
reading.

## Features

- **Interactive diagram** (`Code Atlas: Show Diagram of Active File`): every
  function, method, arrow function, and constructor of the file becomes a node,
  with arrows for calls between them.
  - Click a node to inspect it: signature, kind, line range, complexity, doc
    comment, callees (local and external), and callers.
  - Double-click a node (or press the button in the inspector) to reveal the
    function in the editor.
  - Node colors follow the VS Code theme and distinguish function kinds.
- **Mermaid export** (`Code Atlas: Copy Diagram as Mermaid`): copies a
  `flowchart` snippet you can paste into GitHub Markdown, Notion, or the
  [Mermaid Live Editor](https://mermaid.live).
- Works with `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, including from the
  Editor context menu, Explorer context menu, and the Command Palette.

## Try it in the browser

A demo file is checked in at `demo/index.html`: open it directly in any
browser (double-click it, or `File > Open File…`).
It reuses the exact same renderer (`media/main.js`, `media/main.css`) and the
analyzer output for `samples/ai_generated_report.ts`, so what you see is what
the extension draws inside VS Code:

```bash
open demo/index.html   # macOS
```

## Why

Coding agents generate a lot of plausible-looking code. Before trusting it, you
want a map: who calls whom, which functions are doing the real work
(high complexity), and which parts are documented. Code Atlas gives you that
map in one keystroke, without leaving the editor.

## Commands

| Command | Default keybinding |
| --- | --- |
| `Code Atlas: Show Diagram of Active File` | *none (open the Command Palette)* |
| `Code Atlas: Copy Diagram as Mermaid` | *none* |

You can add keybindings via `Preferences: Open Keyboard Shortcuts`, for example
`{"key": "ctrl+alt+d", "command": "code-atlas.showDiagram"}`.

## Settings

- `code-atlas.layoutDirection`: `LR` (default) or `TB` — currently affects the
  Mermaid export; the diagram lays out left to right.

## Development

```bash
npm install
npm run compile   # typecheck + bundle with esbuild
npm run test      # analyzer self-test against samples/
npm run watch     # rebuild on change
```

Then press `F5` in VS Code to launch the Extension Development Host, open
`samples/ai_generated_report.ts`, and run **Code Atlas: Show Diagram of Active
File**.

### Packaging

```bash
npx @vscode/vsce package
```

Produces a `.vsix` you can install with `Extensions: Install from VSIX…`.

## Limitations

- Analysis is per-file; cross-file calls appear as external call names, not
  nodes.
- Calls are resolved by name at file scope, so overloads and shadowed names can
  be attributed imprecisely.

## License

MIT
