import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";

export class WebSearchTool implements Tool {
  name = "WebSearch";
  description = "网络搜索";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "WebSearch",
      description: `网络搜索（模拟，返回搜索建议）。
注意：由于 API 限制，此工具目前只能返回搜索建议，建议使用 WebFetch 直接访问具体网址。`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
          allowed_domains: {
            type: "array",
            description: "只搜索这些域名",
          },
          blocked_domains: {
            type: "array",
            description: "排除这些域名",
          },
        },
        required: ["query"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const query = params.query as string;
    const allowedDomains = params.allowed_domains as string[] | undefined;
    const blockedDomains = params.blocked_domains as string[] | undefined;

    // 由于没有真实的搜索 API，这里返回搜索建议
    // 实际使用时可以集成 Bing Search API、Google Custom Search API 等

    let result = `搜索关键词: ${query}\n`;
    if (allowedDomains && allowedDomains.length > 0) {
      result += `限定域名: ${allowedDomains.join(", ")}\n`;
    }
    if (blockedDomains && blockedDomains.length > 0) {
      result += `排除域名: ${blockedDomains.join(", ")}\n`;
    }
    result += "---\n";
    result += "建议搜索网址:\n";

    // 构建搜索 URL
    const encodedQuery = encodeURIComponent(query);

    result += `1. Google: https://www.google.com/search?q=${encodedQuery}\n`;
    result += `2. Bing: https://www.bing.com/search?q=${encodedQuery}\n`;
    result += `3. DuckDuckGo: https://duckduckgo.com/?q=${encodedQuery}\n`;

    // 如果是技术相关搜索，添加更多建议
    const techKeywords = [
      "代码",
      "code",
      "api",
      "library",
      "库",
      "框架",
      "framework",
      "error",
      "错误",
      "bug",
    ];
    const isTechQuery = techKeywords.some((kw) =>
      query.toLowerCase().includes(kw),
    );

    if (isTechQuery) {
      result += `4. Stack Overflow: https://stackoverflow.com/search?q=${encodedQuery}\n`;
      result += `5. GitHub: https://github.com/search?q=${encodedQuery}\n`;
    }

    result += "\n提示: 可以使用 WebFetch 工具直接访问上述链接获取搜索结果。";

    return {
      success: true,
      result,
    };
  }
}
