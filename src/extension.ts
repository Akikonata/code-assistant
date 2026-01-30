import * as vscode from "vscode";
import { SidebarProvider } from "./sidebar/SidebarProvider";
import { SettingsPanel } from "./settings/SettingsPanel";
import { initConfigStore } from "./config/store";
import { migrateFromWorkspaceSettings } from "./config/settings";

export function activate(context: vscode.ExtensionContext) {
  initConfigStore(context);
  void migrateFromWorkspaceSettings();

  // 创建侧边栏 Provider
  const sidebarProvider = new SidebarProvider(context.extensionUri, context);

  // 注册侧边栏 Webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "codeAssistant.sidebar",
      sidebarProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    ),
  );

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand("codeAssistant.newChat", () => {
      sidebarProvider.newChat();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codeAssistant.clearHistory", () => {
      sidebarProvider.clearHistory();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codeAssistant.openSettings", () => {
      SettingsPanel.show(context.extensionUri);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codeAssistant.refreshConfig", () => {
      sidebarProvider.refreshConfig();
    }),
  );
}

export function deactivate() {}
