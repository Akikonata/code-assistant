# 智能代码助手 (Code Assistant)

基于大模型的 VS Code 智能代码助手插件，支持自定义 API、多种内置工具与工作区自定义 Skill，带侧边栏聊天界面。

## 功能特性

- **多服务 / 多模型**：支持配置多个 API 服务（OpenAI、Deepseek、通义、Kimi 等 OpenAI 兼容接口），侧边栏内切换服务与模型
- **流式响应**：实时流式输出 AI 回复，支持思考过程、工具调用过程展示
- **工具调用**：内置文件读写、编辑、终端命令、搜索、网页抓取、网络搜索、任务列表等工具，由模型按需调用
- **多模态输入**：支持上传图片、视频（可多选），拖拽到输入区即可添加
- **历史会话**：对话默认保存在本地，可恢复上次会话；支持历史列表、切换会话、删除会话
- **导出对话**：将当前会话导出为纯文本 / Markdown 文件
- **自定义 Skill**：在工作区 `.assistant/skills` 下放置技能（`SKILL.md` + `scripts/`），可被模型作为工具调用；输入 `/` 可唤起技能菜单
- **侧边栏界面**：聊天、模型选择、附件、历史、导出、设置均集中在侧边栏

## 支持的内置工具

| 工具      | 描述                 |
| --------- | -------------------- |
| Read      | 读取文件内容         |
| Write     | 写入文件内容         |
| Edit      | 编辑文件（字符串替换）|
| MultiEdit | 批量编辑文件         |
| Bash      | 执行终端命令         |
| Glob      | 按模式匹配文件       |
| Grep      | 搜索文件内容         |
| WebFetch  | 获取网页内容         |
| WebSearch | 网络搜索             |
| Task      | 创建子任务           |
| TodoWrite | 管理任务列表         |

工作区 `.assistant/skills` 下配置的 Skill 会作为额外工具注册给模型使用。

## 安装

### 开发模式

1. 克隆仓库并安装依赖：
   ```bash
   npm install
   ```
2. 构建：
   ```bash
   npm run build
   ```
3. 在 VS Code 中按 **F5** 启动扩展开发主机，即可调试。

### 打包为 VSIX

```bash
npm install -g @vscode/vsce
vsce package
```

在 VS Code 中通过「从 VSIX 安装」安装生成的 `.vsix` 文件。

## 配置

1. 打开侧边栏「智能助手」视图，点击右上角 **设置** 图标，或使用命令 **Code Assistant: 打开设置**。
2. 在设置面板中：
   - **添加 API 服务**：填写服务名称、API 基础地址、API Key、模型列表（可多选/自定义）。
   - **选择当前服务与模型**：在侧边栏顶部下拉框中选择本次对话使用的服务与模型。
   - **生成参数**（可选）：如最大 token、temperature 等，按需填写。

配置保存在 VS Code 的全局存储中，无需在 `settings.json` 里手写（也支持从旧版 `codeAssistant.*` 配置迁移）。

## 使用方法

1. 点击左侧活动栏的「智能代码助手」图标，打开侧边栏。
2. 在顶部选择 **API 服务** 和 **模型**（若未配置，先点设置完成配置）。
3. 在输入框中输入问题或指令；可上传图片/视频（点击 📎 或拖拽到输入区），支持多选。
4. 按 **Enter** 发送（输入法下避免误触可配合 Shift+Enter 换行）。
5. 查看流式回复；若模型调用工具，会展示执行过程与结果。
6. **历史**：点击「历史」查看/切换/删除过往会话；**导出**：点击「导出」将当前对话导出为文件；**新对话**：点击「+ 新对话」清空当前会话并开始新对话。

### 斜杠与 Skill

- 输入 **`/`** 可打开技能菜单，选择后会在输入中插入对应技能名，便于模型优先使用该技能。
- 自定义 Skill 放在工作区 **`.assistant/skills`** 下，每个技能一个目录，内含 **`SKILL.md`**（含 name、description 等）和 **`scripts/`**（如 `.py` / `.sh` / `.js` 脚本）。插件会加载并把这些技能作为工具暴露给模型。

### 示例对话

```
你: 帮我列出当前目录下所有 TypeScript 文件

助手: [调用 Glob 工具] 找到以下文件：
- src/extension.ts
- src/llm/client.ts
...
```

## 命令

| 命令 | 说明 |
|------|------|
| **Code Assistant: 新建对话** | 清空当前对话并开始新会话 |
| **Code Assistant: 清除历史** | 清除当前会话并清空历史列表 |
| **Code Assistant: 打开设置** | 打开 API/模型配置面板 |
| **Code Assistant: 刷新配置** | 重新从配置加载并刷新侧边栏（如修改设置后） |

## 项目结构

```
code-plugin/
├── src/
│   ├── extension.ts           # 插件入口与命令注册
│   ├── sidebar/
│   │   ├── SidebarProvider.ts # 侧边栏 Webview 与会话逻辑
│   │   └── webviewContent.ts   # 聊天 UI 与前端逻辑
│   ├── settings/
│   │   └── SettingsPanel.ts   # 设置面板（API/模型配置）
│   ├── llm/                    # LLM 客户端与类型
│   ├── tools/                  # 内置工具与 Skill 加载
│   │   ├── skillLoader.ts      # 从 .assistant/skills 加载技能
│   │   └── skill.ts            # Skill 工具执行
│   └── config/                 # 配置与存储
├── package.json
├── esbuild.config.js
└── tsconfig.json
```

## 开发

```bash
npm run build    # 构建
npm run watch    # 监听模式构建
npm run lint     # 代码检查
```

## 注意事项

- 请妥善保管 API 密钥；配置保存在本地，不会上传。
- 工具（如 Bash）会在本机实际执行，请谨慎授权与使用。
- 使用编辑/写文件类工具前，建议对重要文件做备份。

## 许可证

MIT
