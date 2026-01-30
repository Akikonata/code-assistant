import * as vscode from "vscode";
import { getStoreValue, hasConfigStore, updateStoreValue } from "./store";

export interface ModelOption {
  displayName: string;
  description?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ApiProviderConfig {
  displayName: string;
  baseUrl: string;
  apiKey: string;
  models: ModelOption[];
}

export interface CodeAssistantConfig {
  providers: ApiProviderConfig[];
  activeProvider: string;
  activeModel: string;
  maxTokens?: number;
  temperature: number;
  // Legacy fields for backward compatibility
  apiBase?: string;
  apiKey?: string;
  model?: string;
  customModel?: string;
}

function normalizeModelOption(raw: unknown): ModelOption | null {
  if (!raw || typeof raw !== "object") return null;
  const model =
    typeof (raw as { model?: unknown }).model === "string"
      ? (raw as { model?: string }).model
      : typeof (raw as { value?: unknown }).value === "string"
        ? (raw as { value?: string }).value
        : "";
  if (!model) return null;
  const displayName =
    typeof (raw as { displayName?: unknown }).displayName === "string" &&
    (raw as { displayName?: string }).displayName
      ? (raw as { displayName?: string }).displayName
      : typeof (raw as { label?: unknown }).label === "string" &&
          (raw as { label?: string }).label
        ? (raw as { label?: string }).label
        : model;
  const description =
    typeof (raw as { description?: unknown }).description === "string"
      ? (raw as { description?: string }).description
      : "";
  const maxTokens =
    typeof (raw as { maxTokens?: unknown }).maxTokens === "number"
      ? (raw as { maxTokens?: number }).maxTokens
      : undefined;
  const temperature =
    typeof (raw as { temperature?: unknown }).temperature === "number"
      ? (raw as { temperature?: number }).temperature
      : undefined;
  return { displayName, description, model, maxTokens, temperature };
}

function normalizeProvider(raw: unknown): ApiProviderConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const displayName =
    typeof (raw as { displayName?: unknown }).displayName === "string" &&
    (raw as { displayName?: string }).displayName
      ? (raw as { displayName?: string }).displayName
      : typeof (raw as { name?: unknown }).name === "string" &&
          (raw as { name?: string }).name
        ? (raw as { name?: string }).name
        : "Provider";
  const baseUrl =
    typeof (raw as { baseUrl?: unknown }).baseUrl === "string"
      ? (raw as { baseUrl?: string }).baseUrl
      : typeof (raw as { baseurl?: unknown }).baseurl === "string"
        ? (raw as { baseurl?: string }).baseurl
        : typeof (raw as { apiBase?: unknown }).apiBase === "string"
          ? (raw as { apiBase?: string }).apiBase
          : "";
  const apiKey =
    typeof (raw as { apiKey?: unknown }).apiKey === "string"
      ? (raw as { apiKey?: string }).apiKey
      : "";
  const rawModels = Array.isArray((raw as { models?: unknown }).models)
    ? ((raw as { models?: unknown }).models as unknown[])
    : [];
  const models = rawModels
    .map((model) => normalizeModelOption(model))
    .filter((model): model is ModelOption => !!model);
  return { displayName, baseUrl, apiKey, models };
}

function buildLegacyProvider(
  config: vscode.WorkspaceConfiguration,
): ApiProviderConfig {
  const baseUrl = config.get<string>("apiBase") || "";
  const apiKey = config.get<string>("apiKey") || "";
  const model = config.get<string>("model") || "";
  if (!baseUrl || !model) {
    return { displayName: "Legacy", baseUrl: "", apiKey: "", models: [] };
  }
  const displayName = "Legacy";
  return {
    displayName,
    baseUrl,
    apiKey,
    models: [{ displayName: model, model }],
  };
}

export function getProviders(): ApiProviderConfig[] {
  const rawProviders = getStoreValue<unknown[]>("providers", []);
  const providers = rawProviders
    .map((provider) => normalizeProvider(provider))
    .filter((provider): provider is ApiProviderConfig => !!provider);

  if (providers.length > 0) return providers;
  const config = vscode.workspace.getConfiguration("codeAssistant");
  const legacy = buildLegacyProvider(config);
  if (legacy.baseUrl) return [legacy];
  return [];
}

function resolveActiveProvider(
  providers: ApiProviderConfig[],
  preferredName: string,
): ApiProviderConfig {
  const preferred = providers.find(
    (provider) => provider.displayName === preferredName,
  );
  return preferred || providers[0];
}

export function getConfig(): CodeAssistantConfig {
  const providers = getProviders();
  const activeProvider = getStoreValue<string>("activeProvider", "");
  const activeModel = getStoreValue<string>("activeModel", "");

  return {
    providers,
    activeProvider,
    activeModel,
    maxTokens: undefined,
    temperature: 0.7,
    apiBase: "",
    apiKey: "",
    model: "",
    customModel: "",
  };
}

