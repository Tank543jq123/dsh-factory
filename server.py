#!/usr/bin/env python3
"""DSH 工厂视图：把 Agent 的内部结构（车间）与调度（流水线）用一张动画工厂图展示。

只读：读取 skills 目录、profile bundles、schedule.json、书阁 library.json、
SuperAgent 的 orchestrator.sqlite（ticket/trigger/decision 计数）。不写任何东西。
"""
import json, os, sqlite3, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOME = os.path.expanduser("~")
DSH = os.path.join(HOME, ".dsh")
ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("FACTORY_PORT", "3091"))

def read_json(p, default=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def skills():
    d = os.path.join(DSH, "skills")
    items = []
    try:
        for name in sorted(os.listdir(d)):
            p = os.path.join(d, name)
            if not os.path.isdir(p):
                continue
            desc = ""
            for cand in ("SKILL.md", "README.md"):
                f = os.path.join(p, cand)
                if os.path.isfile(f):
                    try:
                        with open(f, encoding="utf-8") as fh:
                            lines = [l.strip() for l in fh.read().splitlines() if l.strip()]
                        desc = next((l for l in lines if not l.startswith("#")), "")[:120]
                    except Exception:
                        pass
                    break
            items.append({"name": name, "desc": desc})
    except Exception:
        pass
    return items

def bundles():
    out = []
    for prof in ("web", "superagent", "headless"):
        p = os.path.join(DSH, "profiles", prof, "package.json")
        d = read_json(p)
        if not d:
            continue
        b = (d.get("dsh") or {}).get("profile", {}).get("bundles", [])
        out.append({"profile": prof, "bundles": b})
    return out

def schedules():
    d = read_json(os.path.join(DSH, "storages", "schedule.json"), {})
    tasks = ((d.get("tables") or {}).get("tasks") or {})
    out = []
    for _k, v in tasks.items():
        rec = (v or {}).get("record") or {}
        out.append({"title": rec.get("title") or rec.get("id") or "?", "time": rec.get("time") or "", "kind": rec.get("kind") or "", "status": v.get("status") or ""})
    return out

def library():
    cfg = read_json(os.path.join(DSH, "dsh-manuscript-config.json"), {}) or {}
    root = cfg.get("root") or os.path.join(DSH, "library")
    lib = read_json(os.path.join(root, "library.json"), {}) or {}
    counts = lib.get("counts") or {}
    return {"root": root, "entries": counts.get("entries"), "retired": counts.get("retired"), "volumes": len(lib.get("volumes") or [])}

def tickets():
    p = os.path.join(DSH, "state", "superagent", "orchestrator.sqlite")
    out = {"tickets": 0, "triggers24h": 0, "decisions24h": 0, "threads": 0, "titles": []}
    if not os.path.exists(p):
        return out
    try:
        c = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=3)
        out["tickets"] = c.execute("select count(*) from ticket").fetchone()[0]
        out["threads"] = c.execute("select count(*) from thread").fetchone()[0]
        cut = int(time.time() * 1000) - 24 * 3600 * 1000
        try:
            out["triggers24h"] = c.execute("select count(*) from trigger where at >= ?", (cut,)).fetchone()[0]
        except Exception:
            out["triggers24h"] = c.execute("select count(*) from trigger").fetchone()[0]
        try:
            out["decisions24h"] = c.execute("select count(*) from decision").fetchone()[0]
        except Exception:
            pass
        rows = c.execute("select value from ticket").fetchall()
        for (val,) in rows[:5]:
            try:
                t = json.loads(val)
                out["titles"].append(t.get("title") or t.get("summary") or t.get("id") or "?")
            except Exception:
                pass
        c.close()
    except Exception as e:
        out["error"] = str(e)[:120]
    return out



# ── DSH 本体：会话事件解析（2026-11-18）────────────────────────────
import subprocess, glob

def _zstd_lines(path):
    try:
        out = subprocess.run(["zstd", "-dc", path], capture_output=True, timeout=20)
        if out.returncode != 0:
            return []
        return out.stdout.decode("utf-8", "replace").splitlines()
    except Exception:
        return []

_SESS_CACHE={'t':0,'v':None}

def list_sessions(limit=30):
    if _SESS_CACHE['v'] is not None and time.time()-_SESS_CACHE['t']<60:
        return _SESS_CACHE['v'][:limit]
    items = []
    for path in glob.glob(os.path.join(DSH, "sessions", "*", "*", "session.v4.jsonl.zstd")):
        if "subagent" in path:
            continue
        sid = os.path.basename(os.path.dirname(path))
        title = ""
        try:
            head = _zstd_lines(path)[:40]
            for line in head:
                try:
                    e = json.loads(line)
                except Exception:
                    continue
                if e.get("type") == "session/title":
                    title = ((e.get("data") or {}).get("title") or "")[:60]
                elif not title and e.get("type") == "user/message":
                    c = (e.get("data") or {}).get("message", {}).get("content")
                    if isinstance(c, list) and c:
                        txt = c[0].get("text") if isinstance(c[0], dict) else str(c[0])
                        title = str(txt)[:60]
        except Exception:
            pass
        items.append({"id": sid, "path": path, "title": title or sid[:8], "mtime": os.path.getmtime(path)})
    items.sort(key=lambda x: -x["mtime"])
    _SESS_CACHE['t']=time.time(); _SESS_CACHE['v']=items
    return items[:limit]

