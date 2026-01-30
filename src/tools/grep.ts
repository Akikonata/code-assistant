import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";
import { glob } from "glob";

export class GrepTool implements Tool {
  name = "Grep";
  description = "搜索文件内容";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "Grep",
      description: `搜索文件内容。
- 支持正则表达式
- 可以用 glob 模式过滤文件
- 支持显示上下文行`,
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "搜索的正则表达式模式",
          },
          path: {
            type: "string",
            description: "搜索路径，默认工作区根目录",
          },
          glob: {
            type: "string",
            description: "文件过滤 glob 模式，如 *.js、**/*.ts",
          },
          output_mode: {
            type: "string",
            enum: ["content", "files_with_matches", "count"],
            description:
              "输出模式: content（显示内容）、files_with_matches（仅文件名）、count（匹配数）",
          },
          "-i": {
            type: "boolean",
            description: "是否忽略大小写",
          },
          "-C": {
            type: "number",
            description: "显示匹配行前后的上下文行数",
          },
          head_limit: {
            type: "number",
            description: "限制输出的最大结果数",
          },
        },
        required: ["pattern"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const searchPattern = params.pattern as string;
    const searchPath = params.path as string | undefined;
    const fileGlob = params.glob as string | undefined;
    const outputMode = (params.output_mode as string) || "files_with_matches";
    const ignoreCase = params["-i"] as boolean | undefined;
    const contextLines = params["-C"] as number | undefined;
    const headLimit = params.head_limit as number | undefined;

    try {
      const cwd = this.resolvePath(searchPath || "");

      // 构建正则表达式
      let regex: RegExp;
      try {
        regex = new RegExp(searchPattern, ignoreCase ? "gi" : "g");
      } catch (e) {
        return {
          success: false,
          error: `无效的正则表达式: ${searchPattern}`,
        };
      }

      // 获取要搜索的文件
      const globPattern = fileGlob || "**/*";
      const files = await glob(globPattern, {
        cwd,
        nodir: true,
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/build/**",
        ],
      });

      const results: {
        file: string;
        matches: { line: number; content: string; context?: string[] }[];
      }[] = [];

      let totalMatches = 0;
      const maxFiles = 1000;
      const filesToSearch = files.slice(0, maxFiles);

      for (const file of filesToSearch) {
        const fullPath = path.join(cwd, file);

        try {
          // 检查是否是文本文件
          const stat = fs.statSync(fullPath);
          if (stat.size > 1024 * 1024) continue; // 跳过大于 1MB 的文件

          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          const fileMatches: {
            line: number;
            content: string;
            context?: string[];
          }[] = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (regex.test(line)) {
              const match: {
                line: number;
                content: string;
                context?: string[];
              } = {
                line: i + 1,
                content: line,
              };

              // 添加上下文
              if (contextLines && contextLines > 0) {
                const start = Math.max(0, i - contextLines);
                const end = Math.min(lines.length, i + contextLines + 1);
                match.context = lines.slice(start, end);
              }

              fileMatches.push(match);
              totalMatches++;

              // 重置正则状态
              regex.lastIndex = 0;
            }
          }

          if (fileMatches.length > 0) {
            results.push({
              file,
              matches: fileMatches,
            });
          }
        } catch {
          // 忽略无法读取的文件
        }
      }

      // 应用 head_limit
      const limitedResults = headLimit ? results.slice(0, headLimit) : results;

      // 格式化输出
      let output = `搜索模式: ${searchPattern}\n`;
      output += `搜索路径: ${cwd}\n`;
      if (fileGlob) {
        output += `文件过滤: ${fileGlob}\n`;
      }
      output += `匹配文件: ${results.length}，总匹配: ${totalMatches}\n`;
      output += "---\n";

      if (outputMode === "files_with_matches") {
        output += limitedResults.map((r) => r.file).join("\n");
      } else if (outputMode === "count") {
        output += limitedResults
          .map((r) => `${r.file}: ${r.matches.length}`)
          .join("\n");
      } else {
        // content mode
        for (const result of limitedResults) {
          output += `\n${result.file}:\n`;
          for (const match of result.matches.slice(0, 20)) {
            if (match.context) {
              const startLine = match.line - (contextLines || 0);
              match.context.forEach((contextLine, idx) => {
                const lineNum = startLine + idx;
                const prefix = lineNum === match.line ? ":" : "-";
                output += `${lineNum}${prefix}${contextLine}\n`;
              });
              output += "--\n";
            } else {
              output += `${match.line}:${match.content}\n`;
            }
          }
          if (result.matches.length > 20) {
            output += `... 还有 ${result.matches.length - 20} 个匹配\n`;
          }
        }
      }

      return {
        success: true,
        result: output,
      };
    } catch (error) {
      return {
        success: false,
        error: `搜索失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return filePath
        ? path.join(workspaceFolders[0].uri.fsPath, filePath)
        : workspaceFolders[0].uri.fsPath;
    }

    return filePath || process.cwd();
  }
}
