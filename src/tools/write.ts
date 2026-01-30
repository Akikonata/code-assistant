import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";

export class WriteTool implements Tool {
  name = "Write";
  description = "写入文件内容";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "Write",
      description: `写入文件内容。
- 会覆盖已存在的文件
- 自动创建不存在的目录
- 适合创建新文件或完全重写文件`,
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "要写入的文件的绝对路径",
          },
          content: {
            type: "string",
            description: "要写入的内容",
          },
        },
        required: ["file_path", "content"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const filePath = params.file_path as string;
    const content = params.content as string;

    try {
      const resolvedPath = this.resolvePath(filePath);

      // 确保目录存在
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(resolvedPath, content, "utf-8");

      // 在 VS Code 中打开文件
      const uri = vscode.Uri.file(resolvedPath);
      await vscode.window.showTextDocument(uri, { preview: false });

      const lines = content.split("\n").length;
      return {
        success: true,
        result: `成功写入文件: ${resolvedPath}\n行数: ${lines}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `写入文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return path.join(workspaceFolders[0].uri.fsPath, filePath);
    }

    return filePath;
  }
}
