import * as vscode from 'vscode';
import * as path from 'path';
import { getNonce } from './utils';
import { generateThemeTokenCss, generateSymbolKindCss } from './theme';

interface SymbolSearchResultItem {
  name: string;
  containerName: string;
  kind: string;
  uri: string;
  relativePath: string;
  line: number;
  character: number;
}

export class SymbolSearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'symbolSearch.view';

  private _view?: vscode.WebviewView;
  private _searchSeq = 0;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  pushThemeColors(): void {
    if (!this._view) { return; }
    this._view.webview.postMessage({
      type: 'themeColors',
      css: generateThemeTokenCss() + generateSymbolKindCss(),
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'ready') {
        this.pushThemeColors();
        webviewView.webview.postMessage({
          type: 'results',
          requestId: 0,
          query: '',
          items: [],
          total: 0,
        });
        return;
      }

      if (msg.type === 'queryChange') {
        const query = typeof msg.query === 'string' ? msg.query : '';
        const requestId = typeof msg.requestId === 'number' ? msg.requestId : 0;
        await this._search(query, requestId);
        return;
      }

      if (msg.type === 'openLocation') {
        const uriRaw = typeof msg.uri === 'string' ? msg.uri : '';
        const line = typeof msg.line === 'number' ? msg.line : 0;
        const character = typeof msg.character === 'number' ? msg.character : 0;
        if (!uriRaw) { return; }
        await this._openLocation(vscode.Uri.parse(uriRaw), line, character);
      }
    });
  }

  private async _search(query: string, requestId: number): Promise<void> {
    if (!this._view) { return; }

    const trimmed = query.trim();
    const currentSeq = ++this._searchSeq;

    if (!trimmed) {
      this._view.webview.postMessage({
        type: 'results',
        requestId,
        query: '',
        items: [] as SymbolSearchResultItem[],
        total: 0,
      });
      return;
    }

    this._view.webview.postMessage({ type: 'loading', requestId, query: trimmed });

    let rawItems: vscode.SymbolInformation[] = [];
    try {
      const result = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        trimmed
      );
      rawItems = result ?? [];
    } catch {
      rawItems = [];
    }

    if (!this._view || currentSeq !== this._searchSeq) {
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const maxResults = 300;
    const items = rawItems.slice(0, maxResults).map((item) => {
      const fsPath = item.location.uri.fsPath;
      const relativePath = workspaceRoot
        ? path.relative(workspaceRoot, fsPath).replace(/\\/g, '/')
        : fsPath;
      return {
        name: item.name,
        containerName: item.containerName ?? '',
        kind: this._kindToString(item.kind),
        uri: item.location.uri.toString(),
        relativePath,
        line: item.location.range.start.line,
        character: item.location.range.start.character,
      } satisfies SymbolSearchResultItem;
    });

    this._view.webview.postMessage({
      type: 'results',
      requestId,
      query: trimmed,
      items,
      total: rawItems.length,
    });
  }

  private async _openLocation(uri: vscode.Uri, line: number, character: number): Promise<void> {
    const safeLine = Math.max(0, line);
    const safeCharacter = Math.max(0, character);
    const pos = new vscode.Position(safeLine, safeCharacter);
    const range = new vscode.Range(pos, pos);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false, preview: false });
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private _kindToString(kind: vscode.SymbolKind): string {
    switch (kind) {
      case vscode.SymbolKind.File: return 'File';
      case vscode.SymbolKind.Module: return 'Module';
      case vscode.SymbolKind.Namespace: return 'Namespace';
      case vscode.SymbolKind.Package: return 'Package';
      case vscode.SymbolKind.Class: return 'Class';
      case vscode.SymbolKind.Method: return 'Method';
      case vscode.SymbolKind.Property: return 'Property';
      case vscode.SymbolKind.Field: return 'Field';
      case vscode.SymbolKind.Constructor: return 'Constructor';
      case vscode.SymbolKind.Enum: return 'Enum';
      case vscode.SymbolKind.Interface: return 'Interface';
      case vscode.SymbolKind.Function: return 'Function';
      case vscode.SymbolKind.Variable: return 'Variable';
      case vscode.SymbolKind.Constant: return 'Constant';
      case vscode.SymbolKind.String: return 'String';
      case vscode.SymbolKind.Number: return 'Number';
      case vscode.SymbolKind.Boolean: return 'Boolean';
      case vscode.SymbolKind.Array: return 'Array';
      case vscode.SymbolKind.Object: return 'Object';
      case vscode.SymbolKind.Key: return 'Key';
      case vscode.SymbolKind.Null: return 'Null';
      case vscode.SymbolKind.EnumMember: return 'EnumMember';
      case vscode.SymbolKind.Struct: return 'Struct';
      case vscode.SymbolKind.Event: return 'Event';
      case vscode.SymbolKind.Operator: return 'Operator';
      case vscode.SymbolKind.TypeParameter: return 'TypeParameter';
      default: return 'Symbol';
    }
  }

  private _getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Symbol Search</title>
  <style nonce="${nonce}">
    :root {
      --pm-border: var(--vscode-panel-border, var(--vscode-editorWidget-border));
      --pm-fg-muted: var(--vscode-descriptionForeground, var(--vscode-foreground));
      --pm-bg-hover: var(--vscode-list-hoverBackground, var(--vscode-editorHoverWidget-background));
      --pm-bg-active: var(--vscode-list-activeSelectionBackground, var(--vscode-list-inactiveSelectionBackground));
      --pm-fg-active: var(--vscode-list-activeSelectionForeground, var(--vscode-list-inactiveSelectionForeground, var(--vscode-foreground)));
    }

    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      padding: 10px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font: 12px/1.45 var(--vscode-font-family);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .input-wrap {
      border: 1px solid var(--pm-border);
      border-radius: 6px;
      overflow: hidden;
      background: var(--vscode-input-background);
    }

    #queryInput {
      width: 100%;
      border: 0;
      outline: none;
      padding: 8px 10px;
      color: var(--vscode-input-foreground);
      background: transparent;
      font: inherit;
    }

    #queryInput::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .status {
      color: var(--pm-fg-muted);
      min-height: 18px;
    }

    .list {
      flex: 1;
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--pm-border);
      border-radius: 6px;
    }

    .item {
      width: 100%;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--pm-border);
      cursor: pointer;
      display: grid;
      gap: 2px;
    }

    .item:last-child {
      border-bottom: 0;
    }

    .item:hover {
      background: var(--pm-bg-hover);
    }

    .item:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
      background: var(--pm-bg-active);
      color: var(--pm-fg-active);
    }

    .row-1 {
      display: flex;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
    }

    .name {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kind {
      color: var(--peek-kind-Function, var(--pm-fg-muted));
      font-size: 11px;
      white-space: nowrap;
    }

    .row-2 {
      color: var(--pm-fg-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
    }

    .empty {
      padding: 14px 10px;
      color: var(--pm-fg-muted);
    }
  </style>
</head>
<body>
  <div class="input-wrap">
    <input id="queryInput" type="text" placeholder="Search workspace symbols..." />
  </div>
  <div id="status" class="status">Type to search symbols in workspace.</div>
  <div id="resultList" class="list"></div>

  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    const queryInput = document.getElementById('queryInput');
    const statusEl = document.getElementById('status');
    const listEl = document.getElementById('resultList');

    let requestId = 0;
    let debounceTimer = undefined;

    function escapeHtml(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function sendQuery() {
      requestId += 1;
      vscodeApi.postMessage({
        type: 'queryChange',
        requestId,
        query: queryInput.value,
      });
    }

    function onInput() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(sendQuery, 120);
    }

    function renderItems(items) {
      if (!items || items.length === 0) {
        listEl.innerHTML = '<div class="empty">No symbols found.</div>';
        return;
      }

      listEl.innerHTML = items.map((item) => {
        const name = escapeHtml(item.name || '');
        const kind = escapeHtml(item.kind || 'Symbol');
        const container = escapeHtml(item.containerName || '');
        const relativePath = escapeHtml(item.relativePath || '');
        const line = Number(item.line || 0) + 1;
        const character = Number(item.character || 0);
        const containerPart = container ? container + ' · ' : '';
        return '<button class="item" data-uri="' + escapeHtml(item.uri || '') + '" data-line="' + (line - 1) + '" data-character="' + character + '">' +
          '<div class="row-1">' +
            '<span class="name">' + name + '</span>' +
            '<span class="kind">' + kind + '</span>' +
          '</div>' +
          '<div class="row-2">' + containerPart + relativePath + ':L' + line + '</div>' +
        '</button>';
      }).join('');
    }

    listEl.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest('.item');
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const uri = button.dataset.uri || '';
      const line = Number(button.dataset.line || '0');
      const character = Number(button.dataset.character || '0');
      if (!uri) {
        return;
      }
      vscodeApi.postMessage({
        type: 'openLocation',
        uri,
        line,
        character,
      });
    });

    queryInput.addEventListener('input', onInput);

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') {
        return;
      }

      if (msg.type === 'themeColors') {
        let themeStyle = document.getElementById('themeStyle');
        if (!themeStyle) {
          themeStyle = document.createElement('style');
          themeStyle.id = 'themeStyle';
          document.head.appendChild(themeStyle);
        }
        themeStyle.textContent = String(msg.css || '');
        return;
      }

      if (msg.type === 'loading') {
        if (typeof msg.requestId === 'number' && msg.requestId !== requestId) {
          return;
        }
        statusEl.textContent = 'Searching...';
        return;
      }

      if (msg.type === 'results') {
        if (typeof msg.requestId === 'number' && msg.requestId !== requestId && msg.requestId !== 0) {
          return;
        }
        const query = String(msg.query || '').trim();
        const total = Number(msg.total || 0);
        if (!query) {
          statusEl.textContent = 'Type to search symbols in workspace.';
          listEl.innerHTML = '<div class="empty">Enter a keyword to start searching.</div>';
          return;
        }
        statusEl.textContent = total > 300
          ? ('Showing first 300 results (total ' + total + ').')
          : (total + ' result' + (total === 1 ? '' : 's') + '.');
        renderItems(Array.isArray(msg.items) ? msg.items : []);
      }
    });

    vscodeApi.postMessage({ type: 'ready' });
    queryInput.focus();
  </script>
</body>
</html>`;
  }
}
