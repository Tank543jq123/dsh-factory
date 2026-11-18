# 视觉重做：等距伪 3D 工厂

> 状态：静帧方向已通过；动画已按同一套规范落地并完成真实事件回放验证。
> 旧 2D 版本已停用（`dsh-factory.service` 3092、`dsh-pixel-factory.service` 3091、`dsh-pixel-report-once.timer` 08:30 推送均已 stop/disable）；只保留 3082 上的插件版本。

## 1. 参考与提炼

外部参考（只用来定方向，未拷贝素材；插件里的建筑/工人/箱子全部是手写 SVG/CSS）：

- [2D Isometric Pixel Factory — Mythryl Studio (Unity Asset Store)](https://assetstore.unity.com/packages/2d/environments/2d-isometric-pixel-factory-free-mythryl-studio-416592)
  - 主要参考它的 **绿色/橄榄色地面 + 灰色工业建筑 + 橙色/黄铜管线 + 小比例工人**。
- [Isometric Pixel Art: Grid, Tiles, Lighting, Animation, and Export — ThatPainter](https://thatpainter.com/the-complete-guide-to-isometric-pixel-art/)
  - 2:1 等距网格、32px 基础 tile、顶面/侧面/正面三面明暗、固定相机。
- [Shapez 2 Demo Impressions — GamerMatters](https://gamermatters.com/shapez-2-demo-impressions/)
  - 极简等距工厂、低饱和色、可读性优先、大量小型模块化机器。
- [Factorio 官方](https://factorio.com/) / [Mini Motorways](https://dinopoloclub.com/mini-motorways/) / [Stardew Valley](https://www.stardewvalley.net/)
  - Factorio：工业密度、烟雾、传送带节奏、机器轮廓差异。
  - Mini Motorways：低对比底色、路径即叙事、极简 HUD。
  - Stardew Valley：暖色木作、草地/花/树/栅栏带来的「有人生活」的温度。
- [itch.io: factory asset v.2 teaser](https://itch.io/games-like/3054843/factory-asset-v2-teaser)
  - 小体量工厂素材的构图：建筑不追求写实，靠剪影和颜色区分。

共同点（落地成规范）：

1. **固定等距相机**，2:1 斜线，不旋转、不缩放；所有物体共享同一组深度方向。
2. **32px 网格**：站点占地取 32 的倍数（96 / 128 / 160），箱子、工人、道具落在网格附近。
3. **三面明暗**：顶面最亮、左面中间、右面最暗；光源固定左上；接触地面有软阴影。
4. **不用纯黑硬描边**：描边用同色系深色（木作用 `#3C2C20`，钢作用 `#5A554B`）。
5. **低饱和 16 色**：暖灰/木色/黄铜/蒸汽白为主，钢灰和暗青作冷平衡；避免高饱和纯色。
6. **环境密度**：地面纹理、草丛、花、树、木箱、桶、路灯、管线、水箱、栅栏、烟团——这些小东西负责「像游戏」。
7. **雾/光晕**：远处轻雾、边缘暗角、中心暖光；整体低对比、不刺眼。
8. **动画只用 transform/opacity**：工人走动、传送带滚轴、活塞/齿轮/吊钩、烟雾/火花、拆箱/封箱；不做逐帧 rAF。

## 2. 选定色板（16 色）

| # | 名称 | Hex | 用途 |
|---|------|-----|------|
| 1 | Ink | `#26231F` | 最深文字/面板 |
| 2 | Deep | `#34312B` | 远景剪影、深部 |
| 3 | Steel | `#47433B` | 钢建筑暗面 |
| 4 | Steel 2 | `#5A554B` | 钢建筑中间面 |
| 5 | Warm Gray | `#6F695D` | 钢建筑亮面/桶 |
| 6 | Wood Dark | `#6B4F36` | 木作暗面 |
| 7 | Wood | `#8A6644` | 木作中间面 |
| 8 | Wood Light | `#A98356` | 木作顶面/箱子 |
| 9 | Brass Dark | `#9A6F3F` | 黄铜暗部/铆钉 |
| 10 | Brass | `#C19A5B` | 主强调色：管线、灯、贴标 |
| 11 | Cream | `#E0CFA7` | 高光/窗光/文字 |
| 12 | Steam | `#ECE6D8` | 蒸汽/雾/最亮高光 |
| 13 | Rust | `#A85F3D` | 失败/回环（低饱和红） |
| 14 | Teal | `#5F827C` | 冷平衡/水主题管线 |
| 15 | Teal Light | `#8FB0A8` | 水主题高光/成功 |
| 16 | Shadow | `#141310` | 接触阴影/暗角 |

水主题在这 16 色内换用更深的青绿地面（`#2A4A48 → #1F3A39 → #172C2D`）和更亮的青绿箱体（`#5F9A94 / #C9E8E2`），不引入新色相。

## 3. 静帧

- 像素主题：`docs/screenshots/static-pixel-clean.png`（2320×1398，2×）
- 水流主题：`docs/screenshots/static-water-clean.png`
- Skill 4 库扫描：`docs/screenshots/static-pixel-skill-scan.png`、`docs/screenshots/static-water-skill-scan.png`
- 工具窗口（真实 bash 调用）：`docs/screenshots/static-pixel-tool-window.png`、`docs/screenshots/static-water-tool-window.png`
- 旧 2D vs 新等距对比：`docs/screenshots/static-compare-old-new.png`
- 16 色调色板：`docs/screenshots/palette-16.png`
- 参考图（仅对照，不随插件分发）：`docs/references/isometric-pixel-factory-unity.jpg`
- 录屏（真实 turn 事件回放，两主题）：`docs/dsh-factory-demo.mp4`

## 4. 旧 vs 新

| | 旧 2D | 新等距 |
|---|---|---|
| 空间 | 平铺方块 + 连线，无深度 | 固定 2:1 等距，三面体，地面/阴影/雾 |
| 颜色 | 高饱和色块 | 16 色低饱和，暖木/黄铜 + 冷钢/青 |
| 物料 | 方块 | 有顶/侧/正面、胶带、拆箱翻盖、贴标、封箱 |
| 人 | 无 | 6 个岗位工人 + 2 个巡逻工人 + 1 个搬箱工人；走动/锤击动画 |
| 机器 | 色块 | 活塞、齿轮、机械臂、吊钩、烟囱、路灯、管线、水箱 |
| 信息 | 站点名 | 站点名 + 状态灯 + 本 turn 次数 + 事件 HUD + 点击详情 |

## 5. 按用户反馈完成的 5 处修正

1. **标签互相压** → 站点标签改成贴在建筑正面的 `WallPlaque`：统一锚点、宽度上限 88、超出 ellipsis 截断；不再漂浮在传送带上。
2. **右侧被裁** → 整个 SVG 场景加 `translate(20 11) scale(0.96)` 安全边距；出口/仓储/箱子不再贴边。
3. **工人太小/呆站** → 工人放大到 1.6–1.7×；增加搬运姿态（双臂前伸）、脚步阴影和走路摆动；巡逻工人只在运行/播放时走动。
4. **传送带过密** → 只保留主线（入口→编排→装配→模型→出口、模型→工具→仓储）+ 少量支线；记忆/子代理/跳过/失败回环改为细虚线服务线；交叉处加桥。
5. **标题牌压入口** → 移除场景内「DSH FACTORY」大牌，标题收进工具栏（`DSH FACTORY · 工厂蓝图`）。

## 6. 已知取舍

- 仍是 **伪 3D**：没有真正的 z 排序/遮挡，复杂交叉的传送带在少数角度会互相压盖。
- 不是纯像素 sprite：为了可缩放和零依赖，用 SVG 手绘 + CSS 动画；放大到 2× 仍清晰，但不是 32px 点阵像素图。
- 水主题的管道目前是「厚描边 + 高光」模拟体积，不是真实圆柱体。
- 静帧里的 HUD/站点牌偏 UI；如果用户希望更像游戏，可以进一步做成木牌/金属牌并缩小。
