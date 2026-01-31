import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";

export class BashTool implements Tool {
  name = "Bash";
  description = "执行 Shell 命令";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "Bash",
      description: `执行 Shell 命令。
- 在工作区目录下执行
- 支持超时控制（默认 120 秒）
- 避免执行危险命令`,
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的命令",
          },
          timeout: {
            type: "number",
            description: "超时时间（毫秒），默认 120000",
          },
          description: {
            type: "string",
            description: "命令描述（5-10 字）",
          },
        },
        required: ["command"],
      },
    },
  };

  // 危险命令黑名单
  private dangerousPatterns = [
    /rm\s+-rf\s+[/~]/i,
    /rm\s+-rf\s+\*/i,
    /mkfs/i,
    /dd\s+if=/i,
    /format\s+[a-z]:/i,
    />\s*\/dev\/sd/i,
    /chmod\s+-R\s+777\s+\//i,
  ];

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const command = params.command as string;
    const timeout = (params.timeout as number) || 120000;
    const description = params.description as string;

    if (!command) {
      return {
        success: false,
        error: "命令参数为空",
      };
    }

    // 检查危险命令
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          success: false,
          error: "拒绝执行可能危险的命令",
        };
      }
    }

    try {
      const cwd = this.getWorkingDirectory();
      const result = await this.executeCommand(command, cwd, timeout);

      let output = "";
      if (description) {
        output += `# ${description}\n`;
      }
      output += `$ ${command}\n`;
      output += `工作目录: ${cwd}\n`;
      output += "---\n";

      if (result.stdout) {
        output += result.stdout;
        if (!result.stdout.endsWith("\n")) {
          output += "\n";
        }
      }

      if (result.stderr) {
        output += "[stderr]\n" + result.stderr;
        if (!result.stderr.endsWith("\n")) {
          output += "\n";
        }
      }

      output += `---\n退出码: ${result.exitCode}`;

      return {
        success: result.exitCode === 0,
        result: output,
        error:
          result.exitCode !== 0 ? `命令退出码: ${result.exitCode}` : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `执行命令失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  private getWorkingDirectory(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.fsPath;
    }
    return process.cwd();
  }

  private executeCommand(
    command: string,
    cwd: string,
    timeout: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
      const shellArgs =
        process.platform === "win32"
          ? ["/c", command]
          : ["-c", command.trimEnd().replace(/\n*$/, "") + "\nexit"];

      const proc = spawn(shell, shellArgs, {
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
        // 限制输出大小
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
          reject(new Error("命令执行超时"));
        } else {
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 1,
          });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
