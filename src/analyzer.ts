import ts from 'typescript';

export type FunctionKind = 'function' | 'method' | 'arrow' | 'function-expression' | 'constructor';

export interface FuncInfo {
  id: string;
  name: string;
  kind: FunctionKind;
  container?: string;
  params: string;
  doc: string;
  line: number;
  endLine: number;
  complexity: number;
  callsExternal: string[];
}

export interface Edge {
  from: string;
  to: string;
}

export interface Graph {
  file: string;
  nodes: FuncInfo[];
  edges: Edge[];
  externals: string[];
}

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export function scriptKindFor(fileName: string): ts.ScriptKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (lower.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

export function isSupportedFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) {
    return false;
  }
  return SUPPORTED_EXTENSIONS.has(fileName.slice(dot).toLowerCase());
}

function isTopLevelContainerParent(node: ts.Node): boolean {
  return ts.isSourceFile(node) || ts.isModuleBlock(node);
}

function declaredName(node: FunctionLikeNode): { key: string | undefined; name: string; kind: FunctionKind; container?: string } {
  const startPos = node.getStart();
  if (ts.isFunctionDeclaration(node)) {
    const name = node.name ? node.name.text : `anonymous@${startPos}`;
    return { key: node.name ? node.name.text : undefined, name, kind: 'function' };
  }
  if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    const parent = node.parent;
    const containerName = ts.isClassDeclaration(parent) || ts.isClassExpression(parent)
      ? parent.name?.text ?? '<anonymous class>'
      : ts.isObjectLiteralExpression(parent) ? '<object literal>' : '?';
    const methodName = ts.isConstructorDeclaration(node) ? 'constructor' : node.name!.getText();
    const full = `${containerName}.${methodName}`;
    return { key: full, name: methodName, kind: ts.isConstructorDeclaration(node) ? 'constructor' : 'method', container: containerName };
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      const kind = ts.isArrowFunction(node) ? 'arrow' : 'function-expression';
      return { key: parent.name.text, name: parent.name.text, kind };
    }
    if (ts.isPropertyDeclaration(parent)) {
      return { key: undefined, name: parent.name.getText(), kind: 'arrow', container: '<class field>' };
    }
    if (ts.isPropertyAssignment(parent)) {
      return { key: undefined, name: parent.name.getText(), kind: 'arrow', container: '<object literal>' };
    }
    return { key: undefined, name: `arrow@${startPos}`, kind: ts.isArrowFunction(node) ? 'arrow' : 'function-expression' };
  }
  return { key: undefined, name: `anonymous@${startPos}`, kind: 'function' };
}

type FunctionLikeNode = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ConstructorDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration;

function isFnLike(node: ts.Node): node is FunctionLikeNode {
  return ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
}

function collectDeclaredFunctions(sf: ts.SourceFile): FunctionLikeNode[] {
  const found: FunctionLikeNode[] = [];
  const isContainerParent = (parent: ts.Node): boolean =>
    isTopLevelContainerParent(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent) || ts.isObjectLiteralExpression(parent) || ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent);
  const visit = (node: ts.Node): void => {
    if (isFnLike(node) && isContainerParent(node.parent)) {
      found.push(node);
      return;
    }
    if (isFnLike(node)) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function nameToIdMap(functions: FunctionLikeNode[]): Map<string, string> {
  const map = new Map<string, string>();
  functions.forEach((fn, index) => {
    const info = declaredName(fn);
    if (info.key && !map.has(info.key)) {
      map.set(info.key, `n${index}`);
    }
  });
  return map;
}

function docCommentOf(node: FunctionLikeNode): string {
  const jsDoc = (node as unknown as { jsDoc?: readonly ts.JSDoc[] }).jsDoc;
  if (!jsDoc || jsDoc.length === 0) {
    return '';
  }
  return jsDoc
    .map((doc) => {
      const comment = doc.comment;
      if (!comment) {
        return '';
      }
      if (typeof comment === 'string') {
        return comment;
      }
      return comment.map((part) => part.getText()).join('');
    })
    .join('\n')
    .trim();
}

function callNameOf(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.getText();
  }
  if (ts.isElementAccessExpression(expr)) {
    return expr.getText();
  }
  return undefined;
}

function analyzeBody(fn: FunctionLikeNode, nameMap: Map<string, string>, declaredNodes: Set<ts.Node>): { callsLocal: Set<string>; callsExternal: Set<string>; complexity: number } {
  const callsLocal = new Set<string>();
  const callsExternal = new Set<string>();
  let complexity = 1;

  const countComplexity = (node: ts.Node): void => {
    if (isFnLike(node) && declaredNodes.has(node)) {
      return;
    }
    if (ts.isIfStatement(node) || ts.isConditionalExpression(node) || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isCatchClause(node) || ts.isCaseClause(node)) {
      complexity += 1;
    }
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      complexity += 1;
    }
    ts.forEachChild(node, countComplexity);
  };

  const collectCalls = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = callNameOf(node.expression);
      if (name) {
        if (ts.isIdentifier(node.expression)) {
          const target = nameMap.get(name);
          if (target) {
            callsLocal.add(name);
          } else {
            callsExternal.add(name);
          }
        } else {
          callsExternal.add(name.length > 60 ? name.slice(0, 57) + '…' : name);
        }
      }
    }
    if (isFnLike(node) && declaredNodes.has(node)) {
      return;
    }
    ts.forEachChild(node, collectCalls);
  };

  ts.forEachChild(fn, countComplexity);
  ts.forEachChild(fn, collectCalls);
  return { callsLocal, callsExternal, complexity };
}

export function analyzeSource(source: string, fileName: string): Graph {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const functions = collectDeclaredFunctions(sf);
  const nameMap = nameToIdMap(functions);
  const declaredNodes = new Set<ts.Node>(functions);

  const nodes: FuncInfo[] = [];
  const localNameToId = new Map<string, string>();
  const rawEdges: { fromId: string; localName: string }[] = [];
  const externals = new Set<string>();

  functions.forEach((fn, index) => {
    const id = `n${index}`;
    const { key, name, kind, container } = declaredName(fn);
    const start = sf.getLineAndCharacterOfPosition(fn.getStart(sf));
    const end = sf.getLineAndCharacterOfPosition(fn.getEnd());
    const { callsLocal, callsExternal, complexity } = analyzeBody(fn, nameMap, declaredNodes);

    nodes.push({
      id,
      name: name,
      kind,
      container,
      params: fn.parameters.map((p) => p.getText(sf)).join(', '),
      doc: docCommentOf(fn),
      line: start.line,
      endLine: end.line,
      complexity,
      callsExternal: [...callsExternal],
    });

    if (key) {
      localNameToId.set(key, id);
    }
    callsLocal.forEach((localName) => rawEdges.push({ fromId: id, localName }));
    callsExternal.forEach((external) => externals.add(external));
  });

  const edges = new Map<string, Edge>();
  rawEdges.forEach(({ fromId, localName }) => {
    const toId = localNameToId.get(localName);
    if (toId && toId !== fromId) {
      edges.set(`${fromId}->${toId}`, { from: fromId, to: toId });
    }
  });

  return {
    file: fileName,
    nodes,
    edges: [...edges.values()],
    externals: [...externals],
  };
}
