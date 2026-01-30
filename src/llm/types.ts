export interface ContentPart {
  type: "text" | "image_url" | "video_url";
  text?: string;
  image_url?: {
    url: string;
  };
  video_url?: {
    url: string;
  };
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[]; // 支持字符串或多模态内容
  reasoning_content?: string; // Moonshot API 要求此字段在 content 后、tool_calls 前
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, PropertySchema>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface PropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  enumDescriptions?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
}

export interface ToolCallProgress {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

export interface StreamChunk {
  type:
    | "content"
    | "tool_call"
    | "tool_call_progress"
    | "reasoning_content"
    | "done"
    | "error";
  content?: string;
  reasoningContent?: string;
  toolCall?: ToolCall;
  toolCallProgress?: ToolCallProgress;
  error?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  tool_choice?:
    | "auto"
    | "none"
    | { type: "function"; function: { name: string } };
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    finish_reason: string | null;
  }[];
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: Message;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}
