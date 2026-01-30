import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getResolvedConfig } from "../config/settings";
import {
  Message,
  ToolDefinition,
  StreamChunk,
  ChatCompletionChunk,
  ToolCall,
} from "./types";
import { getSystemPrompt } from "./systemPrompt";

/** 深拷贝并脱敏 base64 数据，便于在控制台查看请求体结构 */
function redactBodyForLog(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "string" && /^data:(image|video)\/[^;]+;base64,/.test(obj)) {
      return `[BASE64_${obj.startsWith("data:image") ? "IMAGE" : "VIDEO"}, length=${obj.length}]`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactBodyForLog);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactBodyForLog(v);
  }
  return out;
}

export class LLMClient {
  private getConfig() {
    const resolved = getResolvedConfig();
    return {
      apiBase: resolved.provider.baseUrl,
      apiKey: resolved.provider.apiKey,
      model: resolved.model,
      maxTokens: resolved.maxTokens,
      temperature: resolved.temperature,
    };
  }

  async *chat(
    messages: Message[],
    tools?: ToolDefinition[],
  ): AsyncIterable<StreamChunk> {
    const config = this.getConfig();

    if (!config.apiBase || !config.model) {
      yield {
        type: "error",
        error: "请先在设置中配置 API 服务与模型",
      };
      return;
    }

    if (!config.apiKey) {
      yield {
        type: "error",
        error: "请先配置 API 密钥",
      };
      return;
    }

    // 添加系统提示，并为带有 tool_calls 的 assistant 消息添加 reasoning_content
    // Moonshot API 要求字段顺序: role, content, reasoning_content, tool_calls
    // 使用 Kimi 返回的原始 tool_call id
    const messagesWithSystem: Message[] = [
      { role: "system", content: getSystemPrompt() },
      ...messages.map((message) => {
        if (
          message.role === "assistant" &&
          message.tool_calls &&
          message.tool_calls.length > 0
        ) {
          // 显式构建消息，确保字段顺序正确
          return {
            role: message.role,
            content: message.content,
            reasoning_content: message.reasoning_content ?? "",
            tool_calls: message.tool_calls,
          };
        }
        return message;
      }),
    ];

    const url = `${config.apiBase.replace(/\/$/, "")}/chat/completions`;

    const body: Record<string, unknown> = {
      model: config.model,
      messages: messagesWithSystem,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: tools && tools.length > 0 ? "auto" : undefined,
      stream: true,
      temperature: config.temperature,
    };

    // 只在 maxTokens 有值时才添加
    if (config.maxTokens && config.maxTokens > 0) {
      body.max_tokens = config.maxTokens;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage: string;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorText;
        } catch {
          errorMessage = errorText;
        }
        // 请求失败时打出请求体，便于区分是业务逻辑问题还是接口问题
        const bodyStr = JSON.stringify(body);
        const redacted = redactBodyForLog(body);
        console.error("[LLM] 请求失败，请求体（已脱敏 base64）:", JSON.stringify(redacted, null, 2));
        console.error("[LLM] 请求体原始字节长度:", bodyStr.length);
        try {
          const desktop = path.join(os.homedir(), "Desktop");
          if (fs.existsSync(desktop)) {
            const outPath = path.join(desktop, "llm-request-debug.json");
            fs.writeFileSync(outPath, bodyStr, "utf-8");
            console.error("[LLM] 完整请求体已写入:", outPath);
          }
        } catch (e) {
          console.error("[LLM] 写入请求体文件失败:", e);
        }
        yield {
          type: "error",
          error: `API 错误 (${response.status}): ${errorMessage}`,
        };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: "error", error: "无法读取响应流" };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let reasoningContent = "";
      let toolCallsSent = false; // 防止重复发送 tool calls
      const toolCallsInProgress = new Map<
        number,
        { id: string; name: string; arguments: string }
      >();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === "data: [DONE]") continue;
          if (!trimmedLine.startsWith("data: ")) continue;

          try {
            const jsonStr = trimmedLine.slice(6);
            const chunk: ChatCompletionChunk = JSON.parse(jsonStr);
            const delta = chunk.choices[0]?.delta;

            if (!delta) continue;

            // 处理 reasoning_content（思考过程）- 实时流式发送
            if (delta.reasoning_content) {
              reasoningContent += delta.reasoning_content;
              yield {
                type: "reasoning_content",
                reasoningContent: delta.reasoning_content,
              };
            }

            // 处理文本内容
            if (delta.content) {
              yield {
                type: "content",
                content: delta.content,
              };
            }

            // 处理工具调用 - 实时发送进度
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;

                if (!toolCallsInProgress.has(index)) {
                  toolCallsInProgress.set(index, {
                    id: tc.id || `call_${index}`,
                    name: tc.function?.name || "",
                    arguments: "",
                  });
                }

                const current = toolCallsInProgress.get(index)!;

                // 使用 Kimi 返回的原始 id
                if (tc.id) {
                  current.id = tc.id;
                }
                if (tc.function?.name) {
                  current.name = tc.function.name;
                }
                if (tc.function?.arguments) {
                  current.arguments += tc.function.arguments;
                }

                // 实时发送 tool_call 进度
                yield {
                  type: "tool_call_progress",
                  toolCallProgress: {
                    index,
                    id: current.id,
                    name: current.name,
                    arguments: current.arguments,
                  },
                };
              }
            }

            // 检查是否完成
            if (
              chunk.choices[0]?.finish_reason === "tool_calls" &&
              !toolCallsSent
            ) {
              toolCallsSent = true; // 标记已发送，防止重复
              // 先发送累积的 reasoning_content
              if (reasoningContent) {
                yield {
                  type: "reasoning_content",
                  reasoningContent,
                };
              }
              // 发送所有工具调用
              for (const [, tc] of toolCallsInProgress) {
                const toolCall: ToolCall = {
                  id: tc.id,
                  type: "function",
                  function: {
                    name: tc.name,
                    arguments: tc.arguments,
                  },
                };
                yield {
                  type: "tool_call",
                  toolCall,
                };
              }
            }
          } catch {
            // 忽略解析错误，继续处理
          }
        }
      }

      // 如果有未发送的 reasoning_content（非工具调用场景）
      if (reasoningContent && toolCallsInProgress.size === 0) {
        yield {
          type: "reasoning_content",
          reasoningContent,
        };
      }

      // 处理缓冲区中剩余的数据
      if (buffer.trim() && buffer.trim() !== "data: [DONE]") {
        if (buffer.trim().startsWith("data: ")) {
          try {
            const jsonStr = buffer.trim().slice(6);
            const chunk: ChatCompletionChunk = JSON.parse(jsonStr);
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
              yield { type: "content", content: delta.content };
            }
          } catch {
            // 忽略
          }
        }
      }

      // 如果有未发送的工具调用（某些 API 可能不发送 finish_reason）
      if (toolCallsInProgress.size > 0 && !toolCallsSent) {
        for (const [, tc] of toolCallsInProgress) {
          if (tc.name && tc.arguments) {
            const toolCall: ToolCall = {
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            };
            yield { type: "tool_call", toolCall };
          }
        }
      }

      yield { type: "done" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      yield {
        type: "error",
        error: `请求失败: ${errorMessage}`,
      };
    }
  }
}
