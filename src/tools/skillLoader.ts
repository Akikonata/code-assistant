import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ToolDefinition } from "../llm/types";

export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
}

export interface LoadedSkill {
  skillDir: string;
  metadata: SkillMetadata;
  skillMdPath: string;
  skillMdContent: string; // SKILL.md 的完整内容
  scripts: string[]; // 脚本文件路径
}

export class SkillLoader {
  private skillsBaseDir: string;

  constructor() {
    // 获取工作区根目录下的 .assistant/skills 目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.skillsBaseDir = path.join(
        workspaceFolders[0].uri.fsPath,
        ".assistant",
        "skills",
      );
    } else {
      // 如果没有工作区，使用当前工作目录
      this.skillsBaseDir = path.join(process.cwd(), ".assistant", "skills");
    }
  }

  /**
   * 解析 YAML frontmatter
   */
  private parseFrontmatter(content: string): SkillMetadata | null {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return null;
    }

    const frontmatter = match[1];
    const metadata: Partial<SkillMetadata> = {};

    // 简单解析 YAML key-value
    const lines = frontmatter.split("\n");
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // 移除引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key === "name") {
        metadata.name = value;
      } else if (key === "description") {
        metadata.description = value;
      } else if (key === "license") {
        metadata.license = value;
      }
    }

    if (metadata.name && metadata.description) {
      return metadata as SkillMetadata;
    }

    return null;
  }

  /**
   * 查找脚本文件
   */
  private findScripts(skillDir: string): string[] {
    const scripts: string[] = [];
    const scriptsDir = path.join(skillDir, "scripts");

    if (!fs.existsSync(scriptsDir)) {
      return scripts;
    }

    try {
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            // 支持常见的脚本文件
            if (
              [".py", ".sh", ".bash", ".js", ".ts", ".rb", ".pl"].includes(ext)
            ) {
              scripts.push(fullPath);
            }
          }
        }
      };

      walk(scriptsDir);
    } catch (error) {
      console.error(`读取 scripts 目录失败 ${scriptsDir}:`, error);
    }

    return scripts;
  }

  /**
   * 加载所有 skill
   */
  public loadSkills(): LoadedSkill[] {
    const skills: LoadedSkill[] = [];

    if (!fs.existsSync(this.skillsBaseDir)) {
      return skills;
    }

    try {
      const entries = fs.readdirSync(this.skillsBaseDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillDir = path.join(this.skillsBaseDir, entry.name);
        const skillMdPath = path.join(skillDir, "SKILL.md");

        if (!fs.existsSync(skillMdPath)) {
          continue;
        }

        try {
          const content = fs.readFileSync(skillMdPath, "utf-8");
          const metadata = this.parseFrontmatter(content);

          if (!metadata) {
            console.warn(`无法解析 SKILL.md 的 frontmatter: ${skillDir}`);
            continue;
          }

          const scripts = this.findScripts(skillDir);

          skills.push({
            skillDir,
            metadata,
            skillMdPath,
            skillMdContent: content, // 保存完整的 SKILL.md 内容
            scripts,
          });
        } catch (error) {
          console.error(`加载 skill 失败 ${skillDir}:`, error);
        }
      }
    } catch (error) {
      console.error(`读取 skills 目录失败:`, error);
    }

    return skills;
  }

  /**
   * 解析 SKILL.md 文档，提取参数说明
   */
  private parseSkillParameters(skillMdContent: string): Array<{
    name: string;
    type: string;
    default?: string;
    description: string;
    required?: boolean;
  }> {
    const parameters: Array<{
      name: string;
      type: string;
      default?: string;
      description: string;
      required?: boolean;
    }> = [];

    // 解析参数表格（查找 "Optional Parameters" 或 "Parameters" 部分）
    const paramTableRegex =
      /##+\s*(?:Optional\s+)?Parameters?[\s\S]*?\|[-\s|]+\|[\s\S]*?((?:\|[^\n]+\|\n?)+)/i;
    const paramTableMatch = skillMdContent.match(paramTableRegex);

    if (paramTableMatch) {
      const tableLines = paramTableMatch[1]
        .split("\n")
        .filter((line) => line.trim().startsWith("|"));

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

          // 检查是否是必需参数
          const requiredSection = skillMdContent.match(
            /##+\s*Required\s+Parameters?/i,
          );
          const isRequired =
            requiredSection &&
            !skillMdContent.match(/##+\s*Optional\s+Parameters/i);

          parameters.push({
            name: nameCell,
            type: typeCell,
            default: defaultCell || undefined,
            description: descCell,
            required: isRequired && !defaultCell,
          });
        }
      }
    }

    return parameters;
  }

  /**
   * 将 Skill 转换为 ToolDefinition
   * 这里我们创建一个通用的工具，可以执行 skill 目录下的脚本
   */
  public skillToToolDefinition(skill: LoadedSkill): ToolDefinition {
    // 构建参数定义
    const properties: Record<string, any> = {
      script: {
        type: "string",
        description: "要执行的脚本文件名（相对于 scripts/ 目录）",
      },
    };

    // 如果有多个脚本，可以添加枚举
    if (skill.scripts.length > 0) {
      const scriptNames = skill.scripts.map((s) => path.basename(s));
      properties.script.enum = scriptNames;
      properties.script.description += `。可用脚本: ${scriptNames.join(", ")}`;
    }

    // 解析 SKILL.md 中的参数说明
    const skillParams = this.parseSkillParameters(skill.skillMdContent || "");

    // 构建更详细的参数说明
    let argsDescription = "传递给脚本的参数。";
    if (skillParams.length > 0) {
      argsDescription += "\n\n支持的参数（根据 SKILL.md 文档）：\n";
      skillParams.forEach((param) => {
        const paramName = param.name.replace(/^--?/, ""); // 移除 -- 前缀
        argsDescription += `- ${param.name} (${param.type})`;
        if (param.default) {
          argsDescription += `，默认值: ${param.default}`;
        }
        if (param.description) {
          argsDescription += ` - ${param.description}`;
        }
        argsDescription += "\n";
      });
      argsDescription +=
        '\n参数应以 JSON 对象格式提供，例如: {"type": "pine", "season": "autumn", "output": "tree.html"}';
    } else {
      argsDescription +=
        "参数应以 JSON 对象格式提供，或直接提供命令行参数字符串。";
    }

    // 添加通用参数
    properties.args = {
      type: "string",
      description: argsDescription,
    };

    // 构建完整的描述，包含 SKILL.md 中的使用说明
    let fullDescription = skill.metadata.description;
    if (skillParams.length > 0) {
      fullDescription +=
        "\n\n使用前请参考 SKILL.md 文档了解详细的参数说明和使用示例。";
    }

    return {
      type: "function",
      function: {
        name: skill.metadata.name,
        description: fullDescription,
        parameters: {
          type: "object",
          properties,
          required: skill.scripts.length > 0 ? ["script"] : [],
        },
      },
    };
  }

  /**
   * 获取 skills 基础目录路径
   */
  public getSkillsBaseDir(): string {
    return this.skillsBaseDir;
  }
}