export function getResolvedConfig() {
  const providers = getProviders();
  const activeProviderName = getStoreValue<string>("activeProvider", "");
  const activeModel = getStoreValue<string>("activeModel", "");

  if (providers.length === 0) {
    return {
      providers: [],
      activeProvider: "",
      activeModel: "",
      provider: { displayName: "", baseUrl: "", apiKey: "", models: [] },
      model: "",
      maxTokens: undefined,
      temperature: 0.7,
      hasApiKey: false,
    };
  }

  const provider = resolveActiveProvider(providers, activeProviderName);
  const resolvedModel =
    provider.models.find((model) => model.model === activeModel)?.model ||
    provider.models[0]?.model ||
    "";

  const selectedModel = provider.models.find(
    (modelOption) => modelOption.model === resolvedModel,
  );

  return {
    providers,
    activeProvider: provider.displayName,
    activeModel: resolvedModel,
    provider,
    model: resolvedModel,
    maxTokens: selectedModel?.maxTokens,
    temperature: selectedModel?.temperature ?? 0.7,
    hasApiKey: !!provider.apiKey,
  };
}

export function isConfigured(): boolean {
  const resolved = getResolvedConfig();
  return resolved.hasApiKey;
}

export async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand(
    "workbench.action.openSettings",
    "codeAssistant",
  );
}

export async function promptForApiKey(): Promise<string | undefined> {
  const apiKey = await vscode.window.showInputBox({
    prompt: "请输入 API 密钥",
    password: true,
    placeHolder: "sk-...",
    ignoreFocusOut: true,
  });

  if (apiKey) {
    const resolved = getResolvedConfig();
    const providers = getProviders().map((provider) =>
      provider.displayName === resolved.activeProvider
        ? { ...provider, apiKey }
        : provider,
    );
    await updateStoreValue("providers", providers);
    vscode.window.showInformationMessage("API 密钥已保存");
  }

  return apiKey;
}

export async function selectModel(): Promise<string | undefined> {
  const resolved = getResolvedConfig();
  const models = resolved.provider.models;
  if (models.length === 0) {
    vscode.window.showWarningMessage("请先在设置中配置模型列表");
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(models, {
    placeHolder: "选择模型",
    matchOnDescription: true,
  });

  if (!selected) {
    return undefined;
  }

  await updateStoreValue("activeModel", selected.value);
  vscode.window.showInformationMessage(`已选择模型: ${selected.label}`);
  return selected.value;
}

export async function setApiBase(): Promise<string | undefined> {
  const resolved = getResolvedConfig();

  const presets = [
    { label: "OpenAI", value: "https://api.openai.com/v1" },
    { label: "Deepseek", value: "https://api.deepseek.com/v1" },
    {
      label: "通义千问",
      value: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    { label: "自定义...", value: "custom" },
  ];

  const selected = await vscode.window.showQuickPick(presets, {
    placeHolder: "选择 API 服务商或输入自定义地址",
  });

  if (!selected) {
    return undefined;
  }

  let apiBase = selected.value;

  if (selected.value === "custom") {
    const customBase = await vscode.window.showInputBox({
      prompt: "请输入 API 基础地址",
      placeHolder: "https://api.example.com/v1",
      value: resolved.provider.baseUrl,
      validateInput: (value) => {
        try {
          new URL(value);
          return null;
        } catch {
          return "请输入有效的 URL";
        }
      },
    });

    if (!customBase) {
      return undefined;
    }
    apiBase = customBase;
  }

  const providers = getProviders().map((provider) =>
    provider.displayName === resolved.activeProvider
      ? { ...provider, baseUrl: apiBase }
      : provider,
  );
  await updateStoreValue("providers", providers);
  vscode.window.showInformationMessage(`API 地址已设置为: ${apiBase}`);
  return apiBase;
}

// 配置变更监听器
export function onConfigChange(
  callback: (config: CodeAssistantConfig) => void,
): vscode.Disposable {
  callback(getConfig());
  return { dispose: () => {} };
}

export async function migrateFromWorkspaceSettings(): Promise<void> {
  if (!hasConfigStore()) return;
  const existingProviders = getStoreValue<unknown[]>("providers", []);
  if (existingProviders.length > 0) return;
  const config = vscode.workspace.getConfiguration("codeAssistant");
  const providers = config.get<unknown[]>("providers") || [];
  if (providers.length === 0) return;

  const activeProvider = config.get<string>("activeProvider") || "";
  const activeModel = config.get<string>("activeModel") || "";
  await updateStoreValue("providers", providers);
  if (activeProvider) {
    await updateStoreValue("activeProvider", activeProvider);
  }
  if (activeModel) {
    await updateStoreValue("activeModel", activeModel);
  }
}
