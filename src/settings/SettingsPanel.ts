import * as vscode from "vscode";
import { getResolvedConfig } from "../config/settings";
import { updateStoreValue } from "../config/store";

export class SettingsPanel {
  private static currentPanel: SettingsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;

  static show(extensionUri: vscode.Uri) {
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
      SettingsPanel.currentPanel.sendConfig();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "codeAssistant.settings",
      "Code Assistant Settings",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => {
      SettingsPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "getConfig":
          this.sendConfig();
          break;
        case "updateProviders":
          if (Array.isArray(data.providers)) {
            await updateStoreValue("providers", data.providers);
            if (typeof data.activeProvider === "string") {
              await updateStoreValue("activeProvider", data.activeProvider);
            }
            if (typeof data.activeModel === "string") {
              await updateStoreValue("activeModel", data.activeModel);
            }
            if (typeof data.maxTokens === "number") {
              await updateStoreValue(
                "maxTokens",
                Math.max(1, Math.floor(data.maxTokens)),
              );
            }
            if (typeof data.temperature === "number") {
              const temp = Math.max(0, Math.min(2, data.temperature));
              await updateStoreValue("temperature", temp);
            }
            this.sendConfig();
            await vscode.commands.executeCommand("codeAssistant.refreshConfig");
          }
          break;
      }
    });

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("codeAssistant")) {
        this.sendConfig();
      }
    });
  }

  private sendConfig() {
    const resolved = getResolvedConfig();
    this.panel.webview.postMessage({
      type: "config",
      config: {
        providers: resolved.providers,
        activeProvider: resolved.activeProvider,
        activeModel: resolved.activeModel,
      },
    });
  }

  private getHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Assistant Settings</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 16px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    h1 {
      font-size: 16px;
      margin: 0;
    }

    .section {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
      background: var(--vscode-sideBar-background);
    }

    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .input {
      flex: 1;
      min-width: 160px;
      padding: 6px 8px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-size: 12px;
    }

    .select {
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 12px;
      min-width: 180px;
    }

    .btn {
      padding: 4px 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      font-size: 12px;
      cursor: pointer;
    }

    .btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn.danger {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }

    .model-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
      padding: 8px;
      border-radius: 6px;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-panel-border);
    }

    .model-row > .row {
      margin-bottom: 0;
    }

    .model-row-actions {
      display: flex;
      justify-content: flex-end;
    }

    .hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Code Assistant 设置</h1>
    <button class="btn primary" id="saveBtn">保存</button>
  </div>

  <div class="section">
    <div class="row">
      <select class="select" id="providerSelect"></select>
      <button class="btn" id="addProviderBtn">新增服务</button>
      <button class="btn danger" id="removeProviderBtn">删除服务</button>
    </div>
    <div class="row">
      <input class="input" id="providerNameInput" placeholder="服务显示名称" />
      <input class="input" id="providerBaseInput" placeholder="Base URL" />
      <input class="input" id="providerKeyInput" placeholder="API Key" />
    </div>
    <div class="row">
      <select class="select" id="activeProviderSelect" title="当前使用的服务"></select>
    </div>
  </div>

    <div class="section">
      <div class="row">
        <button class="btn" id="addModelBtn">新增模型</button>
      </div>
      <div id="modelList"></div>
      <div class="row">
        <select class="select" id="activeModelSelect" title="当前使用的模型"></select>
      </div>
    <div class="hint">模型字段：显示名称（UI）、模型实际名称（请求用）、模型说明、maxTokens、temperature。</div>
    </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      const providerSelect = document.getElementById('providerSelect');
      const activeProviderSelect = document.getElementById('activeProviderSelect');
      const providerNameInput = document.getElementById('providerNameInput');
      const providerBaseInput = document.getElementById('providerBaseInput');
      const providerKeyInput = document.getElementById('providerKeyInput');
      const addProviderBtn = document.getElementById('addProviderBtn');
      const removeProviderBtn = document.getElementById('removeProviderBtn');
      const addModelBtn = document.getElementById('addModelBtn');
      const modelList = document.getElementById('modelList');
      const activeModelSelect = document.getElementById('activeModelSelect');
      const saveBtn = document.getElementById('saveBtn');

      let providers = [];
      let activeProvider = '';
      let activeModel = '';

      vscode.postMessage({ type: 'getConfig' });

      function createUniqueProviderName() {
        let index = providers.length + 1;
        let name = 'Provider ' + index;
        const exists = (n) => providers.some((p) => p.displayName === n);
        while (exists(name)) {
          index += 1;
          name = 'Provider ' + index;
        }
        return name;
      }

      function getActiveProvider() {
        return providers.find((provider) => provider.displayName === activeProvider);
      }

      function setSelectOptions(selectEl, options, selectedValue) {
        selectEl.innerHTML = '';
        options.forEach((option) => {
          const opt = document.createElement('option');
          opt.value = option.value;
          opt.textContent = option.label;
          if (option.value === selectedValue) {
            opt.selected = true;
          }
          selectEl.appendChild(opt);
        });
      }

      function render() {
        setSelectOptions(
          providerSelect,
          providers.map((p) => ({ value: p.displayName, label: p.displayName || p.baseUrl || 'Provider' })),
          activeProvider
        );
        setSelectOptions(
          activeProviderSelect,
          providers.map((p) => ({ value: p.displayName, label: p.displayName || p.baseUrl || 'Provider' })),
          activeProvider
        );

        const provider = getActiveProvider();
        if (!provider) {
          providerNameInput.value = '';
          providerBaseInput.value = '';
          providerKeyInput.value = '';
          modelList.innerHTML = '<div class="hint">请先新增服务。</div>';
          activeModelSelect.innerHTML = '';
          return;
        }

        providerNameInput.value = provider.displayName || '';
        providerBaseInput.value = provider.baseUrl || '';
        providerKeyInput.value = provider.apiKey || '';

        modelList.innerHTML = '';
        if (!provider.models || provider.models.length === 0) {
          modelList.innerHTML = '<div class="hint">请先添加模型。</div>';
        } else {
          provider.models.forEach((model, index) => {
            const row = document.createElement('div');
            row.className = 'model-row';

            const line1 = document.createElement('div');
            line1.className = 'row';

            const nameInput = document.createElement('input');
            nameInput.className = 'input';
            nameInput.placeholder = '显示名称（UI）';
            nameInput.value = model.displayName || '';
            nameInput.addEventListener('input', () => {
              model.displayName = nameInput.value.trim();
            });

            const modelInput = document.createElement('input');
            modelInput.className = 'input';
            modelInput.placeholder = '模型实际名称（请求用）';
            modelInput.value = model.model || '';
            modelInput.addEventListener('input', () => {
              model.model = modelInput.value.trim();
            });

            line1.appendChild(nameInput);
            line1.appendChild(modelInput);

            const line2 = document.createElement('div');
            line2.className = 'row';

            const descInput = document.createElement('input');
            descInput.className = 'input';
            descInput.placeholder = '模型说明';
            descInput.value = model.description || '';
            descInput.addEventListener('input', () => {
              model.description = descInput.value.trim();
            });

            const maxTokensInput = document.createElement('input');
            maxTokensInput.className = 'input';
            maxTokensInput.type = 'number';
            maxTokensInput.min = '1';
            maxTokensInput.placeholder = 'MaxTokens（留空不限制）';
            maxTokensInput.value = model.maxTokens ? String(model.maxTokens) : '';
            maxTokensInput.addEventListener('input', () => {
              const value = Number(maxTokensInput.value);
              if (!Number.isNaN(value) && value > 0) {
                model.maxTokens = Math.floor(value);
              } else {
                delete model.maxTokens;
              }
            });

            const temperatureInput = document.createElement('input');
            temperatureInput.className = 'input';
            temperatureInput.type = 'number';
            temperatureInput.min = '0';
            temperatureInput.max = '2';
            temperatureInput.step = '0.1';
            temperatureInput.placeholder = 'Temperature（默认 0.7）';
            temperatureInput.value =
              typeof model.temperature === 'number' ? String(model.temperature) : '0.7';
            temperatureInput.addEventListener('input', () => {
              const value = Number(temperatureInput.value);
              if (!Number.isNaN(value)) {
                model.temperature = Math.max(0, Math.min(2, value));
              } else if (!temperatureInput.value) {
                delete model.temperature;
              }
            });

            const actions = document.createElement('div');
            actions.className = 'model-row-actions';

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn danger';
            removeBtn.textContent = '删除';
            removeBtn.addEventListener('click', () => {
              provider.models.splice(index, 1);
              render();
            });

            actions.appendChild(removeBtn);
            line2.appendChild(descInput);
            line2.appendChild(maxTokensInput);
            line2.appendChild(temperatureInput);
            line2.appendChild(actions);

            row.appendChild(line1);
            row.appendChild(line2);
            modelList.appendChild(row);
          });
        }

        const modelOptions = (provider.models || [])
          .filter((m) => m.model)
          .map((m) => ({ value: m.model, label: m.displayName || m.model }));

        setSelectOptions(activeModelSelect, modelOptions, activeModel);

      }

      providerSelect.addEventListener('change', () => {
        activeProvider = providerSelect.value;
        render();
      });

      activeProviderSelect.addEventListener('change', () => {
        activeProvider = activeProviderSelect.value;
        render();
      });

      providerNameInput.addEventListener('input', () => {
        const provider = getActiveProvider();
        if (!provider) return;
        provider.displayName = providerNameInput.value.trim();
        activeProvider = provider.displayName;
        render();
      });

      providerBaseInput.addEventListener('input', () => {
        const provider = getActiveProvider();
        if (!provider) return;
        provider.baseUrl = providerBaseInput.value.trim();
      });

      providerKeyInput.addEventListener('input', () => {
        const provider = getActiveProvider();
        if (!provider) return;
        provider.apiKey = providerKeyInput.value.trim();
      });

      addProviderBtn.addEventListener('click', () => {
        const name = createUniqueProviderName();
        providers.push({
          displayName: name,
          baseUrl: '',
          apiKey: '',
          models: [],
        });
        activeProvider = name;
        render();
      });

      removeProviderBtn.addEventListener('click', () => {
        providers = providers.filter((provider) => provider.displayName !== activeProvider);
        activeProvider = providers[0] ? providers[0].displayName : '';
        activeModel = '';
        render();
      });

      addModelBtn.addEventListener('click', () => {
        const provider = getActiveProvider();
        if (!provider) return;
        provider.models.push({ displayName: 'New Model', model: '', description: '' });
        render();
      });

      activeModelSelect.addEventListener('change', () => {
        activeModel = activeModelSelect.value;
      });

      saveBtn.addEventListener('click', () => {
        const provider = getActiveProvider();
        if (provider && provider.models.length > 0) {
          const firstModel = provider.models.find((m) => m.model) || provider.models[0];
          if (!activeModel || !provider.models.some((m) => m.model === activeModel)) {
            activeModel = firstModel.model || '';
          }
        } else {
          activeModel = '';
        }
        vscode.postMessage({
          type: 'updateProviders',
          providers,
          activeProvider,
          activeModel,
        });
      });

      window.addEventListener('message', (event) => {
        const data = event.data;
        if (data.type === 'config') {
          providers = Array.isArray(data.config.providers) ? data.config.providers : [];
          activeProvider = data.config.activeProvider || (providers[0] && providers[0].displayName) || '';
          const provider = providers.find((p) => p.displayName === activeProvider);
          const firstModel = provider && provider.models && provider.models[0] ? provider.models[0].model : '';
          activeModel = data.config.activeModel || firstModel || '';
          render();
        }
      });
    })();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
