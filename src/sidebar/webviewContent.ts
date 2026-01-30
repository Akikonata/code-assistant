import * as vscode from "vscode";

export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  // 获取 nonce 用于 CSP
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src data: ${webview.cspSource};">
  <title>智能代码助手</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, system-ui, -apple-system, sans-serif);
      --message-spacing: 12px;
      --border-radius: 8px;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.5;
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    /* 头部工具栏 */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBarSectionHeader-background);
    }
    
    .header-title {
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--vscode-sideBarSectionHeader-foreground);
    }
    
    .header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .header-btn {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      line-height: 1;
    }
    
    .header-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    
    .header-btn.icon-only {
      font-size: 14px;
      padding: 4px 8px;
      min-width: 28px;
      min-height: 28px;
    }
    .header-btn.icon-only .icon-char {
      display: inline-block;
      transform: scale(1.15);
      vertical-align: middle;
    }
    
    /* 配置提示 */
    .config-notice {
      padding: 12px;
      background: var(--vscode-inputValidation-warningBackground);
      border-bottom: 1px solid var(--vscode-inputValidation-warningBorder);
      font-size: 12px;
    }
    
    .config-notice a {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
    }
    
    /* 聊天区域 */
    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: var(--message-spacing);
    }
    
    .message {
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: fadeIn 0.2s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .message-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    
    .message-role {
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .message.user .message-role {
      color: var(--vscode-charts-blue);
    }
    
    .message.assistant .message-role {
      color: var(--vscode-charts-green);
    }
    
    .message-content {
      padding: 10px 12px;
      border-radius: var(--border-radius);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    
    .message.user .message-content {
      background: var(--vscode-input-background);
    }
    
    /* 代码块样式 */
    .message-content pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.4;
    }
    
    .message-content code {
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 12px;
    }
    
    .message-content pre code {
      background: none;
      padding: 0;
    }
    
    /* 工具调用样式 */
    .tool-call {
      margin: 8px 0;
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--border-radius);
      overflow: hidden;
    }
    
    .tool-call-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--vscode-sideBarSectionHeader-background);
      font-size: 12px;
      cursor: pointer;
    }
    
    .tool-call-header:hover {
      background: var(--vscode-list-hoverBackground);
    }
    
    .tool-icon {
      font-size: 14px;
    }
    
    .tool-name {
      font-weight: 600;
      color: var(--vscode-symbolIcon-functionForeground);
    }
    
    .tool-status {
      margin-left: auto;
      font-size: 11px;
    }
    
    .tool-status.running {
      color: var(--vscode-charts-yellow);
    }
    
    .tool-status.success {
      color: var(--vscode-charts-green);
    }
    
    .tool-status.error {
      color: var(--vscode-charts-red);
    }
    
    .tool-call-body {
      padding: 8px 12px;
      background: var(--vscode-editor-background);
      font-size: 12px;
      max-height: 200px;
      overflow-y: auto;
      display: none;
    }
    
    .tool-call.expanded .tool-call-body {
      display: block;
    }
    
    .tool-call-args {
      color: var(--vscode-descriptionForeground);
    }
    
    .tool-call-result {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .error-message {
      color: var(--vscode-charts-red);
      font-size: 12px;
    }

    .error-retry-btn {
      margin-left: 8px;
      padding: 2px 8px;
      font-size: 11px;
      border-radius: 4px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
    }

    .error-retry-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    /* 输入区域 */
    .input-container {
      padding: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .input-container.drag-over {
      outline: 2px dashed var(--vscode-focusBorder);
      outline-offset: -6px;
    }

    .drop-overlay {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.08);
      color: var(--vscode-foreground);
      font-size: 12px;
      pointer-events: none;
    }

    .input-container.drag-over .drop-overlay {
      display: flex;
    }

    .input-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .input-select {
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 12px;
      max-width: 180px;
    }

    
    .input-wrapper {
      display: flex;
      gap: 10px;
      align-items: center;
      min-height: 40px;
      padding: 6px 0;
    }
    
    .input-field {
      flex: 1;
      min-height: 36px;
      max-height: 150px;
      padding: 8px 12px;
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--border-radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
      resize: none;
      outline: none;
      line-height: 1.4;
    }
    
    .input-field:focus {
      border-color: var(--vscode-focusBorder);
    }
    
    .input-field::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }
    
    /* 输入行内的上传按钮：与输入框同高、同风格 */
    .input-upload-btn {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--border-radius);
      background: var(--vscode-input-background);
      color: var(--vscode-foreground);
      font-size: 18px;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    
    .input-upload-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }
    
    .input-upload-btn:active {
      background: var(--vscode-input-background);
    }
    
    .send-btn {
      flex-shrink: 0;
      min-height: 40px;
      padding: 8px 18px;
      border: none;
      border-radius: var(--border-radius);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease;
    }
    
    .send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    /* 加载动画 */
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 8px;
    }

    .status-text {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    
    .typing-indicator span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--vscode-descriptionForeground);
      animation: typing 1.4s infinite ease-in-out;
    }
    
    .typing-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }
    
    .typing-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }
    
    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }
    
    /* 流式输入光标 */
    .cursor-blink {
      animation: blink 1s infinite;
      color: var(--vscode-editorCursor-foreground, #007acc);
    }
    
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    
    /* 思考内容区域 */
    .thinking-content {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding: 8px 12px;
      margin-bottom: 12px;
      border-radius: 0 4px 4px 0;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    
    .thinking-header {
      font-weight: 500;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
    }
    
    .thinking-text {
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 150px;
      overflow-y: auto;
    }
    
    /* Tool Call 进度区域 */
    .tool-call-progress {
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border);
      padding: 8px 12px;
      margin: 8px 0;
      border-radius: 4px;
      font-size: 12px;
    }
    
    .tool-call-progress.completed {
      border-color: var(--vscode-testing-iconPassed, #4caf50);
      opacity: 0.8;
    }
    
    .tool-progress-header {
      font-weight: 500;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
    }
    
    .tool-progress-args {
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 200px;
      overflow-y: auto;
      margin: 0;
      padding: 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11px;
      color: var(--vscode-editor-foreground);
    }
    
    /* 思考内容完成状态 */
    .thinking-content.completed .thinking-header {
      color: var(--vscode-testing-iconPassed, #4caf50);
    }
    
    /* 欢迎消息 */
    .welcome {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }
    
    .welcome h2 {
      font-size: 16px;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    
    .welcome p {
      font-size: 13px;
      margin-bottom: 16px;
    }
    
    .welcome-features {
      text-align: left;
      display: inline-block;
      font-size: 12px;
    }
    
    .welcome-features li {
      margin: 4px 0;
      list-style: none;
      padding-left: 20px;
      position: relative;
    }
    
    .welcome-features li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: var(--vscode-charts-green);
    }
    
    /* 滚动条样式 */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground);
    }
    
    /* 附件容器样式 */
    #attachmentsContainer {
      display: none;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 0;
      margin-bottom: 4px;
      border-bottom: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      border-radius: var(--border-radius);
      max-height: 160px;
      overflow-y: auto;
    }
    
    #attachmentsContainer img {
      object-fit: contain;
      background: var(--vscode-editor-background);
    }

    /* Skills 斜杠菜单 */
    .skills-menu {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 56px;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      max-height: 220px;
      overflow-y: auto;
      z-index: 20;
      padding: 4px 0;
      display: none;
    }

    .skills-menu.visible {
      display: block;
    }

    .skills-menu-item {
      padding: 6px 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .skills-menu-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .skills-menu-item-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .skills-menu-item-desc {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    /* 历史会话下拉 */
    .history-dropdown {
      position: relative;
    }
    .history-menu {
      display: none;
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      min-width: 220px;
      max-height: 280px;
      overflow-y: auto;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 100;
      padding: 4px 0;
    }
    .history-menu.visible {
      display: block;
    }
    .history-menu-item {
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-foreground);
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .history-menu-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .history-menu-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .history-menu-item .history-item-title {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .history-menu-item .history-item-date {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }
    .history-menu-item-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-foreground);
      border: none;
      background: none;
      text-align: left;
    }
    .history-menu-item-wrap:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .history-menu-item-wrap.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .history-menu-item-content {
      flex: 1;
      min-width: 0;
    }
    .history-menu-item-delete {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      opacity: 0.7;
    }
    .history-menu-item-delete:hover {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-errorForeground);
      opacity: 1;
    }
    .history-menu-empty {
      padding: 12px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-title">智能助手</span>
    <div class="header-actions">
      <div class="history-dropdown">
        <button class="header-btn" id="historyBtn" title="历史会话">
          📋 历史
        </button>
        <div class="history-menu" id="historyMenu"></div>
      </div>
      <button class="header-btn" id="exportBtn" title="导出当前对话">
        导出
      </button>
      <button class="header-btn" id="newChatBtn" title="新建对话">
        <span>+</span> 新对话
      </button>
      <button class="header-btn icon-only" id="settingsBtn" title="设置">
        <span class="icon-char">⚙</span>
      </button>
    </div>
  </div>
  
  <div class="config-notice" id="configNotice" style="display: none;">
    请先配置 API 服务与密钥。<a id="openSettingsLink">点击打开设置</a>
  </div>

  
  <div class="chat-container" id="chatContainer">
    <div class="welcome" id="welcomeMessage">
      <h2>智能代码助手</h2>
      <p>我可以帮助你完成各种编程任务</p>
      <ul class="welcome-features">
        <li>读取和编辑代码文件</li>
        <li>执行终端命令</li>
        <li>搜索和分析代码</li>
        <li>解答编程问题</li>
      </ul>
    </div>
  </div>
  
  <div class="input-container" id="inputContainer">
    <div class="input-toolbar">
      <select class="input-select" id="providerSelect" title="选择 API 服务">
      </select>
      <select class="input-select" id="modelSelect" title="选择模型">
      </select>
    </div>
    <div id="attachmentsContainer"></div>
    <div class="input-wrapper">
      <input type="file" id="fileInput" accept="image/*,video/*" multiple style="display: none;">
      <button type="button" class="input-upload-btn" id="uploadBtn" title="上传图片/视频（可多选多张图片、多个视频）">
        📎
      </button>
      <textarea 
        class="input-field" 
        id="inputField" 
        placeholder="输入消息，按 Enter 发送..."
        rows="1"
      ></textarea>
      <button type="button" class="send-btn" id="sendBtn">
        发送
      </button>
    </div>
    <div class="drop-overlay" id="dropOverlay">拖拽图片/视频到这里添加（支持多张、多个）</div>
    <div class="skills-menu" id="skillsMenu"></div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      
      // DOM 元素
      const chatContainer = document.getElementById('chatContainer');
      const inputField = document.getElementById('inputField');
      const sendBtn = document.getElementById('sendBtn');
      const newChatBtn = document.getElementById('newChatBtn');
      const historyBtn = document.getElementById('historyBtn');
      const historyMenu = document.getElementById('historyMenu');
      const exportBtn = document.getElementById('exportBtn');
      const settingsBtn = document.getElementById('settingsBtn');
      const configNotice = document.getElementById('configNotice');
      const openSettingsLink = document.getElementById('openSettingsLink');
      const welcomeMessage = document.getElementById('welcomeMessage');
      const providerSelect = document.getElementById('providerSelect');
      const modelSelect = document.getElementById('modelSelect');
      const fileInput = document.getElementById('fileInput');
      const uploadBtn = document.getElementById('uploadBtn');
      const attachmentsContainer = document.getElementById('attachmentsContainer');
      const inputContainer = document.getElementById('inputContainer');
      const skillsMenu = document.getElementById('skillsMenu');
      
      let isProcessing = false;
      let currentAssistantMessage = null;
      let currentToolCalls = new Map();
      let attachedFiles = []; // 存储附件信息
      let allSkills = [];
      let skillsLoaded = false;
      let sessionList = []; // { id, title, updatedAt, isActive }[]

      // 拖拽添加图片/视频
      let dragCounter = 0;
      function hasFilesTransfer(e) {
        try {
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files.length > 0) return true;
          const types = Array.from(dt?.types || []);
          // 不同平台/内核可能表现不同，这里做兼容兜底
          return types.includes('Files') || types.includes('application/x-moz-file');
        } catch (_) {
          return false;
        }
      }
      function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
      }
      function showDragOver() {
        if (!inputContainer) return;
        inputContainer.classList.add('drag-over');
      }
      function hideDragOver() {
        if (!inputContainer) return;
        inputContainer.classList.remove('drag-over');
      }

      // 全局兜底：确保拖到 webview 内任意位置都有反应
      document.addEventListener('dragenter', (e) => {
        if (!hasFilesTransfer(e)) return;
        preventDefaults(e);
        dragCounter++;
        showDragOver();
      }, true);
      document.addEventListener('dragover', (e) => {
        if (!hasFilesTransfer(e)) return;
        preventDefaults(e);
        try {
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        } catch (_) {}
        showDragOver();
      }, true);
      document.addEventListener('dragleave', (e) => {
        if (!hasFilesTransfer(e)) return;
        preventDefaults(e);
        dragCounter = Math.max(0, dragCounter - 1);
        if (dragCounter === 0) hideDragOver();
      }, true);
      document.addEventListener('drop', async (e) => {
        if (!hasFilesTransfer(e)) return;
        preventDefaults(e);
        dragCounter = 0;
        hideDragOver();
        const files = Array.from(e.dataTransfer?.files || []);
        for (const file of files) {
          await addAttachment(file);
        }
      }, true);

      if (inputContainer) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
          inputContainer.addEventListener(eventName, preventDefaults);
        });

        inputContainer.addEventListener('dragenter', (e) => {
          if (!hasFilesTransfer(e)) return;
          dragCounter++;
          showDragOver();
        });
        inputContainer.addEventListener('dragover', (e) => {
          if (!hasFilesTransfer(e)) return;
          showDragOver();
        });
        inputContainer.addEventListener('dragleave', (e) => {
          if (!hasFilesTransfer(e)) return;
          dragCounter = Math.max(0, dragCounter - 1);
          if (dragCounter === 0) {
            hideDragOver();
          }
        });
        inputContainer.addEventListener('drop', async (e) => {
          dragCounter = 0;
          hideDragOver();
          const files = Array.from(e.dataTransfer?.files || []);
          for (const file of files) {
            await addAttachment(file);
          }
        });
      }

      // 请求 skills 列表（用于斜杠菜单）
      vscode.postMessage({ type: 'getSkills' });
      
      // 初始化
      vscode.postMessage({ type: 'webviewReady' });
      vscode.postMessage({ type: 'getConfig' });
      
      // 文件上传按钮
      if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
          fileInput.click();
        });
        
        fileInput.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files || []);
          for (const file of files) {
            await addAttachment(file);
          }
          fileInput.value = ''; // 重置，允许重复选择同一文件
        });
      }

      // 渲染 skills 菜单
      function renderSkillsMenu(filterText) {
        if (!skillsMenu) return;
        const query = (filterText || '').trim().toLowerCase();
        const hasSlashPrefix = filterText && filterText.startsWith('/');

        if (!hasSlashPrefix) {
          skillsMenu.classList.remove('visible');
          skillsMenu.innerHTML = '';
          return;
        }

        const keyword = query.slice(1); // 去掉前导斜杠

        let filtered = allSkills;
        if (keyword) {
          filtered = allSkills.filter((s) => {
            const name = (s.name || '').toLowerCase();
            const desc = (s.description || '').toLowerCase();
            return name.includes(keyword) || desc.includes(keyword);
          });
        }

        if (!filtered.length) {
          skillsMenu.classList.remove('visible');
          skillsMenu.innerHTML = '';
          return;
        }

        skillsMenu.innerHTML = '';
        filtered.forEach((skill) => {
          const item = document.createElement('div');
          item.className = 'skills-menu-item';

          const nameEl = document.createElement('div');
          nameEl.className = 'skills-menu-item-name';
          // 不能在外层模板字符串中使用内层模板字符串，避免 TS 解析干扰
          nameEl.textContent = '/' + (skill.name || '');

          const descEl = document.createElement('div');
          descEl.className = 'skills-menu-item-desc';
          descEl.textContent = skill.description || '';

          item.appendChild(nameEl);
          item.appendChild(descEl);

          item.addEventListener('click', () => {
            if (!inputField) return;
            // 将输入替换为选中的 skill 命令前缀，保留后续文本（如果有）
            const current = inputField.value || '';
            let rest = '';
            if (current.startsWith('/')) {
              const firstSpace = current.indexOf(' ');
              if (firstSpace >= 0) {
                rest = current.slice(firstSpace + 1).trimStart();
              }
            } else {
              rest = current.trimStart();
            }
            const skillName = skill.name || '';
            inputField.value =
              '/' + skillName + (rest ? ' ' + rest : ' ');
            inputField.focus();
            // 将光标移动到文本末尾
            const len = inputField.value.length;
            inputField.setSelectionRange(len, len);
            skillsMenu.classList.remove('visible');
          });

          skillsMenu.appendChild(item);
        });

        skillsMenu.classList.add('visible');
      }
      
      // 添加附件
      function addAttachment(file) {
        // 检查文件类型
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
          alert('仅支持图片和视频文件');
          return Promise.resolve();
        }
        
        // 检查文件大小（100MB 限制）
        if (file.size > 100 * 1024 * 1024) {
          alert('文件大小不能超过 100MB');
          return Promise.resolve();
        }
        
        // 转换为 base64
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = e.target && e.target.result ? e.target.result : '';
            const fileInfo = {
              name: file.name,
              type: file.type,
              size: file.size,
              base64: base64,
              isImage: isImage,
              isVideo: isVideo
            };
            attachedFiles.push(fileInfo);
            renderAttachments();
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(file);
        });
      }
      
      // 渲染附件预览
      function renderAttachments() {
        if (!attachmentsContainer) return;
        
        if (attachedFiles.length === 0) {
          attachmentsContainer.style.display = 'none';
          attachmentsContainer.innerHTML = '';
          return;
        }
        
        attachmentsContainer.style.display = 'flex';
        attachmentsContainer.innerHTML = '';
        attachedFiles.forEach((file, index) => {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'position: relative; display: inline-block; vertical-align: top; margin-right: 8px;';

          if (file.isImage) {
            const img = document.createElement('img');
            img.src = file.base64;
            img.alt = file.name;
            img.style.cssText = 'width: 120px; height: 120px; border-radius: 4px; border: 1px solid var(--vscode-input-border); display: block; object-fit: contain; background: var(--vscode-editor-background);';

            const fallback = document.createElement('div');
            fallback.textContent = '🖼️';
            fallback.style.cssText = 'display: none; width: 120px; height: 120px; background: var(--vscode-textBlockQuote-background); border-radius: 4px; border: 1px solid var(--vscode-input-border); align-items: center; justify-content: center; font-size: 24px;';

            img.addEventListener('error', () => {
              img.style.display = 'none';
              fallback.style.display = 'flex';
            });

            wrapper.appendChild(img);
            wrapper.appendChild(fallback);
          } else if (file.isVideo) {
            const video = document.createElement('video');
            video.src = file.base64;
            video.controls = true;
            video.style.cssText = 'width: 120px; height: 120px; border-radius: 4px; border: 1px solid var(--vscode-input-border); display: block; object-fit: contain; background: var(--vscode-editor-background);';
            wrapper.appendChild(video);
          }

          const removeBtn = document.createElement('button');
          removeBtn.textContent = '×';
          removeBtn.style.cssText = 'position: absolute; top: -6px; right: -6px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 14px; line-height: 1; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10;';
          removeBtn.addEventListener('click', () => {
            attachedFiles.splice(index, 1);
            renderAttachments();
          });
          wrapper.appendChild(removeBtn);

          const nameDiv = document.createElement('div');
          nameDiv.textContent = file.name;
          nameDiv.style.cssText = 'font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center;';
          wrapper.appendChild(nameDiv);

          attachmentsContainer.appendChild(wrapper);
        });
      }
      
      // 移除附件：已由预览上的“×”按钮处理
      
      // 自动调整输入框高度
      if (inputField) {
        inputField.addEventListener('input', () => {
          inputField.style.height = 'auto';
          inputField.style.height = Math.min(inputField.scrollHeight, 150) + 'px';

          // 处理斜杠菜单：仅当光标在第一行开头以 / 开头时启用
          const value = inputField.value || '';
          if (value.startsWith('/')) {
            renderSkillsMenu(value);
          } else if (skillsMenu) {
            skillsMenu.classList.remove('visible');
          }
        });
      }
      
      // 发送消息或停止生成
      function sendMessage() {
        // 如果正在处理，点击按钮应该停止生成
        if (isProcessing) {
          vscode.postMessage({ type: 'stopGeneration' });
          return;
        }
        
        if (!inputField) return;
        const message = inputField.value.trim();
        if (!message && attachedFiles.length === 0) return;
        
        vscode.postMessage({ 
          type: 'sendMessage', 
          message: message,
          attachments: attachedFiles.map(f => ({
            name: f.name,
            type: f.type,
            base64: f.base64,
            isImage: f.isImage,
            isVideo: f.isVideo
          }))
        });
        inputField.value = '';
        inputField.style.height = 'auto';
        attachedFiles = [];
        renderAttachments();
      }
      
      // 键盘事件
      if (inputField) {
        inputField.addEventListener('keydown', (e) => {
          // 检查输入法是否正在输入（isComposing 或 keyCode 229）
          // 输入法打开时不发送消息
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            sendMessage();
          }

          // ESC 关闭 skills 菜单
          if (e.key === 'Escape' && skillsMenu) {
            skillsMenu.classList.remove('visible');
          }
        });
      }
      
      if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
      }
      
      if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'newChat' });
        });
      }
      
      function renderHistoryMenu() {
        if (!historyMenu) return;
        historyMenu.innerHTML = '';
        if (sessionList.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'history-menu-empty';
          empty.textContent = '暂无历史会话';
          historyMenu.appendChild(empty);
          return;
        }
        sessionList.forEach(function(s) {
          const item = document.createElement('div');
          item.className = 'history-menu-item' + (s.isActive ? ' active' : '');
          item.setAttribute('data-session-id', s.id);
          const wrap = document.createElement('button');
          wrap.type = 'button';
          wrap.className = 'history-menu-item-wrap' + (s.isActive ? ' active' : '');
          const content = document.createElement('div');
          content.className = 'history-menu-item-content';
          const titleEl = document.createElement('span');
          titleEl.className = 'history-item-title';
          titleEl.textContent = s.title || '未命名';
          const dateEl = document.createElement('span');
          dateEl.className = 'history-item-date';
          dateEl.textContent = s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '';
          content.appendChild(titleEl);
          content.appendChild(dateEl);
          wrap.appendChild(content);
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'history-menu-item-delete';
          delBtn.title = '删除此会话';
          delBtn.textContent = '×';
          delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            vscode.postMessage({ type: 'deleteSession', sessionId: s.id });
            if (historyMenu) historyMenu.classList.remove('visible');
          });
          wrap.appendChild(delBtn);
          wrap.addEventListener('click', function(e) {
            if (e.target && (e.target === delBtn || delBtn.contains(e.target))) return;
            vscode.postMessage({ type: 'loadSession', sessionId: s.id });
            if (historyMenu) historyMenu.classList.remove('visible');
          });
          item.appendChild(wrap);
          historyMenu.appendChild(item);
        });
      }
      
      if (historyBtn && historyMenu) {
        historyBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          vscode.postMessage({ type: 'getSessionList' });
          historyMenu.classList.toggle('visible');
          if (historyMenu.classList.contains('visible')) renderHistoryMenu();
        });
      }
      document.addEventListener('click', function() {
        if (historyMenu) historyMenu.classList.remove('visible');
      });
      if (historyMenu) {
        historyMenu.addEventListener('click', function(e) { e.stopPropagation(); });
      }
      
      if (exportBtn) {
        exportBtn.addEventListener('click', function() {
          vscode.postMessage({ type: 'exportChat' });
        });
      }
      
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'openSettings' });
        });
      }
      
      if (openSettingsLink) {
        openSettingsLink.addEventListener('click', () => {
          vscode.postMessage({ type: 'openSettings' });
        });
      }

      if (providerSelect) {
        providerSelect.addEventListener('change', () => {
          const value = providerSelect.value;
          if (value) {
            vscode.postMessage({ type: 'setActiveProvider', provider: value });
          }
        });
      }

      if (modelSelect) {
        modelSelect.addEventListener('change', () => {
          const value = modelSelect.value;
          if (value) {
            vscode.postMessage({ type: 'setActiveModel', model: value });
          }
        });
      }


      function setSelectOptions(selectEl, options, selectedValue) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        options.forEach((option) => {
          const opt = document.createElement('option');
          opt.value = option.model || option.value;
          opt.textContent = option.displayName || option.label || option.model || option.value;
          if (option.description) {
            opt.title = option.description;
          }
          if ((option.model || option.value) === selectedValue) {
            opt.selected = true;
          }
          selectEl.appendChild(opt);
        });
      }

      
      // 创建消息元素
      // 从消息 content（string 或 ContentPart[]）得到用于展示的纯文本
      function getDisplayContent(content) {
        if (content == null) return '';
        if (typeof content === 'string') return content;
        if (!Array.isArray(content)) return '';
        return content.map(function(p) {
          if (p.type === 'text' && p.text) return p.text;
          if (p.type === 'image_url') return '[图片]';
          if (p.type === 'video_url') return '[视频]';
          return '';
        }).filter(Boolean).join('\\n');
      }
      
      function createMessageElement(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + role;
        
        const header = document.createElement('div');
        header.className = 'message-header';
        
        const roleSpan = document.createElement('span');
        roleSpan.className = 'message-role';
        roleSpan.textContent = role === 'user' ? '你' : '助手';
        header.appendChild(roleSpan);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = formatContent(content);
        
        messageDiv.appendChild(header);
        messageDiv.appendChild(contentDiv);
        
        return messageDiv;
      }
      
      // 格式化内容（简单的 Markdown 支持）
      function formatContent(text, isStreaming = false) {
        if (!text) return '';
        
        // 转义 HTML
        let html = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        
        // 处理代码块
        const codeBlockRegex = /\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g;
        html = html.replace(codeBlockRegex, '<pre><code class="language-$1">$2</code></pre>');
        
        // 流式模式：处理未闭合的代码块
        if (isStreaming) {
          const openCodeBlock = html.match(/\`\`\`(\\w*)\\n([\\s\\S]*)$/);
          if (openCodeBlock) {
            const lang = openCodeBlock[1] || '';
            const code = openCodeBlock[2];
            html = html.replace(/\`\`\`(\\w*)\\n([\\s\\S]*)$/, '<pre><code class="language-' + lang + '">' + code + '<span class="cursor-blink">▌</span></code></pre>');
          }
        }
        
        // 行内代码（只处理完整的）
        html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
        
        // 加粗（只处理完整的）
        html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
        
        // 斜体（只处理完整的）
        html = html.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
        
        // 换行
        html = html.replace(/\\n/g, '<br>');
        
        return html;
      }
      
      // 创建工具调用元素
      function createToolCallElement(toolCall) {
        const toolDiv = document.createElement('div');
        toolDiv.className = 'tool-call';
        toolDiv.id = 'tool-' + toolCall.id;
        
        const header = document.createElement('div');
        header.className = 'tool-call-header';
        header.innerHTML = \`
          <span class="tool-icon">🔧</span>
          <span class="tool-name">\${toolCall.function.name}</span>
          <span class="tool-status running">执行中...</span>
        \`;
        
        header.addEventListener('click', () => {
          toolDiv.classList.toggle('expanded');
        });
        
        const body = document.createElement('div');
        body.className = 'tool-call-body';
        
        try {
          const args = JSON.parse(toolCall.function.arguments);
          body.innerHTML = \`
            <div class="tool-call-args">
              <strong>参数:</strong>
              <pre>\${JSON.stringify(args, null, 2)}</pre>
            </div>
            <div class="tool-call-result" id="result-\${toolCall.id}"></div>
          \`;
        } catch (e) {
          body.innerHTML = '<div class="tool-call-args">解析参数失败</div>';
        }
        
        toolDiv.appendChild(header);
        toolDiv.appendChild(body);
        
        return toolDiv;
      }
      
      // 滚动到底部
      function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      
      // 处理来自扩展的消息
      window.addEventListener('message', (event) => {
        const data = event.data;
        
        switch (data.type) {
          case 'config':
            const hasProviders = Array.isArray(data.config.providers) && data.config.providers.length > 0;
            if (!hasProviders || !data.config.hasApiKey) {
              if (configNotice) configNotice.style.display = 'block';
            } else {
              if (configNotice) configNotice.style.display = 'none';
            }

            if (hasProviders) {
              const providers = data.config.providers;
              const activeProvider = data.config.activeProvider || providers[0].displayName;
              const activeProviderObj = providers.find((p) => p.displayName === activeProvider) || providers[0];
              const models = Array.isArray(activeProviderObj.models) ? activeProviderObj.models : [];
              const activeModel = data.config.activeModel || (models[0] && models[0].model);

              setSelectOptions(
                providerSelect,
                providers.map((p) => ({ value: p.displayName, label: p.displayName, description: p.baseUrl })),
                activeProvider,
              );
              setSelectOptions(modelSelect, models, activeModel);

              if (providerSelect) providerSelect.disabled = false;
              if (modelSelect) modelSelect.disabled = models.length === 0;
            } else {
              if (providerSelect) {
                providerSelect.innerHTML = '';
                providerSelect.disabled = true;
              }
              if (modelSelect) {
                modelSelect.innerHTML = '';
                modelSelect.disabled = true;
              }
            }
            break;
          case 'skills': {
            // 更新可用的 Skill 列表
            if (Array.isArray(data.skills)) {
              allSkills = data.skills;
              skillsLoaded = true;
            }
            break;
          }
          
          case 'sessionList': {
            if (Array.isArray(data.sessions)) {
              sessionList = data.sessions;
              if (historyMenu && historyMenu.classList.contains('visible')) {
                renderHistoryMenu();
              }
            }
            break;
          }
          
          case 'loadHistory': {
            if (!chatContainer || !Array.isArray(data.messages)) break;
            chatContainer.innerHTML = '';
            chatContainer.appendChild(welcomeMessage);
            welcomeMessage.style.display = 'none';
            currentAssistantMessage = null;
            currentToolCalls.clear();
            data.messages.forEach(function(msg) {
              if (msg.role === 'system' || msg.role === 'tool') return;
              const displayText = getDisplayContent(msg.content);
              const el = createMessageElement(msg.role, displayText);
              chatContainer.appendChild(el);
            });
            scrollToBottom();
            break;
          }
            
          case 'userMessage':
            welcomeMessage.style.display = 'none';
            const userMsg = createMessageElement('user', data.message);
            // 如果有附件，显示附件预览
            if (data.attachments && data.attachments.length > 0) {
              const contentDiv = userMsg.querySelector('.message-content');
              if (contentDiv) {
                const attachmentsDiv = document.createElement('div');
                attachmentsDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;';
                data.attachments.forEach(att => {
                  if (att.isImage) {
                    const img = document.createElement('img');
                    img.src = att.base64;
                    img.style.cssText = 'max-width: 200px; max-height: 200px; border-radius: 4px; border: 1px solid var(--vscode-input-border);';
                    attachmentsDiv.appendChild(img);
                  } else if (att.isVideo) {
                    const video = document.createElement('video');
                    video.src = att.base64;
                    video.controls = true;
                    video.style.cssText = 'max-width: 200px; max-height: 200px; border-radius: 4px; border: 1px solid var(--vscode-input-border);';
                    attachmentsDiv.appendChild(video);
                  }
                });
                contentDiv.insertBefore(attachmentsDiv, contentDiv.firstChild);
              }
            }
            chatContainer.appendChild(userMsg);
            scrollToBottom();
            break;
            
          case 'startProcessing': {
            isProcessing = true;
            if (sendBtn) {
              sendBtn.disabled = false;
              sendBtn.textContent = '停止';
            }
            
            // 创建助手消息容器
            currentAssistantMessage = createMessageElement('assistant', '');
            if (chatContainer) chatContainer.appendChild(currentAssistantMessage);
            
            // 添加加载指示器
            const typingIndicator = document.createElement('div');
            typingIndicator.className = 'typing-indicator';
            typingIndicator.id = 'typingIndicator';
            typingIndicator.innerHTML = '<span></span><span></span><span></span>';
            const contentDiv = currentAssistantMessage.querySelector('.message-content');

            const statusText = document.createElement('div');
            statusText.className = 'status-text';
            statusText.id = 'statusText';
            statusText.textContent = '正在思考...';
            if (contentDiv) {
              contentDiv.appendChild(statusText);
              contentDiv.appendChild(typingIndicator);
            }
            scrollToBottom();
            break;
          }
            
          case 'assistantContent': {
            // 如果没有 currentAssistantMessage，创建一个
            if (!currentAssistantMessage) {
              welcomeMessage.style.display = 'none';
              currentAssistantMessage = createMessageElement('assistant', '');
              currentAssistantMessage.setAttribute('data-current-type', '');
              if (chatContainer) chatContainer.appendChild(currentAssistantMessage);
            }
            
            const contentDiv = currentAssistantMessage.querySelector('.message-content');
            
            if (data.content && contentDiv) {
              // 移除 loading 指示器
              const typingIndicator = document.getElementById('typingIndicator');
              const statusText = document.getElementById('statusText');
              if (typingIndicator) typingIndicator.remove();
              if (statusText) statusText.remove();
              
              // 检查是否需要创建新区域（类型切换）
              const lastType = currentAssistantMessage.getAttribute('data-current-type');
              let currentBlock = contentDiv.lastElementChild;
              
              if (lastType !== 'content' || !currentBlock?.classList.contains('stream-block')) {
                currentBlock = document.createElement('div');
                currentBlock.className = 'stream-block text-block';
                contentDiv.appendChild(currentBlock);
                currentAssistantMessage.setAttribute('data-current-type', 'content');
              }
              
              // 累积原始文本
              const currentText = currentBlock.getAttribute('data-raw') || '';
              const newText = currentText + data.content;
              currentBlock.setAttribute('data-raw', newText);
              currentBlock.innerHTML = formatContent(newText, true);
              scrollToBottom();
            }
            
            if (!data.isStreaming && contentDiv) {
              // 流结束，最终格式化所有文本块
              contentDiv.querySelectorAll('.text-block').forEach(block => {
                const rawText = block.getAttribute('data-raw') || '';
                if (rawText) {
                  block.innerHTML = formatContent(rawText, false);
                }
              });
              currentAssistantMessage = null;
            }
            break;
          }
          
          case 'reasoningContent': {
            // 显示思考过程
            if (!currentAssistantMessage) {
              welcomeMessage.style.display = 'none';
              currentAssistantMessage = createMessageElement('assistant', '');
              currentAssistantMessage.setAttribute('data-current-type', '');
              if (chatContainer) chatContainer.appendChild(currentAssistantMessage);
            }
            
            const contentDiv = currentAssistantMessage.querySelector('.message-content');
            if (data.content && contentDiv) {
              // 移除 loading 指示器
              const typingIndicator = document.getElementById('typingIndicator');
              const statusText = document.getElementById('statusText');
              if (typingIndicator) typingIndicator.remove();
              if (statusText) statusText.remove();
              
              // 检查是否需要创建新区域（类型切换）
              const lastType = currentAssistantMessage.getAttribute('data-current-type');
              let currentBlock = contentDiv.lastElementChild;
              
              if (lastType !== 'reasoning' || !currentBlock?.classList.contains('thinking-content')) {
                currentBlock = document.createElement('div');
                currentBlock.className = 'stream-block thinking-content';
                currentBlock.innerHTML = '<div class="thinking-header">💭 思考中...</div><div class="thinking-text"></div>';
                contentDiv.appendChild(currentBlock);
                currentAssistantMessage.setAttribute('data-current-type', 'reasoning');
              }
              
              const thinkingText = currentBlock.querySelector('.thinking-text');
              if (thinkingText) {
                const currentText = thinkingText.getAttribute('data-raw') || '';
                const newText = currentText + data.content;
                thinkingText.setAttribute('data-raw', newText);
                thinkingText.textContent = newText;
              }
              scrollToBottom();
            }
            break;
          }
          
          case 'toolCallProgress': {
            // 实时显示 tool_call 进度
            if (!currentAssistantMessage) {
              welcomeMessage.style.display = 'none';
              currentAssistantMessage = createMessageElement('assistant', '');
              currentAssistantMessage.setAttribute('data-current-type', '');
              if (chatContainer) chatContainer.appendChild(currentAssistantMessage);
            }
            
            const contentDiv = currentAssistantMessage.querySelector('.message-content');
            if (contentDiv && data.toolCallProgress) {
              // 移除 loading 指示器
              const typingIndicator = document.getElementById('typingIndicator');
              const statusText = document.getElementById('statusText');
              if (typingIndicator) typingIndicator.remove();
              if (statusText) statusText.remove();
              
              const tc = data.toolCallProgress;
              const toolKey = 'tool-' + tc.index;
              
              // 检查是否需要创建新区域（类型切换或不同工具）
              const lastType = currentAssistantMessage.getAttribute('data-current-type');
              let currentBlock = contentDiv.lastElementChild;
              
              if (lastType !== toolKey || !currentBlock?.classList.contains('tool-call-progress')) {
                currentBlock = document.createElement('div');
                currentBlock.className = 'stream-block tool-call-progress';
                currentBlock.setAttribute('data-index', tc.index);
                contentDiv.appendChild(currentBlock);
                currentAssistantMessage.setAttribute('data-current-type', toolKey);
              }
              
              currentBlock.innerHTML = '<div class="tool-progress-header">🔧 ' + (tc.name || '调用工具中...') + '</div>' +
                '<pre class="tool-progress-args">' + tc.arguments.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
              
              // 滚动 pre 到底部
              const pre = currentBlock.querySelector('pre');
              if (pre) pre.scrollTop = pre.scrollHeight;
              scrollToBottom();
            }
            break;
          }
            
          case 'toolCall': {
            if (currentAssistantMessage) {
              const contentDiv = currentAssistantMessage.querySelector('.message-content');
              // 保留所有进度显示，标记为已完成
              contentDiv?.querySelectorAll('.tool-call-progress:not(.completed)').forEach(div => {
                div.classList.add('completed');
                const header = div.querySelector('.tool-progress-header');
                if (header) {
                  header.textContent = '✅ ' + header.textContent.replace('🔧 ', '');
                }
              });
              
              const toolElement = createToolCallElement(data.toolCall);
              if (contentDiv) contentDiv.appendChild(toolElement);
              currentToolCalls.set(data.toolCall.id, toolElement);
              scrollToBottom();
            }
            break;
          }
            
          case 'toolExecuting':
            // 工具正在执行，状态已在 toolCall 中设置
            break;
            
          case 'toolResult':
          case 'toolError': {
            const toolElement = currentToolCalls.get(data.toolCallId);
            if (toolElement) {
              const statusSpan = toolElement.querySelector('.tool-status');
              const resultDiv = toolElement.querySelector('.tool-call-result');
              const statusText = document.getElementById('statusText');
              if (statusText) {
                statusText.textContent = '工具执行完成，正在生成回复...';
              }
              
              if (data.type === 'toolResult') {
                if (statusSpan) {
                  statusSpan.className = 'tool-status success';
                  statusSpan.textContent = '完成';
                }
                if (resultDiv) {
                  const resultText = typeof data.result === 'string' 
                    ? data.result 
                    : JSON.stringify(data.result, null, 2);
                  resultDiv.innerHTML = '<strong>结果:</strong><pre>' + 
                    resultText.substring(0, 1000) + 
                    (resultText.length > 1000 ? '...(已截断)' : '') + 
                    '</pre>';
                }
              } else {
                if (statusSpan) {
                  statusSpan.className = 'tool-status error';
                  statusSpan.textContent = '错误';
                }
                if (resultDiv) {
                  resultDiv.innerHTML = '<strong>错误:</strong><pre>' + data.error + '</pre>';
                }
              }
              scrollToBottom();
            }
            break;
          }
            
          case 'stopProcessing': {
            isProcessing = false;
            if (sendBtn) {
              sendBtn.disabled = false;
              sendBtn.textContent = '发送';
            }
            const statusText = document.getElementById('statusText');
            if (statusText) {
              statusText.remove();
            }
            currentAssistantMessage = null;
            currentToolCalls.clear();
            break;
          }
            
          case 'error':
            // 如果没有当前助手消息，创建一个新的错误消息块
            if (!currentAssistantMessage) {
              welcomeMessage.style.display = 'none';
              currentAssistantMessage = createMessageElement('assistant', '');
              if (chatContainer) chatContainer.appendChild(currentAssistantMessage);
            }
            if (currentAssistantMessage) {
              const contentDiv = currentAssistantMessage.querySelector('.message-content');
              if (contentDiv) {
                contentDiv.innerHTML = '';
                const errorSpan = document.createElement('span');
                errorSpan.className = 'error-message';
                errorSpan.textContent = '错误: ' + (data.message || '请求失败');
                const retryBtn = document.createElement('button');
                retryBtn.className = 'error-retry-btn';
                retryBtn.textContent = '重试';
                retryBtn.addEventListener('click', () => {
                  vscode.postMessage({ type: 'retryLast' });
                });
                contentDiv.appendChild(errorSpan);
                contentDiv.appendChild(retryBtn);
              }
            }
            break;
            
          case 'clearChat':
            chatContainer.innerHTML = '';
            chatContainer.appendChild(welcomeMessage);
            welcomeMessage.style.display = 'block';
            currentAssistantMessage = null;
            currentToolCalls.clear();
            break;
        }
      });
    })();
  </script>
</body>
</html>`;
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
