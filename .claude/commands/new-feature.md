开发新功能：$ARGUMENTS

请严格按以下流程执行：

1. 先读 SCRATCHPAD.md 了解当前项目进展
2. 运行 `openclaw --help` 和相关子命令的 `--help`，确认 CLI 是否已原生支持此功能
3. 进入 Plan Mode，设计实现方案：
   - 方案必须是"套壳 CLI"而非"自建替代"
   - 明确要改哪些文件、为什么这样改
4. 方案确认后再开始实现
5. 实现完成后运行 `cd app && pnpm verify:delivery`
6. 验证通过后自动启动服务，让用户在浏览器验收
7. 验收通过后更新 SCRATCHPAD.md 记录进展
