import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";

interface EditOperation {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export class MultiEditTool implements Tool {
  name = "MultiEdit";
  description = "批量编辑文件";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "MultiEdit",
      description: `在一个文件中执行多次编辑操作。
- 所有编辑按顺序执行
- 后续编辑基于前一个编辑的结果
- 任何编辑失败则全部回滚`,
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "要编辑的文件的绝对路径",
          },
          edits: {
            type: "array",
            description: "编辑操作列表",
            items: {
              type: "object",
              properties: {
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
                  description: "是否替换所有匹配项",
                },
              },
              required: ["old_string", "new_string"],
            },
          },
        },
        required: ["file_path", "edits"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const filePath = params.file_path as string;
    const edits = params.edits as EditOperation[];

    if (!Array.isArray(edits) || edits.length === 0) {
      return {
        success: false,
        error: "edits 必须是非空数组",
      };
    }

    try {
      const resolvedPath = this.resolvePath(filePath);

      // 检查文件是否存在
      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `文件不存在: ${resolvedPath}`,
        };
      }

      // 读取原始内容
      const originalContent = fs.readFileSync(resolvedPath, "utf-8");
      let content = originalContent;
      const results: string[] = [];

      // 执行每个编辑操作
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        const { old_string, new_string, replace_all } = edit;

        // 检查 old_string 是否存在
        if (!content.includes(old_string)) {
          // 回滚：不保存任何更改
          return {
            success: false,
            error: `编辑 #${i + 1} 失败: 未找到要替换的文本\n文本: "${old_string.substring(0, 50)}${old_string.length > 50 ? "..." : ""}"`,
          };
        }

        // 检查唯一性
        if (!replace_all) {
          const occurrences = content.split(old_string).length - 1;
          if (occurrences > 1) {
            return {
              success: false,
              error: `编辑 #${i + 1} 失败: 找到 ${occurrences} 处匹配，请提供更精确的文本或使用 replace_all`,
            };
          }
        }

        // 执行替换
        let replacements: number;
        if (replace_all) {
          const regex = new RegExp(this.escapeRegExp(old_string), "g");
          replacements = (content.match(regex) || []).length;
          content = content.replace(regex, new_string);
        } else {
          content = content.replace(old_string, new_string);
          replacements = 1;
        }

        results.push(`编辑 #${i + 1}: 替换 ${replacements} 处`);
      }

      // 所有编辑成功，写入文件
      fs.writeFileSync(resolvedPath, content, "utf-8");

      // 在 VS Code 中打开/刷新文件
      const uri = vscode.Uri.file(resolvedPath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });

      let result = `成功编辑文件: ${resolvedPath}\n`;
      result += "---\n";
      result += results.join("\n");
      result += `\n---\n总计: ${edits.length} 个编辑操作`;

      return {
        success: true,
        result,
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
