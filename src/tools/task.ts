import * as vscode from "vscode";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";

export class TaskTool implements Tool {
  name = "Task";
  description = "创建子任务";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "Task",
      description: `创建一个子任务，用于组织复杂的多步骤工作。
- 用于分解复杂任务
- 记录任务进度
- 不会自动执行，只是规划`,
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "任务的简短描述（3-5 个词）",
          },
          prompt: {
            type: "string",
            description: "任务的详细描述和要求",
          },
          subagent_type: {
            type: "string",
            enum: ["general-purpose", "research", "code-review"],
            description: "任务类型",
          },
        },
        required: ["description", "prompt"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const description = params.description as string;
    const prompt = params.prompt as string;
    const subagentType = (params.subagent_type as string) || "general-purpose";

    // 由于这是一个简化的实现，我们只记录任务而不是真正启动子代理
    // 在完整实现中，这里可以启动一个新的 LLM 会话来处理子任务

    const taskId = Date.now().toString(36);

    let result = `子任务已创建\n`;
    result += `---\n`;
    result += `任务 ID: ${taskId}\n`;
    result += `类型: ${subagentType}\n`;
    result += `描述: ${description}\n`;
    result += `详情:\n${prompt}\n`;
    result += `---\n`;
    result += `注意: 当前版本的 Task 工具仅记录任务规划，不会自动执行。请根据任务描述手动完成后续步骤。`;

    // 可选：显示通知
    vscode.window.showInformationMessage(`子任务已创建: ${description}`);

    return {
      success: true,
      result,
    };
  }
}
