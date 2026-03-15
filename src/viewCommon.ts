import * as vscode from 'vscode';
import { generateThemeTokenCss, generateSymbolKindCss } from './theme';

const SYMBOL_KIND_NAMES: Partial<Record<vscode.SymbolKind, string>> = {
  [vscode.SymbolKind.File]: 'File',
  [vscode.SymbolKind.Module]: 'Module',
  [vscode.SymbolKind.Namespace]: 'Namespace',
  [vscode.SymbolKind.Package]: 'Package',
  [vscode.SymbolKind.Class]: 'Class',
  [vscode.SymbolKind.Method]: 'Method',
  [vscode.SymbolKind.Property]: 'Property',
  [vscode.SymbolKind.Field]: 'Field',
  [vscode.SymbolKind.Constructor]: 'Constructor',
  [vscode.SymbolKind.Enum]: 'Enum',
  [vscode.SymbolKind.Interface]: 'Interface',
  [vscode.SymbolKind.Function]: 'Function',
  [vscode.SymbolKind.Variable]: 'Variable',
  [vscode.SymbolKind.Constant]: 'Constant',
  [vscode.SymbolKind.String]: 'String',
  [vscode.SymbolKind.Number]: 'Number',
  [vscode.SymbolKind.Boolean]: 'Boolean',
  [vscode.SymbolKind.Array]: 'Array',
  [vscode.SymbolKind.Object]: 'Object',
  [vscode.SymbolKind.Key]: 'Key',
  [vscode.SymbolKind.Null]: 'Null',
  [vscode.SymbolKind.EnumMember]: 'EnumMember',
  [vscode.SymbolKind.Struct]: 'Struct',
  [vscode.SymbolKind.Event]: 'Event',
  [vscode.SymbolKind.Operator]: 'Operator',
  [vscode.SymbolKind.TypeParameter]: 'TypeParameter',
};

const SYMBOL_KIND_ICONS: Record<string, string> = {
  Function: '💿',
  Method: '📀',
  Class: '📱',
  Interface: '🔗',
  Variable: '🔷',
  Constant: '⭐',
  Property: '🟢',
  Field: '🟠',
  Enum: '🏷️',
  Module: '📦',
  Namespace: '📃',
  Struct: '💲',
  Constructor: '📲',
  File: '📄',
  Global: '🔵',
};

export function getThemeColorsCss(): string {
  return generateThemeTokenCss() + generateSymbolKindCss();
}

export function symbolKindToName(kind: vscode.SymbolKind): string {
  return SYMBOL_KIND_NAMES[kind] ?? 'Symbol';
}

export function buildKindIconFunction(functionName: string): string {
  return `
    function ${functionName}(kind) {
      const icons = ${JSON.stringify(SYMBOL_KIND_ICONS)};
      return icons[kind] || '•';
    }
  `;
}
