import * as vscode from "vscode";
import { Tool } from "./types";
import { ToolDefinition, ToolResult } from "../llm/types";

interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

// 存储当前的 TODO 列表
let currentTodos: TodoItem[] = [];

export class TodoWriteTool implements Tool {
  name = "TodoWrite";
  description = "管理任务列表";

  definition: ToolDefinition = {
    type: "function",
    function: {
      name: "TodoWrite",
      description: `创建和管理任务列表。
- 用于跟踪多步骤任务的进度
- 支持 pending、in_progress、completed 状态
- 帮助组织复杂工作`,
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            description: "任务列表",
            items: {
              type: "object",
              properties: {
                content: {
                  type: "string",
                  description: "任务描述（祈使句形式）",
                },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed"],
                  description: "任务状态",
                },
                activeForm: {
                  type: "string",
                  description: "任务的进行时描述",
                },
              },
              required: ["content", "status", "activeForm"],
            },
          },
        },
        required: ["todos"],
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const todos = params.todos as TodoItem[];

    if (!Array.isArray(todos)) {
      return {
        success: false,
        error: "todos 必须是数组",
      };
    }

    // 更新任务列表
    currentTodos = todos;

    // 格式化输出
    let result = "任务列表已更新\n";
    result += "---\n";

    const statusIcons: Record<string, string> = {
      pending: "⬜",
      in_progress: "🔄",
      completed: "✅",
    };

    const statusLabels: Record<string, string> = {
      pending: "待处理",
      in_progress: "进行中",
      completed: "已完成",
    };

    todos.forEach((todo, index) => {
      const icon = statusIcons[todo.status] || "⬜";
      const label = statusLabels[todo.status] || todo.status;
      result += `${icon} ${index + 1}. ${todo.content} [${label}]\n`;
    });

    // 统计
    const pending = todos.filter((t) => t.status === "pending").length;
    const inProgress = todos.filter((t) => t.status === "in_progress").length;
    const completed = todos.filter((t) => t.status === "completed").length;

    result += "---\n";
    result += `总计: ${todos.length} | 待处理: ${pending} | 进行中: ${inProgress} | 已完成: ${completed}`;

    return {
      success: true,
      result,
    };
  }

  // 获取当前任务列表
  static getCurrentTodos(): TodoItem[] {
    return currentTodos;
  }

  // 清除任务列表
  static clearTodos(): void {
    currentTodos = [];
  }
}
