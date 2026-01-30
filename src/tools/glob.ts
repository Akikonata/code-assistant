import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";
import { glob } from "glob";

export class GlobTool implements Tool {
  name = "Glob";
  description = "按模式匹配文件";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "Glob",
      description: `按 glob 模式匹配文件。
- 支持 **/*.js、src/**/*.ts 等模式
- 返回匹配的文件路径列表
- 按修改时间排序`,
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "glob 模式，如 **/*.js、src/**/*.ts",
          },
          path: {
            type: "string",
            description: "搜索目录，默认工作区根目录",
          },
        },
        required: ["pattern"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const pattern = params.pattern as string;
    const searchPath = params.path as string | undefined;

    try {
      const cwd = this.resolvePath(searchPath || "");

      // 确保目录存在
      if (!fs.existsSync(cwd)) {
        return {
          success: false,
          error: `目录不存在: ${cwd}`,
        };
      }

      // 执行 glob 搜索
      const files = await glob(pattern, {
        cwd,
        nodir: true,
        ignore: ["**/node_modules/**", "**/.git/**"],
      });

      if (files.length === 0) {
        return {
          success: true,
          result: `在 ${cwd} 中未找到匹配 "${pattern}" 的文件`,
        };
      }

      // 获取文件信息并按修改时间排序
      const filesWithStats = files
        .map((file) => {
          const fullPath = path.join(cwd, file);
          try {
            const stat = fs.statSync(fullPath);
            return {
              path: file,
              fullPath,
              mtime: stat.mtime,
            };
          } catch {
            return null;
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // 限制结果数量
      const maxResults = 100;
      const limitedFiles = filesWithStats.slice(0, maxResults);

      let result = `搜索目录: ${cwd}\n`;
      result += `模式: ${pattern}\n`;
      result += `找到 ${filesWithStats.length} 个文件`;
      if (filesWithStats.length > maxResults) {
        result += `（显示前 ${maxResults} 个）`;
      }
      result += "\n---\n";
      result += limitedFiles.map((f) => f.path).join("\n");

      return {
        success: true,
        result,
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
