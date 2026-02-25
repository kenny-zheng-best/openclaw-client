启动开发环境让用户在浏览器验收：

1. 先跑 `cd app && pnpm test && pnpm build`，确保代码无误
2. 检测 8787 端口是否被旧进程占用，如果是则 kill 掉
3. 用 `OPENCLAW_CHAT_MODE=mock` 在后台启动 API server：`cd app && OPENCLAW_CHAT_MODE=mock node server/local-api.mjs &`
4. 在后台启动 Vite dev server：`cd app && pnpm dev:ui &`
5. 等待服务就绪后，告诉用户在浏览器打开地址、点哪里看新功能
