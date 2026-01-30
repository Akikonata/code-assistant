import { ToolDefinition, ToolResult } from "../llm/types";

export interface Tool {
  name: string;
  description: string;
  definition: ToolDefinition;
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolRegistry {
  [name: string]: Tool;
}
