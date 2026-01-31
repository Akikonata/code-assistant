import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getResolvedConfig } from "../config/settings";
import { updateStoreValue } from "../config/store";
import { LLMClient } from "../llm/client";
import { ToolExecutor } from "../tools";
import { Message, ToolCall, ContentPart } from "../llm/types";
import { getWebviewContent } from "./webviewContent";
import { SettingsPanel } from "../settings/SettingsPanel";

const SESSIONS_KEY = "codeAssistant.chatSessions";
const ACTIVE_SESSION_ID_KEY = "codeAssistant.activeSessionId";
const MAX_SESSIONS = 30;
const MAX_MESSAGES_PER_SESSION = 200;

function messageToPlainText(content: string | ContentPart[] | undefined): string {
  if (content === undefined || content === null) return "";
  if (typeof content === "string") return content;
  return content
    .map((p) => {
      if (p.type === "text" && p.text) return p.text;
      if (p.type === "image_url") return "[图片]";
      if (p.type === "video_url") return "[视频]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const VIDEO_EXTENSIONS = [".mp4", ".mpeg", ".mov", ".avi", ".x-flv", ".mpg", ".webm", ".wmv", ".3gpp"];

function extractFilePaths(text: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    { pattern: /["']([^"']+\.[a-zA-Z0-9]{2,4})["']/g, name: "引号内路径" },
    { pattern: /\/(?:[^\s\n"'<>|*?]+\/)*[^\s\n"'<>|*?]+\.[a-zA-Z0-9]{2,4}/g, name: "Unix绝对路径" },
    { pattern: /[A-Za-z]:\\(?:[^\s\n"'<>|*?]+\\)*[^\s\n"'<>|*?]+\.[a-zA-Z0-9]{2,4}/g, name: "Windows绝对路径" },
    { pattern: /(?:\.\/|\.\.\/)(?:[^\s\n"'<>|*?]+\/)*[^\s\n"'<>|*?]+\.[a-zA-Z0-9]{2,4}/g, name: "相对路径" },
    { pattern: /\b([^\s\n"'<>|*?]+\.[a-zA-Z0-9]{2,4})(?:\s|$|[\n\r]|[,;:])/g, name: "普通文件名" },
    { pattern: /(?:[:=]\s*|->\s*|=>\s*)([^\s\n"'<>|*?]+\.[a-zA-Z0-9]{2,4})/g, name: "符号后路径" },
  ];
  for (const { pattern } of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const filePath = (match[1] || match[0]).trim();
      if (filePath && !seen.has(filePath)) {
        if (
          !filePath.startsWith("http") &&
          !filePath.includes("@") &&
          !filePath.startsWith("data:") &&
          !filePath.startsWith("mailto:")
        ) {
          paths.push(filePath);
          seen.add(filePath);
        }
      }
    }
  }
  return paths;
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function resolveFilePath(filePath: string): string | null {
  try {
    if (path.isAbsolute(filePath)) {
      return fs.existsSync(filePath) ? filePath : null;
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders?.length) {
      const resolved = path.resolve(workspaceFolders[0].uri.fsPath, filePath);
      if (fs.existsSync(resolved)) return resolved;
    }
    const cwdResolved = path.resolve(process.cwd(), filePath);
    return fs.existsSync(cwdResolved) ? cwdResolved : null;
  } catch {
    return null;
  }
}

async function fileToBase64(filePath: string): Promise<string | null> {
  try {
    const resolved = resolveFilePath(filePath);
    if (!resolved) return null;
    const buf = await fs.promises.readFile(resolved);
    return buf.toString("base64");
  } catch {
    return null;
  }
}

async function extractMediaFromToolResult(
  toolResult: string,
): Promise<Array<{ name: string; type: string; base64: string; isImage: boolean; isVideo: boolean }>> {
  const attachments: Array<{
    name: string;
    type: string;
    base64: string;
    isImage: boolean;
    isVideo: boolean;
  }> = [];
  const filePaths = extractFilePaths(toolResult);
  const processed = new Set<string>();
  for (const filePath of filePaths) {
    const normalized = path.normalize(filePath);
    if (processed.has(normalized)) continue;
    const resolved = resolveFilePath(filePath);
    if (!resolved) continue;
    processed.add(normalized);
    if (isImageFile(resolved)) {
      const base64 = await fileToBase64(resolved);
      if (base64) {
        attachments.push({
          name: path.basename(resolved),
          type: path.extname(resolved).slice(1).toLowerCase(),
          base64,
          isImage: true,
          isVideo: false,
        });
      }
    } else if (isVideoFile(resolved)) {
      const base64 = await fileToBase64(resolved);
      if (base64) {
        attachments.push({
          name: path.basename(resolved),
          type: path.extname(resolved).slice(1).toLowerCase(),
          base64,
          isImage: false,
          isVideo: true,
        });
      }
    }
  }
  return attachments;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _llmClient: LLMClient;
  private _toolExecutor: ToolExecutor;
  private _messages: Message[] = [];
  private _activeSessionId: string | null = null;
  private _isProcessing = false;
  private _lastUserRequest: {
    content: string;
    attachments?: Array<{
      name: string;
      type: string;
      base64: string;
      isImage: boolean;
      isVideo: boolean;
    }>;
  } | null = null;
  private _lastToolMediaAttachments: Array<{
    name: string;
    type: string;
    base64: string;
    isImage: boolean;
    isVideo: boolean;
  }> = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
  ) {
    this._llmClient = new LLMClient();
    this._toolExecutor = new ToolExecutor();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      this._extensionUri,
    );
    this.sendConfig();

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "webviewReady":
          this.sendConfig();
          this.sendSessionList();
          const activeId = this._context.globalState.get<string | null>(
            ACTIVE_SESSION_ID_KEY,
          );
          if (activeId && this._messages.length === 0) {
            this.loadSession(activeId);
          } else if (this._messages.length > 0) {
            this.sendLoadHistory(this._messages);
          }
          break;
        case "sendMessage":
          await this.handleUserMessage(data.message, data.attachments);
          break;
        case "retryLast":
          if (!this._isProcessing && this._lastUserRequest) {
            await this.handleUserMessage(
              this._lastUserRequest.content,
              this._lastUserRequest.attachments,
            );
          }
          break;
        case "newChat":
          this.newChat();
          break;
        case "stopGeneration":
          this._isProcessing = false;
          this._view?.webview.postMessage({
            type: "stopProcessing",
          });
          break;
        case "getConfig":
          this.sendConfig();
          break;
        case "getSkills":
          this._view?.webview.postMessage({
            type: "skills",
            skills: this._toolExecutor.getSkillMetadata(),
          });
          break;
        case "getSessionList":
          this.sendSessionList();
          break;
        case "loadSession":
          if (typeof data.sessionId === "string") {
            this.loadSession(data.sessionId);
          }
          break;
        case "deleteSession":
          if (typeof data.sessionId === "string") {
            this.deleteSession(data.sessionId);
          }
          break;
        case "exportChat":
          this.exportChat();
          break;
        case "setActiveModel":
          if (typeof data.model === "string") {
            await updateStoreValue("activeModel", data.model);
            this.sendConfig();
          }
          break;
        case "setActiveProvider":
          if (typeof data.provider === "string") {
            await updateStoreValue("activeProvider", data.provider);
            this.sendConfig();
          }
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
            this.sendConfig();
          }
          break;
        case "openSettings":
          SettingsPanel.show(this._extensionUri);
          break;
        case "command":
          if (typeof data.command === "string") {
            if (Array.isArray(data.args)) {
              await vscode.commands.executeCommand(data.command, ...data.args);
            } else {
              await vscode.commands.executeCommand(data.command);
            }
          }
          break;
      }
    });
  }

  public sendConfig() {
    const config = getResolvedConfig();
    this._view?.webview.postMessage({
      type: "config",
      config: {
        providers: config.providers,
        activeProvider: config.activeProvider,
        activeModel: config.activeModel,
        hasApiKey: config.hasApiKey,
      },
    });
  }

  public refreshConfig() {
    this.sendConfig();
  }

  public async handleUserMessage(
    content: string,
    attachments?: Array<{
      name: string;
      type: string;
      base64: string;
      isImage: boolean;
      isVideo: boolean;
    }>,
  ) {
    if (this._isProcessing) {
      return;
    }

    let skillHint: string | null = null;
    let originalContent = content;
    if (content && content.trim().startsWith("/")) {
      const trimmed = content.trim();
      const parts = trimmed.split(/\s+/);
      const slashName = parts[0].slice(1);
      const restText = parts.slice(1).join(" ");
      const toolNames = this._toolExecutor.getToolNames();
      const matched = toolNames.find(
        (name) => name.toLowerCase() === slashName.toLowerCase(),
      );
      if (matched) {
        skillHint = matched;
        content = restText || "";
      }
    }

    const hasContent = content && content.trim();
    const hasAttachments = attachments && attachments.length > 0;
    const hasToolMedia = this._lastToolMediaAttachments.length > 0;
    if (!hasContent && !hasAttachments && !hasToolMedia) return;

    const allAttachments = [
      ...(attachments || []),
      ...this._lastToolMediaAttachments,
    ];
    const currentToolMediaCount = this._lastToolMediaAttachments.length;

    this._lastUserRequest = {
      content: originalContent,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    };

    this._isProcessing = true;

    let messageContent: string | ContentPart[];
    const textContent = content.trim();
    const hasAllAttachments = allAttachments.length > 0;

    if (hasAllAttachments || skillHint) {
      const parts: ContentPart[] = [];
      if (hasToolMedia && currentToolMediaCount > 0) {
        const toolMediaNames = this._lastToolMediaAttachments
          .slice(0, currentToolMediaCount)
          .map((att) => att.name)
          .join("、");
        const imageCount = this._lastToolMediaAttachments
          .slice(0, currentToolMediaCount)
          .filter((att) => att.isImage).length;
        const videoCount = currentToolMediaCount - imageCount;
        const mediaDesc =
          imageCount > 0 && videoCount > 0
            ? `${imageCount} 个图片和 ${videoCount} 个视频`
            : imageCount > 0
              ? `${imageCount} 个图片`
              : `${videoCount} 个视频`;
        parts.push({
          type: "text",
          text: `【系统提示】上一步工具执行生成了 ${mediaDesc}文件（${toolMediaNames}），系统已自动将这些媒体文件转换为 base64 编码并以 image_url/video_url 格式附加到当前消息中。你可以直接使用这些媒体文件来完成后续任务，无需使用 Read 工具读取它们。`,
        });
      }
      if (skillHint) {
        parts.push({
          type: "text",
          text: `用户通过斜杠命令显式指定使用 skill/工具 "${skillHint}"，请优先调用该工具来完成后续任务。`,
        });
      }
      if (hasAllAttachments) {
        for (const att of allAttachments) {
          if (att.isImage) {
            const ext = att.name.split(".").pop()?.toLowerCase() || "png";
            const base64Data = att.base64.includes(",")
              ? att.base64.split(",")[1]
              : att.base64;
            const imageUrl = `data:image/${ext};base64,${base64Data}`;
            parts.push({
              type: "image_url",
              image_url: { url: imageUrl },
            });
          } else if (att.isVideo) {
            const ext = att.name.split(".").pop()?.toLowerCase() || "mp4";
            const base64Data = att.base64.includes(",")
              ? att.base64.split(",")[1]
              : att.base64;
            const videoUrl = `data:video/${ext};base64,${base64Data}`;
            parts.push({
              type: "video_url",
              video_url: { url: videoUrl },
            });
          }
        }
      }
      if (textContent) {
        parts.push({ type: "text", text: textContent });
      } else if (hasAllAttachments && parts.length === 0) {
        parts.push({ type: "text", text: "" });
      }
      messageContent = parts;
    } else {
      messageContent = textContent;
    }

    const userMessage: Message = { role: "user", content: messageContent };
    this._messages.push(userMessage);
    if (currentToolMediaCount > 0 && allAttachments.length > 0) {
      this._lastToolMediaAttachments = [];
    }
    this.saveCurrentSession();

    this._view?.webview.postMessage({
      type: "userMessage",
      message: hasContent ? originalContent : "[包含图片/视频]",
      attachments: hasAllAttachments ? allAttachments : undefined,
    });

    this._view?.webview.postMessage({
      type: "startProcessing",
    });

    try {
      await this.processWithLLM();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      this._view?.webview.postMessage({
        type: "error",
        message: errorMessage,
      });
    } finally {
      this._isProcessing = false;
      this._view?.webview.postMessage({
        type: "stopProcessing",
      });
    }
  }

  private async processWithLLM() {
    const tools = this._toolExecutor.getToolDefinitions();
    let continueLoop = true;
    let injectedToolMediaCount = 0;

    while (continueLoop && this._isProcessing) {
      let fullContent = "";
      let reasoningContent = "";
      let toolCalls: ToolCall[] = [];

      const stream = this._llmClient.chat(this._messages, tools);

      for await (const chunk of stream) {
        if (!this._isProcessing) {
          break;
        }
        if (chunk.type === "content") {
          fullContent += chunk.content;
          this._view?.webview.postMessage({
            type: "assistantContent",
            content: chunk.content,
            isStreaming: true,
          });
        } else if (chunk.type === "reasoning_content") {
          reasoningContent += chunk.reasoningContent || "";
          this._view?.webview.postMessage({
            type: "reasoningContent",
            content: chunk.reasoningContent,
            isStreaming: true,
          });
        } else if (chunk.type === "tool_call_progress") {
          this._view?.webview.postMessage({
            type: "toolCallProgress",
            toolCallProgress: chunk.toolCallProgress,
          });
        } else if (chunk.type === "tool_call") {
          toolCalls.push(chunk.toolCall!);
          this._view?.webview.postMessage({
            type: "toolCall",
            toolCall: chunk.toolCall,
          });
        } else if (chunk.type === "error") {
          const errorMessage = chunk.error || "未知错误";
          this._view?.webview.postMessage({
            type: "error",
            message: errorMessage,
          });
          fullContent = errorMessage;
          continueLoop = false;
          break;
        }
      }

      if (fullContent || toolCalls.length > 0) {
        const assistantMessage: Message =
          toolCalls.length > 0
            ? {
                role: "assistant",
                content: fullContent,
                reasoning_content: reasoningContent,
                tool_calls: toolCalls,
              }
            : {
                role: "assistant",
                content: fullContent,
              };
        this._messages.push(assistantMessage);
      }

      if (toolCalls.length > 0 && this._isProcessing) {
        for (const toolCall of toolCalls) {
          if (!this._isProcessing) break;
          this._view?.webview.postMessage({
            type: "toolExecuting",
            toolCall,
          });
          try {
            const parsedArgs = JSON.parse(toolCall.function.arguments);
            const result = await this._toolExecutor.execute(
              toolCall.function.name,
              parsedArgs,
            );
            let toolContent: string;
            if (result.success && result.result !== undefined) {
              toolContent =
                typeof result.result === "string"
                  ? result.result
                  : JSON.stringify(result.result);
            } else {
              toolContent = result.error || "工具执行失败";
            }
            this._messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolContent,
            });
            this._view?.webview.postMessage({
              type: "toolResult",
              toolCallId: toolCall.id,
              result,
            });
            if (result.success && typeof result.result === "string") {
              try {
                const mediaAttachments = await extractMediaFromToolResult(result.result);
                if (mediaAttachments.length > 0) {
                  const existing = new Set(this._lastToolMediaAttachments.map((a) => a.name));
                  for (const att of mediaAttachments) {
                    if (!existing.has(att.name)) {
                      this._lastToolMediaAttachments.push(att);
                    }
                  }
                }
              } catch {
                // 提取失败不影响主流程
              }
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "工具执行失败";
            this._messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error: ${errorMessage}`,
            });
            this._view?.webview.postMessage({
              type: "toolError",
              toolCallId: toolCall.id,
              error: errorMessage,
            });
          }
        }
        if (this._lastToolMediaAttachments.length > injectedToolMediaCount) {
          const newAttachments = this._lastToolMediaAttachments.slice(injectedToolMediaCount);
          const parts: ContentPart[] = [
            { type: "text", text: "【系统】上一步工具生成了以下媒体文件，已附上供你参考。" },
          ];
          for (const att of newAttachments) {
            if (att.isImage) {
              const ext = att.name.split(".").pop()?.toLowerCase() || "png";
              const base64Data = att.base64.includes(",") ? att.base64.split(",")[1] : att.base64;
              parts.push({
                type: "image_url",
                image_url: { url: `data:image/${ext};base64,${base64Data}` },
              });
            } else if (att.isVideo) {
              const ext = att.name.split(".").pop()?.toLowerCase() || "mp4";
              const base64Data = att.base64.includes(",") ? att.base64.split(",")[1] : att.base64;
              parts.push({
                type: "video_url",
                video_url: { url: `data:video/${ext};base64,${base64Data}` },
              });
            }
          }
          this._messages.push({ role: "user", content: parts });
          injectedToolMediaCount = this._lastToolMediaAttachments.length;
        }
      } else {
        continueLoop = false;
      }
    }

    this._view?.webview.postMessage({
      type: "assistantContent",
      content: "",
      isStreaming: false,
    });
    this.saveCurrentSession();
  }

  public newChat() {
    this.saveCurrentSession();
    this._messages = [];
    this._activeSessionId = null;
    this._isProcessing = false;
    this._lastUserRequest = null;
    this._lastToolMediaAttachments = [];
    this._context.globalState.update(ACTIVE_SESSION_ID_KEY, null);
    this._view?.webview.postMessage({
      type: "clearChat",
    });
    this.sendSessionList();
  }

  private getSessionTitle(messages: Message[]): string {
    for (const msg of messages) {
      if (msg.role !== "user") continue;
      const text = messageToPlainText(msg.content);
      if (text && text.trim()) {
        const t = text.trim().replace(/\s+/g, " ");
        return t.length > 30 ? t.slice(0, 30) + "…" : t;
      }
    }
    return "新对话";
  }

  private getSessions(): ChatSession[] {
    const raw = this._context.globalState.get<ChatSession[]>(SESSIONS_KEY);
    const list = Array.isArray(raw) ? raw : [];
    return list
      .slice(0, MAX_SESSIONS)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private saveCurrentSession(): void {
    if (this._messages.length === 0) return;
    const sessions = this.getSessions();
    const title = this.getSessionTitle(this._messages);
    const trimmed = this._messages.slice(-MAX_MESSAGES_PER_SESSION);
    const id =
      this._activeSessionId ||
      `s${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const session: ChatSession = {
      id,
      title,
      messages: trimmed,
      updatedAt: Date.now(),
    };
    const idx = sessions.findIndex((s) => s.id === id);
    const next =
      idx >= 0
        ? sessions.map((s, i) => (i === idx ? session : s))
        : [session, ...sessions].slice(0, MAX_SESSIONS);
    this._context.globalState.update(SESSIONS_KEY, next);
    this._activeSessionId = id;
    this._context.globalState.update(ACTIVE_SESSION_ID_KEY, id);
    this.sendSessionList();
  }

  private loadSession(sessionId: string): void {
    const sessions = this.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    this._messages = session.messages;
    this._activeSessionId = sessionId;
    this._context.globalState.update(ACTIVE_SESSION_ID_KEY, sessionId);
    this.sendLoadHistory(this._messages);
    this.sendSessionList();
  }

  private deleteSession(sessionId: string): void {
    const sessions = this.getSessions().filter((s) => s.id !== sessionId);
    this._context.globalState.update(SESSIONS_KEY, sessions);
    if (this._activeSessionId === sessionId) {
      this._messages = [];
      this._activeSessionId = null;
      this._context.globalState.update(ACTIVE_SESSION_ID_KEY, null);
      this._view?.webview.postMessage({ type: "clearChat" });
    }
    this.sendSessionList();
  }

  private sendSessionList(): void {
    const list = this.getSessions().map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
      isActive: s.id === this._activeSessionId,
    }));
    this._view?.webview.postMessage({
      type: "sessionList",
      sessions: list,
      activeSessionId: this._activeSessionId,
    });
  }

  private sendLoadHistory(messages: Message[]): void {
    const payload = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    this._view?.webview.postMessage({
      type: "loadHistory",
      messages: payload,
    });
  }

  private async exportChat(): Promise<void> {
    if (this._messages.length === 0) {
      vscode.window.showInformationMessage("当前没有可导出的对话内容");
      return;
    }
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        `对话导出_${new Date().toISOString().slice(0, 10)}.md`,
      ),
      filters: { Markdown: ["md"], "Plain Text": ["txt"] },
    });
    if (!uri) return;
    const lines: string[] = [];
    for (const msg of this._messages) {
      if (msg.role === "system") continue;
      const label = msg.role === "user" ? "你" : "助手";
      const rawText = messageToPlainText(msg.content);
      lines.push(`${label}:\n${rawText || ""}\n\n`);
    }
    const content = lines.join("");
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(content, "utf-8"),
    );
    vscode.window.showInformationMessage(`已导出到 ${uri.fsPath}`);
  }

  public clearHistory() {
    this.newChat();
    vscode.window.showInformationMessage("对话历史已清除");
  }
}
