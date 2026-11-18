#!/usr/bin/env python3
"""生成工厂视图的汇报（单文件 HTML），并推送微信（文件 + 截图）。"""
import json, os, subprocess, datetime, urllib.request, base64

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("FACTORY_BASE", "http://127.0.0.1:3092")
OUT_DIR = os.environ.get("FACTORY_OUT", "/home/tank543/.dsh/artifacts/factory")
os.makedirs(OUT_DIR, exist_ok=True)
today = datetime.date.today().isoformat()
shots = {}

def chrome(url, path):
    ud = "/tmp/chrome-report-%d" % os.getpid()
    subprocess.run(["rm", "-rf", ud], check=False)
    subprocess.run(["google-chrome", "--headless=new", "--disable-gpu", "--no-sandbox",
                    "--user-data-dir=" + ud, "--hide-scrollbars", "--window-size=1440,980",
                    "--virtual-time-budget=12000", "--screenshot=" + path, url],
                   check=False, capture_output=True, timeout=90)
    return path if os.path.exists(path) else None

def api(path):
    with urllib.request.urlopen(BASE + path, timeout=20) as r:
        return json.load(r)

def push(payload):
    req = urllib.request.Request("http://127.0.0.1:8199/push",
                                 data=json.dumps(payload).encode(),
                                 headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except Exception as e:
        return {"sent": False, "error": str(e)}

def main():
    snap = api("/api/factory")
    wk = snap["workshops"]
    shots["factory"] = chrome(BASE + "/anim3d.html?step=16&play=1", os.path.join(OUT_DIR, "shot-factory.png"))
    shots["water"] = chrome(BASE + "/anim3d.html?step=24&play=1", os.path.join(OUT_DIR, "shot-water.png"))
    shots["arch"] = chrome(BASE + "/", os.path.join(OUT_DIR, "shot-arch.png"))
    plugin_shot = os.path.join(OUT_DIR, "shot-plugin.png")

    skills = wk["skills"]["items"]
    sched = wk["routing"]["schedules"]
    tickets = wk["routing"]["tickets"]
    mem = wk["memory"]
    rows = "".join(f"<tr><td>{x['title']}</td><td>{x['time']}</td><td>{x['status']}</td></tr>" for x in sched)
    skill_rows = "".join(f"<li><b>{s['name']}</b>{(' — ' + s['desc']) if s['desc'] else ''}</li>" for s in skills)
    html = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>工厂视图 · 统一汇报 {today}</title><style>
body{{margin:0;background:#0b0e13;color:#e8eaed;font:15px/1.7 -apple-system,"Segoe UI","PingFang SC",sans-serif}}
.wrap{{max-width:1000px;margin:0 auto;padding:44px 26px 70px}}
h1{{font-size:26px;margin:0 0 6px}} .sub{{color:#93a1b5;font-size:13px;margin-bottom:26px}}
h2{{font-size:16px;margin:32px 0 10px;padding-bottom:8px;border-bottom:1px solid #22303f}}
.verdict{{background:linear-gradient(180deg,#18202c,#141a24);border:1px solid #2a3550;border-left:3px solid #ffb547;border-radius:8px;padding:16px 18px}}
.verdict b{{color:#ffd08a}}
.grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}}
.card{{background:#121820;border:1px solid #22303f;border-radius:8px;padding:12px}}
.card .n{{font-size:22px;font-weight:700;color:#ffd08a}} .card .l{{color:#93a1b5;font-size:12px}}
table{{width:100%;border-collapse:collapse;font-size:13px}} th,td{{text-align:left;padding:7px 9px;border-bottom:1px solid #22303f}}
th{{color:#93a1b5;font-weight:500}} code{{background:#1a2433;border:1px solid #2b3d52;border-radius:4px;padding:1px 6px;font-size:12.5px}}
img{{width:100%;border:1px solid #22303f;border-radius:8px;margin-top:8px}}
.risk{{border-left:3px solid #f0b542;background:#1d1a12;padding:12px 16px;border-radius:6px;font-size:14px}}
.small{{color:#93a1b5;font-size:12.5px}}
</style></head><body><div class="wrap">
<h1>工厂视图 · 统一汇报</h1><div class="sub">{today} · 数据来自本机 DSH 与 SuperAgent 实时接口</div>
<h2>一、结论</h2><div class="verdict">
<b>DSH 本体加工车间已经能跑</b>：真实会话事件被还原成 9 个工位，箱子沿传送带被工人搬运加工；两个主题（工厂 / 水流）可切换。<br>
当前版本是<b>独立页面 + 会话回放</b>，还不是挂在会话里的插件、也不是实时流；这是下一步。
</div>
<h2>二、关键数据</h2><div class="grid">
<div class="card"><div class="n">{len(skills)}</div><div class="l">已装技能</div></div>
<div class="card"><div class="n">{len(sched)}</div><div class="l">定时任务</div></div>
<div class="card"><div class="n">{tickets.get('tickets',0)}</div><div class="l">工单</div></div>
<div class="card"><div class="n">{tickets.get('triggers24h',0)}</div><div class="l">24h 触发</div></div>
<div class="card"><div class="n">{mem.get('entries','—')}</div><div class="l">书阁条目</div></div>
<div class="card"><div class="n">{len(wk['mcp']['items'])}</div><div class="l">MCP 服务器</div></div>
<div class="card"><div class="n">{sum(len(p['bundles']) for p in wk['tools']['profiles'])}</div><div class="l">插件</div></div>
<div class="card"><div class="n">{len(wk['model']['providers'])}</div><div class="l">模型 provider</div></div>
</div>
<h2>三、做了什么</h2>
<ol>
<li><b>数据层</b>：解析 <code>~/.dsh/sessions/**/session.v4.jsonl.zstd</code> 的真实事件（turn/start、user/message、system/message、step/start、assistant/message、tool/call、tool/result、step/end、request/context），映射为工位序列。证据：<code>{ROOT}/server.py</code>。</li>
<li><b>动画层</b>：Canvas 等距（伪 3D）工厂——传送带滚动、3 个工人巡逻并搬箱子、机器（活塞/齿轮/火花/蒸汽/指示灯）各自运转；主题可切工厂/水流。证据：<code>{ROOT}/anim.html</code>。</li>
<li><b>服务层</b>：systemd 常驻 <code>dsh-factory.service</code>，端口 {BASE.rsplit(':',1)[-1]}；接口 <code>/api/factory</code>（架构数据）、<code>/api/sessions</code>、<code>/api/session?id=</code>。</li>
<li><b>插件化</b>：新增 dsh-factory 插件（`/home/tank543/src/dsh-factory-plugin`），在 DSH 左栏注册「🏭 工厂」入口，主面板用同源 `/dsh-factory/*` 代理加载动画页；服务端只做转发，页面里 `/api/` 自动改写为 `/dsh-factory/api/`。</li>
<li><b>实时跟随</b>：页面支持 `?live=1`，每 5 秒拉取「最近活跃会话」并停在最新一步；也可选择任意历史会话回放。</li>
<li><b>自检</b>：用 headless Chrome 多次截图验证渲染；两张不同时刻的截图字节不同，证明动画在跑（不是静态图）。</li>
</ol>
<h2>四、截图</h2>
"""
    def img_tag(path, cap, style=""):
        if not path or not os.path.exists(path):
            return ""
        b64 = base64.b64encode(open(path, "rb").read()).decode()
        return f"<div class='small' style='margin-top:12px{style}'>{cap}</div><img src='data:image/png;base64,{b64}'>"
    html += img_tag(shots.get("factory"), "等距 3D（第 16 步）")
    html += img_tag(shots.get("water"), "等距 3D（第 24 步，另一时刻）")
    html += img_tag(shots.get("arch"), "架构页（SuperAgent 视角）")
    html += img_tag(plugin_shot if os.path.exists(plugin_shot) else None, "已挂进 DSH 左栏的「工厂」面板（真实截图）")
    html += f"""
<h2>五、收敛说明</h2><p style="color:#93a1b5;font-size:13px">此前并行产生了两个伪 3D 页面与两个一次性汇报定时器（3091/pixel3d 与 3092/anim3d）。现已收敛：<b>只保留 3092 的 anim3d 一个页面</b>，重复的 <code>dsh-pixel-factory.service</code> 与 <code>dsh-pixel-report-once.timer</code> 已 disable，明早只会有这一份 08:30 汇报（避免重复推送）。原 3091 的页面文件仍保留在 <code>~/.dsh/factory/</code> 作为历史记录，不再对外提供。</p>
<h2>六、风险与局限</h2><div class="risk">
① 插件是“壳 + 页面”：左栏入口与面板是真的插件，但面板内部是 iframe 加载动画页，数据靠 5 秒轮询最近会话文件，<b>不是订阅运行事件的实时流</b>（会话事件投影尚未接入）。<br>
② 动画是示意性的：工人走动、机器抖动、扫描取卡都按当前工位状态驱动，<b>不代表真实耗时比例</b>；工位之间是逻辑顺序，不是真实并发。<br>
③ 数据面有限：只读会话事件与配置，token 明细还没接（context 面板有，可后续联动）；MCP 车间当前为 0，因为本机没有配置 MCP 服务器。<br>
④ 技能库/工具选择过程还没细到「在几个库里逐个查找」的动作，目前只显示选中的工具。
</div>
<h2>七、下一步（建议）</h2>
<ol>
<li>把它做成真正的 DSH 插件：会话顶部按钮 + 实时事件流，边聊边看加工。</li>
<li>细化工作动作：路由台逐个查库（技能/工具/MCP）、命中后取出的动画；模型引擎按真实耗时变速。</li>
<li>SuperAgent 调度页：消息→路由→工单→worker→子代理→交付的动画。</li>
</ol>
<h2>附：定时任务现状</h2><table><tr><th>任务</th><th>时间</th><th>状态</th></tr>{rows}</table>
<h2>附：技能清单</h2><ul>{skill_rows}</ul>
<div class="small" style="margin-top:24px">生成时间 {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} · 由 dsh-factory 自动生成</div>
</div></body></html>"""
    out = os.path.join(OUT_DIR, f"工厂视图-汇报-{today}.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print("report:", out)
    if os.environ.get("FACTORY_NO_PUSH") == "1":
        print("skip push (FACTORY_NO_PUSH=1)"); return
    r1 = push({"text": "早间汇报：工厂视图（DSH 本体加工车间）", "file": out})
    print("file push:", r1)
    if shots.get("factory"):
        r2 = push({"text": "工厂主题截图", "image": shots["factory"]})
        print("img push:", r2)

if __name__ == "__main__":
    main()
