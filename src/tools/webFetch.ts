import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";

export class WebFetchTool implements Tool {
  name = "WebFetch";
  description = "获取网页内容";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "WebFetch",
      description: `获取网页内容。
- 自动将 HTML 转换为简化文本
- 支持获取 JSON API 响应
- 有超时限制`,
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "要获取的 URL",
          },
          prompt: {
            type: "string",
            description: "描述你想从页面获取什么信息",
          },
        },
        required: ["url"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string;
    const prompt = params.prompt as string | undefined;

    try {
      // 验证 URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return {
          success: false,
          error: `无效的 URL: ${url}`,
        };
      }

      // 只允许 http 和 https
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return {
          success: false,
          error: `不支持的协议: ${parsedUrl.protocol}`,
        };
      }

      // 设置超时
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "VSCode-CodeAssistant/1.0",
            Accept: "text/html,application/json,text/plain,*/*",
          },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          return {
            success: false,
            error: `HTTP 错误: ${response.status} ${response.statusText}`,
          };
        }

        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();

        let content: string;

        if (contentType.includes("application/json")) {
          // JSON 响应，格式化输出
          try {
            const json = JSON.parse(text);
            content = JSON.stringify(json, null, 2);
          } catch {
            content = text;
          }
        } else if (contentType.includes("text/html")) {
          // HTML 响应，简单清理
          content = this.cleanHtml(text);
        } else {
          // 其他文本
          content = text;
        }

        // 限制内容长度
        const maxLength = 50000;
        if (content.length > maxLength) {
          content = content.substring(0, maxLength) + "\n\n... (内容已截断)";
        }

        let result = `URL: ${url}\n`;
        result += `Content-Type: ${contentType}\n`;
        if (prompt) {
          result += `提取目标: ${prompt}\n`;
        }
        result += "---\n";
        result += content;

        return {
          success: true,
          result,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          error: "请求超时（30秒）",
        };
      }
      return {
        success: false,
        error: `获取失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  private cleanHtml(html: string): string {
    // 移除 script 和 style
    let cleaned = html.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      "",
    );
    cleaned = cleaned.replace(
      /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
      "",
    );

    // 移除 HTML 注释
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

    // 替换常见 HTML 实体
    cleaned = cleaned.replace(/&nbsp;/g, " ");
    cleaned = cleaned.replace(/&amp;/g, "&");
    cleaned = cleaned.replace(/&lt;/g, "<");
    cleaned = cleaned.replace(/&gt;/g, ">");
    cleaned = cleaned.replace(/&quot;/g, '"');
    cleaned = cleaned.replace(/&#39;/g, "'");

    // 移除 HTML 标签
    cleaned = cleaned.replace(/<[^>]+>/g, " ");

    // 清理空白
    cleaned = cleaned.replace(/\s+/g, " ");
    cleaned = cleaned.replace(/\n\s*\n/g, "\n");

    return cleaned.trim();
  }
}
