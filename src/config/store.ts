import * as vscode from "vscode";

let store: vscode.Memento | undefined;

export function initConfigStore(context: vscode.ExtensionContext) {
  store = context.globalState;
}

export function hasConfigStore(): boolean {
  return !!store;
}

export function getStoreValue<T>(key: string, defaultValue: T): T {
  if (!store) return defaultValue;
  return store.get<T>(key, defaultValue) as T;
}

export async function updateStoreValue<T>(
  key: string,
  value: T,
): Promise<void> {
  if (!store) return;
  await store.update(key, value);
}
