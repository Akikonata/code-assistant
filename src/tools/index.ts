import { ToolDefinition, ToolResult } from "../llm/types";
import { Tool, ToolRegistry } from "./types";
import { ReadTool } from "./read";
import { WriteTool } from "./write";
import { EditTool } from "./edit";
import { MultiEditTool } from "./multiEdit";
import { BashTool } from "./bash";
import { GlobTool } from "./glob";
import { GrepTool } from "./grep";
import { WebFetchTool } from "./webFetch";
import { WebSearchTool } from "./webSearch";
import { TaskTool } from "./task";
import { TodoWriteTool } from "./todoWrite";
import { SkillLoader } from "./skillLoader";
import { SkillTool } from "./skill";

export class ToolExecutor {
  private tools: ToolRegistry = {};
  private skillLoader: SkillLoader;

  constructor() {
    this.skillLoader = new SkillLoader();
    this.registerTools();
  }

  private registerTools() {
    const toolInstances: Tool[] = [
      new ReadTool(),
      new WriteTool(),
      new EditTool(),
      new MultiEditTool(),
      new BashTool(),
      new GlobTool(),
      new GrepTool(),
      new WebFetchTool(),
      new WebSearchTool(),
      new TaskTool(),
      new TodoWriteTool(),
    ];

    for (const tool of toolInstances) {
      this.tools[tool.name] = tool;
    }

    // 加载并注册 skill 工具
    this.loadSkills();
  }

  private loadSkills() {
    const skills = this.skillLoader.loadSkills();
    for (const skill of skills) {
      try {
        // 只加载有脚本的 skill
        if (skill.scripts.length === 0) {
          continue;
        }

        const skillTool = new SkillTool(skill, this.skillLoader);
        // 如果名称冲突，跳过
        let toolName = skillTool.name;
        if (this.tools[toolName]) {
          console.warn(`工具名称冲突: ${toolName}，skill 将被跳过`);
          continue;
        }
        this.tools[toolName] = skillTool;
      } catch (error) {
        console.error(`加载 skill 失败 ${skill.skillDir}:`, error);
      }
    }
  }

  /**
   * 重新加载 skill 工具（用于动态更新）
   */
  public reloadSkills() {
    // 移除旧的 skill 工具
    const skillNames = this.skillLoader
      .loadSkills()
      .map((s) => s.metadata.name);
    for (const name of Object.keys(this.tools)) {
      if (skillNames.includes(name)) {
        delete this.tools[name];
      }
    }
    // 重新加载
    this.loadSkills();
  }

  getToolDefinitions(): ToolDefinition[] {
    return Object.values(this.tools).map((tool) => tool.definition);
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.tools[toolName];

    if (!tool) {
      return {
        success: false,
        error: `未知工具: ${toolName}`,
      };
    }

    try {
      return await tool.execute(params);
    } catch (error) {
      return {
        success: false,
        error: `工具执行出错: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  getToolNames(): string[] {
    return Object.keys(this.tools);
  }

  getTool(name: string): Tool | undefined {
    return this.tools[name];
  }

  /**
   * 获取所有基于 Skill 的工具的元数据（用于前端展示菜单）
   */
  getSkillMetadata(): { name: string; description: string }[] {
    return Object.values(this.tools)
      .filter((tool) => tool instanceof SkillTool)
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));
  }
}

export { Tool, ToolRegistry } from "./types";
export { TodoWriteTool } from "./todoWrite";
