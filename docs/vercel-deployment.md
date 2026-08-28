# Vercel 部署

线上网页负责摄像头、屏幕共享、任务理解、视觉相关性判断和会话总结。Agent Stack 与 OpenAI Key 只存放在 Vercel 服务端环境变量中，不进入浏览器代码。

必须配置：

- `AGENT_STACK_BASE_URL`
- `AGENT_STACK_USER_API_KEY`
- `AGENT_STACK_PROJECT_ID`
- `AGENT_STACK_AGENT_ID`
- `OPENAI_API_KEY`
- `REFOCUS_VISUAL_PROVIDER=openai`

线上演示不设置访问码，打开网址即可使用。Agent Stack 和 OpenAI Key 仍只存在于 Vercel 服务端环境变量中。

Vercel Function 可能在任意请求后重启，因此浏览器会携带不含密钥的 Session ID、任务合同和开始时间，让下一次调用能够恢复同一个 Agent Stack Session。

线上网页可以直接申请摄像头、麦克风和屏幕共享权限。C 板 USB 串口不能由 Vercel 云端直接读取；硬件联调继续使用本地 Desktop Bridge，或在支持 Web Serial 的浏览器中增加本地串口连接。
