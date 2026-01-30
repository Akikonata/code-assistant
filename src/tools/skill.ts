import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";
import { LoadedSkill } from "./skillLoader";

export class SkillTool implements Tool {
  public readonly name: string;
  public readonly description: string;
  public readonly definition: ToolDefinition;
  private readonly skill: LoadedSkill;

  constructor(skill: LoadedSkill, skillLoader: any) {
    this.skill = skill;
    this.name = skill.metadata.name;
    this.description = skill.metadata.description;
    this.definition = skillLoader.skillToToolDefinition(skill);
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const scriptName = params.script as string;
    const args = params.args as string | undefined;

    if (!scriptName) {
      return {
        success: false,
        error: "未指定要执行的脚本",
      };
    }

    // 查找脚本文件
    const scriptPath = this.skill.scripts.find(
      (s) => path.basename(s) === scriptName,
    );

    if (!scriptPath) {
      return {
        success: false,
        error: `脚本未找到: ${scriptName}`,
      };
    }

    try {
      // 读取 SKILL.md 来了解使用方法
      const skillDoc = this.parseSkillDocumentation();

      const ext = path.extname(scriptPath).toLowerCase();

      if (ext === ".py") {
        return await this.executePython(scriptPath, args, skillDoc);
      } else if (ext === ".sh" || ext === ".bash") {
        return await this.executeShell(scriptPath, args);
      } else if (ext === ".js") {
        return await this.executeNode(scriptPath, args);
      } else {
        return {
          success: false,
          error: `不支持的脚本类型: ${ext}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `执行 skill 失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  /**
   * 解析 SKILL.md 文档，提取参数说明和使用方法
   */
  private parseSkillDocumentation(): {
    parameters?: Array<{
      name: string;
      type: string;
      default?: string;
      description: string;
      required?: boolean;
    }>;
    examples?: string[];
  } {
    const content = this.skill.skillMdContent;
    if (!content) {
      return {};
    }

    const result: {
      parameters?: Array<{
        name: string;
        type: string;
        default?: string;
        description: string;
        required?: boolean;
      }>;
      examples?: string[];
    } = {};

    // 解析参数表格（查找 "Optional Parameters" 或 "Parameters" 部分）
    const paramTableRegex =
      /##+\s*(?:Optional\s+)?Parameters?[\s\S]*?\|[-\s|]+\|[\s\S]*?((?:\|[^\n]+\|\n?)+)/i;
    const paramTableMatch = content.match(paramTableRegex);

    if (paramTableMatch) {
      const tableLines = paramTableMatch[1]
        .split("\n")
        .filter((line) => line.trim().startsWith("|"));
      const parameters: Array<{
        name: string;
        type: string;
        default?: string;
        description: string;
        required?: boolean;
      }> = [];

      // 解析表格行（跳过表头）
      for (let i = 1; i < tableLines.length; i++) {
        const line = tableLines[i].trim();
        if (!line || line.startsWith("|---")) continue;

        const cells = line
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c);
        if (cells.length >= 3) {
          // 提取参数名（可能包含反引号）
          const nameCell = cells[0].replace(/`/g, "").trim();
          const typeCell = cells[1]?.trim() || "";
          const defaultCell = cells[2]?.trim() || "";
          const descCell = cells[3]?.trim() || "";

          // 检查是否是必需参数（查找 "Required Parameters" 部分）
          const isRequired =
            content.includes("Required Parameters") &&
            !content.match(/##+\s*Optional\s+Parameters/i);

          parameters.push({
            name: nameCell,
            type: typeCell,
            default: defaultCell || undefined,
            description: descCell,
            required: isRequired && !defaultCell,
          });
        }
      }

      if (parameters.length > 0) {
        result.parameters = parameters;
      }
    }

    // 解析示例（查找代码块中的命令）
    const exampleRegex = /```(?:bash|sh|shell)?\s*\n([^\n]*python3[^\n]*)/gi;
    const examples: string[] = [];
    let match;
    while ((match = exampleRegex.exec(content)) !== null) {
      examples.push(match[1].trim());
    }
    if (examples.length > 0) {
      result.examples = examples;
    }

    return result;
  }

  private async executePython(
    scriptPath: string,
    args?: string,
    skillDoc?: {
      parameters?: Array<{
        name: string;
        type: string;
        default?: string;
        description: string;
        required?: boolean;
      }>;
      examples?: string[];
    },
    timeout: number = 120000,
  ): Promise<ToolResult> {
    const cwd = this.skill.skillDir;

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const cmdArgs: string[] = [scriptPath];

      // 解析参数
      if (args) {
        try {
          // 尝试解析为 JSON
          const parsed = JSON.parse(args);
          if (Array.isArray(parsed)) {
            // 数组参数直接添加
            cmdArgs.push(...parsed.map(String));
          } else if (typeof parsed === "object") {
            // 对象参数转换为命令行参数
            // 根据 SKILL.md 中的参数说明来构造参数
            for (const [key, value] of Object.entries(parsed)) {
              // 检查参数名是否需要特殊处理
              const paramInfo = skillDoc?.parameters?.find(
                (p) =>
                  p.name.replace(/`/g, "").replace(/^--?/, "") ===
                  key.replace(/^--?/, ""),
              );

              // 根据参数类型处理
              if (paramInfo?.type === "flag" || paramInfo?.type === "boolean") {
                // 布尔/标志参数：只有为 true 时才添加
                if (value === true || value === "true") {
                  cmdArgs.push(`--${key}`);
                }
              } else {
                // 普通参数：添加键值对
                cmdArgs.push(`--${key}`, String(value));
              }
            }
          } else {
            cmdArgs.push(String(parsed));
          }
        } catch {
          // 不是 JSON，尝试作为命令行参数字符串解析
          // 如果包含 -- 开头的参数，直接使用
          if (args.includes("--")) {
            // 分割参数并添加到 cmdArgs
            const argParts = args.split(/\s+/).filter((p) => p);
            cmdArgs.push(...argParts);
          } else {
            // 作为普通字符串参数
            cmdArgs.push(args);
          }
        }
      }

      const proc = spawn("python3", cmdArgs, {
        cwd,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        killed = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 1000);
      }, timeout);

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
        if (stdout.length > 50000) {
          stdout = stdout.substring(0, 50000) + "\n... (输出已截断)";
        }
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        if (stderr.length > 10000) {
          stderr = stderr.substring(0, 10000) + "\n... (输出已截断)";
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (killed) {
          resolve({
            success: false,
            error: "执行超时",
          });
        } else {
          // 显示实际执行的命令
          const actualCmd = `python3 ${cmdArgs.join(" ")}`;
          let output = `$ ${actualCmd}\n`;
          output += `工作目录: ${cwd}\n`;
          if (skillDoc?.examples && skillDoc.examples.length > 0) {
            output += `\n参考文档中的示例用法:\n`;
            skillDoc.examples.slice(0, 2).forEach((ex) => {
              output += `  ${ex}\n`;
            });
          }
          output += "---\n";
          if (stdout) {
            output += stdout;
            if (!stdout.endsWith("\n")) {
              output += "\n";
            }
          }
          if (stderr) {
            output += "[stderr]\n" + stderr;
            if (!stderr.endsWith("\n")) {
              output += "\n";
            }
          }
          output += `---\n退出码: ${code ?? 1}`;

          resolve({
            success: code === 0,
            result: output,
            error: code !== 0 ? `命令退出码: ${code}` : undefined,
          });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: `执行失败: ${err.message}`,
        });
      });
    });
  }

  private async executeShell(
    scriptPath: string,
    args?: string,
    timeout: number = 120000,
  ): Promise<ToolResult> {
    const cwd = this.skill.skillDir;

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      // 确保脚本有执行权限
      try {
        fs.chmodSync(scriptPath, 0o755);
      } catch (_) {
        // 忽略权限设置错误
      }

      const cmdArgs = args ? [scriptPath, args] : [scriptPath];
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";

      const proc = spawn(shell, cmdArgs, {
        cwd,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        killed = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 1000);
      }, timeout);

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
        if (stdout.length > 50000) {
          stdout = stdout.substring(0, 50000) + "\n... (输出已截断)";
        }
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        if (stderr.length > 10000) {
          stderr = stderr.substring(0, 10000) + "\n... (输出已截断)";
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (killed) {
          resolve({
            success: false,
            error: "执行超时",
          });
        } else {
          let output = `$ ${shell} ${scriptPath}${args ? " " + args : ""}\n`;
          output += `工作目录: ${cwd}\n`;
          output += "---\n";
          if (stdout) {
            output += stdout;
            if (!stdout.endsWith("\n")) {
              output += "\n";
            }
          }
          if (stderr) {
            output += "[stderr]\n" + stderr;
            if (!stderr.endsWith("\n")) {
              output += "\n";
            }
          }
          output += `---\n退出码: ${code ?? 1}`;

          resolve({
            success: code === 0,
            result: output,
            error: code !== 0 ? `命令退出码: ${code}` : undefined,
          });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: `执行失败: ${err.message}`,
        });
      });
    });
  }

  private async executeNode(
    scriptPath: string,
    args?: string,
    timeout: number = 120000,
  ): Promise<ToolResult> {
    const cwd = this.skill.skillDir;

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const cmdArgs: string[] = [scriptPath];
      if (args) {
        cmdArgs.push(args);
      }

      const proc = spawn("node", cmdArgs, {
        cwd,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        killed = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 1000);
      }, timeout);

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
        if (stdout.length > 50000) {
          stdout = stdout.substring(0, 50000) + "\n... (输出已截断)";
        }
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        if (stderr.length > 10000) {
          stderr = stderr.substring(0, 10000) + "\n... (输出已截断)";
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (killed) {
          resolve({
            success: false,
            error: "执行超时",
          });
        } else {
          let output = "";
          if (stdout) {
            output += stdout;
            if (!stdout.endsWith("\n")) {
              output += "\n";
            }
          }
          if (stderr) {
            output += "[stderr]\n" + stderr;
            if (!stderr.endsWith("\n")) {
              output += "\n";
            }
          }
          if (!output) {
            output = "执行完成（无输出）";
          }

          resolve({
            success: code === 0,
            result: output,
            error: code !== 0 ? `退出码: ${code}` : undefined,
          });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: `执行失败: ${err.message}`,
        });
      });
    });
  }
}
