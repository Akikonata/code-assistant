import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";

export class ReadTool implements Tool {
  name = "Read";
  description = "读取文件内容";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "Read",
      description: `读取文件内容。
- 可以读取任意文本文件
- 支持指定行范围（offset 和 limit）
- 返回带行号的内容`,
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "要读取的文件的绝对路径",
          },
          offset: {
            type: "number",
            description: "从第几行开始读取（1-based），默认从头开始",
          },
          limit: {
            type: "number",
            description: "读取的行数，默认读取全部",
          },
        },
        required: ["file_path"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const filePath = params.file_path as string;
    const offset = (params.offset as number) || 1;
    const limit = params.limit as number | undefined;

    try {
      // 解析路径
      const resolvedPath = this.resolvePath(filePath);

      // 检查文件是否存在
      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `文件不存在: ${resolvedPath}`,
        };
      }

      // 检查是否是文件
      const stat = fs.statSync(resolvedPath);
      if (stat.isDirectory()) {
        return {
          success: false,
          error: `路径是目录而非文件: ${resolvedPath}`,
        };
      }

      // 读取文件
      const content = fs.readFileSync(resolvedPath, "utf-8");
      const lines = content.split("\n");

      // 计算范围
      const startLine = Math.max(1, offset) - 1;
      const endLine = limit ? startLine + limit : lines.length;
      const selectedLines = lines.slice(startLine, endLine);

      // 添加行号
      const numberedLines = selectedLines.map((line, index) => {
        const lineNum = (startLine + index + 1).toString().padStart(6, " ");
        return `${lineNum}|${line}`;
      });

      const result = numberedLines.join("\n");
      const totalLines = lines.length;
      const shownLines = selectedLines.length;

      let summary = `文件: ${resolvedPath}\n`;
      summary += `总行数: ${totalLines}, 显示: 第 ${startLine + 1} 到 ${startLine + shownLines} 行\n`;
      summary += "---\n";
      summary += result;

      return {
        success: true,
        result: summary,
      };
    } catch (error) {
      return {
        success: false,
        error: `读取文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  private resolvePath(filePath: string): string {
    // 如果是绝对路径，直接返回
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // 否则相对于工作区
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return path.join(workspaceFolders[0].uri.fsPath, filePath);
    }

    return filePath;
  }
}
