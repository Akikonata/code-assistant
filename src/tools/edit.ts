import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";

export class EditTool implements Tool {
  name = "Edit";
  description = "编辑文件内容（字符串替换）";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "Edit",
      description: `通过字符串替换编辑文件。
- old_string 必须在文件中唯一存在
- 使用 replace_all 可以替换所有匹配项
- 适合小范围精确修改`,
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "要编辑的文件的绝对路径",
          },
          old_string: {
            type: "string",
            description: "要替换的原始文本",
          },
          new_string: {
            type: "string",
            description: "替换后的新文本",
          },
          replace_all: {
            type: "boolean",
            description: "是否替换所有匹配项，默认 false",
          },
        },
        required: ["file_path", "old_string", "new_string"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const filePath = params.file_path as string;
    const oldString = params.old_string as string;
    const newString = params.new_string as string;
    const replaceAll = (params.replace_all as boolean) || false;

    try {
      const resolvedPath = this.resolvePath(filePath);

      // 检查文件是否存在
      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `文件不存在: ${resolvedPath}`,
        };
      }

      // 读取文件
      let content = fs.readFileSync(resolvedPath, "utf-8");

      // 检查 old_string 是否存在
      if (!content.includes(oldString)) {
        return {
          success: false,
          error: `未找到要替换的文本: "${oldString.substring(0, 50)}${oldString.length > 50 ? "..." : ""}"`,
        };
      }

      // 检查 old_string 是否唯一（如果不是 replace_all 模式）
      if (!replaceAll) {
        const occurrences = content.split(oldString).length - 1;
        if (occurrences > 1) {
          return {
            success: false,
            error: `找到 ${occurrences} 处匹配，请提供更精确的文本或使用 replace_all`,
          };
        }
      }

      // 执行替换
      let replacements: number;
      if (replaceAll) {
        const regex = new RegExp(this.escapeRegExp(oldString), "g");
        replacements = (content.match(regex) || []).length;
        content = content.replace(regex, newString);
      } else {
        content = content.replace(oldString, newString);
        replacements = 1;
      }

      // 写入文件
      fs.writeFileSync(resolvedPath, content, "utf-8");

      // 在 VS Code 中打开/刷新文件
      const uri = vscode.Uri.file(resolvedPath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });

      return {
        success: true,
        result: `成功编辑文件: ${resolvedPath}\n替换次数: ${replacements}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `编辑文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
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

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
