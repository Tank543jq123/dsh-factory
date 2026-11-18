# DSH 工厂（dsh-factory）

把 DSH Agent 的内部结构画成一张会动的工厂图：输入口 → 路由/调度车间 → 技能 / MCP / 工具 / 记忆车间 → 模型车间 → 输出口。

- `server.py`：只读数据服务（skills、profile bundles、schedule.json、书阁 library.json、SuperAgent orchestrator.sqlite），端口 3091。
- `index.html`：SVG 动画工厂图，5 秒刷新一次；每个车间可点开看当前实例与「可改」入口。
- `systemd/dsh-factory.service`：常驻服务。

启动：`systemctl --user start dsh-factory.service`，访问 http://127.0.0.1:3091/