def session_steps(sid, limit=200):
    paths = glob.glob(os.path.join(DSH, "sessions", "*", sid, "session.v4.jsonl.zstd"))
    if not paths:
        return {"error": "session not found"}
    steps = []
    calls = {}
    for line in _zstd_lines(paths[0]):
        try:
            e = json.loads(line)
        except Exception:
            continue
        t = e.get("type"); d = e.get("data") or {}; at = e.get("time")
        if t == "turn/start":
            steps.append({"station": "intake", "kind": "turn-start", "at": at, "text": f"第 {d.get('turn')} 轮开始"})
        elif t == "user/message":
            c = (d.get("message") or {}).get("content")
            txt = ""
            if isinstance(c, list) and c:
                txt = c[0].get("text") if isinstance(c[0], dict) else str(c[0])
            steps.append({"station": "intake", "kind": "user", "at": at, "text": str(txt)[:300]})
        elif t == "system/message":
            c = (d.get("message") or {}).get("content")
            txt = ""
            if isinstance(c, list) and c:
                txt = c[0].get("text") if isinstance(c[0], dict) else str(c[0])
            steps.append({"station": "inject", "kind": "system", "at": at, "text": ("系统/规则注入：" + str(txt)[:180])})
        elif t == "step/start":
            steps.append({"station": "model", "kind": "step-start", "at": at, "text": f"第 {d.get('turn')} 轮 · 第 {d.get('step')} 步：模型开始处理"})
        elif t == "request/context":
            steps.append({"station": "model", "kind": "context", "at": at, "text": f"模型 {d.get('provider')}/{d.get('model')} · 上下文窗口 {d.get('contextWindow')}"})
        elif t == "assistant/message":
            for part in ((d.get("message") or {}).get("content") or []):
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "text" and part.get("text"):
                    steps.append({"station": "think", "kind": "text", "at": at, "text": str(part["text"])[:280]})
                elif part.get("type") == "tool-call":
                    calls[part.get("id")] = part.get("name")
                    steps.append({"station": "route", "kind": "tool-select", "at": at,
                                  "tool": part.get("name"), "text": f"选择工具：{part.get('name')}"})
        elif t == "tool/call":
            steps.append({"station": "tool", "kind": "tool-call", "at": at, "tool": d.get("name"),
                          "text": f"调用 {d.get('name')}：{str(d.get('arguments'))[:200]}"})
        elif t == "tool/result":
            c = (d.get("message") or {}).get("content") or []
            txt = ""
            if c and isinstance(c[0], dict):
                txt = c[0].get("text") or ""
            steps.append({"station": "gather", "kind": "tool-result", "at": at,
                          "text": ("工具返回（" + str(len(txt)) + " 字）：" + str(txt)[:220])})
        elif t == "step/end":
            steps.append({"station": "loop", "kind": "step-end", "at": at, "text": "这一步结束，进入下一轮判断"})
        if len(steps) >= limit:
            break
    # 计算每步耗时
    times = [s["at"] for s in steps if s.get("at")]
    return {"id": sid, "count": len(steps), "steps": steps, "from": min(times) if times else None, "to": max(times) if times else None}

def snapshot():
    return {
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "workshops": {
            "intake": {"skillsNote": "入口：会话 / 工单 / 定时触发"},
            "routing": {"schedules": schedules(), "tickets": tickets()},
            "skills": {"items": skills()},
            "mcp": {"items": [], "note": "当前没有配置 MCP 服务器"},
            "tools": {"profiles": bundles()},
            "memory": library(),
            "model": {"providers": sorted([n.replace(".yaml", "") for n in os.listdir(DSH) if n.startswith("llm-")])},
        },
    }

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/factory"):
            body = json.dumps(snapshot(), ensure_ascii=False).encode()
            self.send_response(200); self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("cache-control", "no-store"); self.send_header("content-length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        if self.path.startswith("/api/latest"):
            # 最近活跃的会话 + 它的步骤，供页面做「跟随最新一轮」的近似实时模式。
            items = list_sessions(1)
            out = session_steps(items[0]["id"]) if items else {"error": "no session"}
            body = json.dumps(out, ensure_ascii=False).encode()
            self.send_response(200); self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("cache-control", "no-store"); self.send_header("content-length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        if self.path.startswith("/api/sessions"):
            body = json.dumps({"sessions": list_sessions()}, ensure_ascii=False).encode()
            self.send_response(200); self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("cache-control", "no-store"); self.send_header("content-length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        if self.path.startswith("/api/session"):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            sid = (q.get("id") or [""])[0]
            body = json.dumps(session_steps(sid), ensure_ascii=False).encode()
            self.send_response(200); self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("cache-control", "no-store"); self.send_header("content-length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        path_only = self.path.split("?")[0]
        if path_only.endswith(".html") and "/" not in path_only.strip("/"):
            p = os.path.join(ROOT, path_only.strip("/"))
            try:
                body = open(p, "rb").read()
            except Exception:
                body = b"not found"
            self.send_response(200); self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if self.path.split("?")[0] in ("/dsh", "/dsh.html"):
            p = os.path.join(ROOT, "dsh.html")
            try:
                body = open(p, "rb").read()
            except Exception:
                body = b"missing dsh.html"
            self.send_response(200); self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if self.path in ("/", "/index.html"):
            p = os.path.join(ROOT, "index.html")
            try:
                body = open(p, "rb").read()
            except Exception:
                body = b"missing index.html"
            self.send_response(200); self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        self.send_response(404); self.end_headers()

    def log_message(self, *a):
        pass

if __name__ == "__main__":
    print(f"factory on http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
