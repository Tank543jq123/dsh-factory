/**
 * dsh-factory — browser half.
 *
 * Two skins (pixel factory / water pipes) over one real-event read model:
 * `useProjection('factoryTrail')` from the host session projection.
 *
 * The client keeps a small playback queue so each real event gets a short
 * 0.6–1.5s beat before the box moves on. The queue is empty when the session
 * is idle: the box simply parks at the last station. Nothing animates without
 * a durable event behind it.
 */
const React = require('react')
const {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} = React
const h = React.createElement

const NS = 'dsh-factory'
const THEME_KEY = `${NS}:theme`
const SPEED_KEY = `${NS}:speed`

/* ------------------------------------------------------------------ */
/* Static floor plan                                                   */
/* ------------------------------------------------------------------ */

const NODES = {
  intake: { cx: 95, cy: 288, w: 86, h: 72, name: '入口', sub: '用户输入', icon: 'box' },
  orchestrate: { cx: 255, cy: 288, w: 132, h: 100, name: '编排车间', sub: 'turn 循环', icon: 'loop' },
  assembly: { cx: 430, cy: 132, w: 150, h: 100, name: '装配车间', sub: 'system / 上下文', icon: 'layers' },
  skill: { cx: 430, cy: 415, w: 150, h: 96, name: 'Skill 车间', sub: '技能库按需注入', icon: 'book' },
  route: { cx: 610, cy: 128, w: 142, h: 92, name: '路由车间', sub: '多对话 / 子代理', icon: 'split' },
  tools: { cx: 620, cy: 415, w: 160, h: 100, name: 'MCP / 工具车间', sub: '外部接口', icon: 'wrench' },
  model: { cx: 820, cy: 288, w: 140, h: 112, name: '模型车间', sub: '推理', icon: 'gear' },
  storage: { cx: 845, cy: 470, w: 150, h: 84, name: '仓储', sub: '工作区 / 记忆', icon: 'crate' },
  exit: { cx: 955, cy: 288, w: 64, h: 72, name: '出口', sub: '回答', icon: 'door' },
}

const WORKSHOP_IDS = ['orchestrate', 'assembly', 'skill', 'route', 'model', 'tools', 'storage']

const EDGES = [
  { id: 'entry', from: 'intake', to: 'intake', d: 'M24 304 L52 296', label: '物料', lx: 36, ly: 288, main: true },
  { id: 'intake', from: 'intake', to: 'orchestrate', d: 'M138 300 L190 290', label: '传送', lx: 164, ly: 286, main: true },
  { id: 'orchestrate-assembly', from: 'orchestrate', to: 'assembly', d: 'M300 278 L330 226 L355 172', label: '拼装', lx: 320, ly: 206, main: true },
  { id: 'assembly-model', from: 'assembly', to: 'model', d: 'M505 150 L600 116 L718 198 L750 238', label: '请求', lx: 610, ly: 104, main: true },
  { id: 'skill-assembly', from: 'skill', to: 'assembly', d: 'M430 367 L430 262 L430 182', label: '按需注入', lx: 440, ly: 274, main: false },
  { id: 'orchestrate-route', from: 'orchestrate', to: 'route', d: 'M305 238 L305 196 L540 164', label: '派工', lx: 430, ly: 180, main: false, dashed: true },
  { id: 'route-model', from: 'route', to: 'model', d: 'M680 150 L718 198 L750 238', label: '回流', lx: 714, ly: 190, main: false },
  { id: 'model-tools', from: 'model', to: 'tools', d: 'M820 344 L778 372 L700 414', label: '工具', lx: 770, ly: 360, main: true },
  { id: 'tools-storage', from: 'tools', to: 'storage', d: 'M700 462 L770 456', label: '读写', lx: 735, ly: 448, main: false },
  { id: 'tools-assembly', from: 'tools', to: 'assembly', d: 'M620 365 L620 328 L505 204', label: '结果回填', lx: 556, ly: 322, main: false, dashed: true },
  { id: 'storage-assembly', from: 'storage', to: 'assembly', d: 'M770 460 L735 424 L505 204', label: '记忆', lx: 700, ly: 350, main: false, dashed: true },
  { id: 'model-exit', from: 'model', to: 'exit', d: 'M890 300 L923 296', label: '回答', lx: 906, ly: 288, main: true },
  { id: 'route-exit', from: 'route', to: 'exit', d: 'M680 100 L800 64 L955 250', label: '子代理', lx: 800, ly: 52, main: false, dashed: true },
  { id: 'error-loop', from: 'tools', to: 'model', d: 'M700 392 L736 344 L750 312', label: '失败回环', lx: 744, ly: 388, main: false, error: true },
  { id: 'skip-bypass', from: 'orchestrate', to: 'exit', d: 'M255 338 L500 548 L955 330', label: '跳过支路', lx: 600, ly: 540, main: false, dashed: true, skip: true },
]

const STAGE_LABEL = {
  intake: '封箱待发',
  orchestrate: '排队等工',
  assembly: '拆箱 / 拼装',
  skill: '拆书 / 贴标',
  tools: '接口加工',
  route: '岔道分流',
  model: '推理加工',
  storage: '入库存档',
  exit: '再封箱 / 出货',
}

const RESPONSIBILITY = {
  intake: '用户输入与附件从入口进场，装进一个封好的箱子。',
  orchestrate: '把用户输入拆成 turn / step，决定每一步先拼装、再请求模型、再执行工具。',
  assembly: '把 system prompt、上下文、技能正文和工具 schema 拼成一次模型请求。',
  skill: '按需从技能库抽取技能正文；没命中就不占 token，箱子直接走跳过支路。',
  tools: '把模型请求变成对外部工具 / MCP 服务的真实调用，并把结果回填给模型。',
  route: '在多对话与子代理之间分流，决定这一箱物料走单轮、检索还是派工。',
  model: '把拼装好的请求送进模型，转成文本与工具调用意图；失败会触发重试回环。',
  storage: '读写工作区文件与会话记忆，把物料存进仓库或从仓库取出。',
  exit: '这一轮完成，箱子重新封好，带着回答从出口离开。',
}

const CONFIG_POINTS = {
  intake: [
    { name: 'Composer / 附件', where: '@deepseek-ai/dsh-client-ui-conversation' },
    { name: 'inbox 投影', where: 'agent/inbox/spliced · @deepseek-ai/dsh-agent-loop' },
  ],
  orchestrate: [
    { name: 'maxParallelToolCalls', where: '@deepseek-ai/dsh-agent-loop 配置 · profile cordis.patch.yml' },
    { name: 'agent/pre-step', where: 'Cordis waterfall · @deepseek-ai/dsh-agent' },
    { name: 'turn/step 生命周期', where: 'session/event · @deepseek-ai/dsh-session' },
  ],
  assembly: [
    { name: 'systemPrompt.section()', where: '@deepseek-ai/dsh-system-prompt 插件 API' },
    { name: 'AGENTS.md', where: '$DSH_HOME/AGENTS.md + 工作区 AGENTS.md · dsh-agent-instructions' },
    { name: 'maxBytes', where: 'dsh-agent-instructions 配置（profile cordis.patch.yml）' },
    { name: 'compaction', where: '@deepseek-ai/dsh-compaction-basic / dsh-compaction-tool-result-pruner' },
  ],
  skill: [
    { name: '技能目录', where: '~/.dsh/skills · .dsh/skills · ~/.agents/skills · .agents/skills' },
    { name: 'skill 工具', where: '@deepseek-ai/dsh-tool-skill（toolName=skill）' },
    { name: '技能清单', where: 'ctx.skills.list() · @deepseek-ai/dsh-skill' },
  ],
  route: [
    { name: 'maxDepth', where: '@deepseek-ai/dsh-subagent 配置' },
    { name: 'toolName', where: '@deepseek-ai/dsh-tool-subagent（默认 subagent）' },
    { name: 'provider', where: 'subagent provider 行（spawn / fork / ACP / Codex / Claude）' },
  ],
  model: [
    { name: 'provider / model', where: 'llm 配置 · profile cordis.patch.yml' },
    { name: 'apiKeyEnv', where: 'provider 配置只接受环境变量名' },
    { name: 'contextWindow', where: 'request/context 事件 / 模型目录' },
    { name: 'reasoningEffort', where: 'agent/request waterfall' },
  ],
  tools: [
    { name: 'MCP serverName / transport', where: '@deepseek-ai/dsh-mcp-client 行 · profile cordis.patch.yml' },
    { name: '工具命名', where: 'mcp__<server>__<tool>' },
    { name: '工具注册表', where: 'ctx.tools · @deepseek-ai/dsh-tools' },
  ],
  storage: [
    { name: '工作区 cwd', where: 'Session header / 工作区选择器' },
    { name: '会话日志', where: '$DSH_HOME/sessions/<workspace>/<session>/session.v4.jsonl.zstd' },
    { name: '投影缓存', where: '$DSH_HOME/storages/session_projcache' },
  ],
}

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

function clip(value, max) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function readLocal(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage can be unavailable in private windows */
  }
}

function libraryShelf(value) {
  const list = Array.isArray(value?.libraries) ? value.libraries.slice(0, 4) : []
  const shelf = list.map((item) => ({
    id: String(item.id ?? ''),
    label: String(item.label ?? item.id ?? '技能库'),
    count: Number(item.count ?? 0),
    skills: Array.isArray(item.skills) ? item.skills : [],
    placeholder: false,
  }))
  while (shelf.length < 4) {
    shelf.push({
      id: `placeholder-${shelf.length}`,
      label: `技能库 ${shelf.length + 1}（未读取）`,
      count: 0,
      skills: [],
      placeholder: true,
    })
  }
  return shelf
}

async function fetchLibraries(sessionId) {
  try {
    const response = await fetch('/api/dsh-factory/libraries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId ?? '' }),
      credentials: 'same-origin',
    })
    if (!response.ok) return null
    const body = await response.json()
    if (body?.ok === true && body.value) return body.value
    return null
  } catch {
    return null
  }
}

const LIBRARIES_CACHE = new Map()

function useLibraries(sessionId) {
  const [value, setValue] = useState(() => LIBRARIES_CACHE.get(sessionId) ?? null)
  useEffect(() => {
    let alive = true
    const cached = LIBRARIES_CACHE.get(sessionId)
    if (cached !== undefined && Date.now() - cached.at < 60_000) {
      setValue(cached.value)
      return undefined
    }
    fetchLibraries(sessionId).then((next) => {
      if (!alive || next === null) return
      LIBRARIES_CACHE.set(sessionId, { value: next, at: Date.now() })
      setValue(next)
    })
    return () => {
      alive = false
    }
  }, [sessionId])
  return value
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const value = readLocal(THEME_KEY, 'pixel')
    return value === 'water' ? 'water' : 'pixel'
  })
  const change = useCallback((next) => {
    setTheme(next)
    writeLocal(THEME_KEY, next)
  }, [])
  return [theme, change]
}

function skillOfTurn(view) {
  const skills = Array.isArray(view?.skills) ? view.skills : []
  const turn = view?.turn
  const current = skills.filter((entry) => entry.turn === turn)
  if (current.length > 0) return current[current.length - 1].name
  return skills.length > 0 ? skills[skills.length - 1].name : ''
}

function routeOfView(view) {
  const turn = view?.turn
  const tools = (view?.tools ?? []).filter((tool) => tool.turn === turn)
  const subagents = (view?.subagents ?? []).filter((entry) => {
    if (entry.at === undefined) return false
    return view?.startedAt === null || view?.startedAt === undefined ? true : entry.at >= view.startedAt
  })
  if (subagents.length > 0) {
    return {
      label: '子代理',
      detail: `${subagents.length} 个子代理 · ${subagents[subagents.length - 1].label}`,
      tone: 'route',
    }
  }
  const retrieval = tools.find((tool) => /search|recall|grep|glob|retriev/i.test(tool.name ?? ''))
  if (retrieval) {
    return {
      label: retrieval.chars > 0 ? '检索命中' : '检索未命中',
      detail: `${retrieval.name} · ${retrieval.chars} 字符`,
      tone: retrieval.chars > 0 ? 'hit' : 'miss',
    }
  }
  return { label: '单轮', detail: '不派工，直连模型', tone: 'single' }
}

function toDisplay(event) {
  if (event === null || event === undefined) return null
  const workshop = event.kind === 'turn/end' ? 'exit' : event.workshop
  return {
    workshop,
    label: event.label ?? '',
    detail: event.detail ?? '',
    kind: event.kind ?? '',
    seq: event.seq ?? -1,
    time: event.time ?? 0,
    status: event.status ?? '',
  }
}

function eventDuration(event, speed) {
  let base = 900
  if (event.kind === 'turn/start' || event.kind === 'turn/end') base = 1100
  else if (event.workshop === 'skill') base = 1500
  else if (event.workshop === 'tools') base = 1100
  else if (event.workshop === 'route') base = 1000
  else if (event.workshop === 'model') base = 850
  return Math.round(base * (speed === 0.5 ? 2 : 1))
}

/* ------------------------------------------------------------------ */
/* Playback queue                                                      */
/* ------------------------------------------------------------------ */

function usePlayback(view, speed, stepMode) {
  const [display, setDisplay] = useState(null)
  const [queueView, setQueueView] = useState([])
  const [playing, setPlaying] = useState(false)
  const [tick, setTick] = useState(0)
  const queue = useRef([])
  const lastSeq = useRef(-1)
  const baseline = useRef(false)
  const playingRef = useRef(false)
  const speedRef = useRef(speed)
  const stepRef = useRef(stepMode)
  const sid = useRef(null)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    stepRef.current = stepMode
    if (!stepMode && !playingRef.current && queue.current.length > 0) setTick((value) => value + 1)
  }, [stepMode])

  const syncQueue = useCallback(() => {
    setQueueView(queue.current.slice())
  }, [])

  useEffect(() => {
    const nextSid = view?.sid ?? null
    if (sid.current !== nextSid) {
      sid.current = nextSid
      baseline.current = false
      lastSeq.current = -1
      queue.current = []
      playingRef.current = false
      setQueueView([])
      setPlaying(false)
      setDisplay(null)
    }
    if (!view) return
    const events = Array.isArray(view.events) ? view.events : []
    if (!baseline.current) {
      baseline.current = true
      lastSeq.current = events.length > 0 ? events[events.length - 1].seq : -1
      const last = events.length > 0 ? events[events.length - 1] : null
      setDisplay(last !== null
        ? toDisplay(last)
        : view.running
          ? {
              workshop: 'intake',
              label: '等待真实事件',
              detail: '',
              kind: 'idle',
              seq: -1,
              time: view.updatedAt,
              status: '',
            }
          : null)
      return
    }
    const fresh = events.filter((event) => event.seq > lastSeq.current)
    if (fresh.length === 0) return
    lastSeq.current = fresh[fresh.length - 1].seq
    queue.current.push(...fresh)
    if (queue.current.length > 60) queue.current.splice(0, queue.current.length - 60)
    syncQueue()
    if (!playingRef.current && !stepRef.current) setTick((value) => value + 1)
  }, [view, syncQueue])

  useEffect(() => {
    if (stepMode) return undefined
    if (playingRef.current) return undefined
    const next = queue.current[0]
    if (next === undefined) return undefined
    playingRef.current = true
    queue.current.shift()
    syncQueue()
    setDisplay(toDisplay(next))
    setPlaying(true)
    const timer = setTimeout(() => {
      playingRef.current = false
      setPlaying(false)
      setTick((value) => value + 1)
    }, eventDuration(next, speedRef.current))
    return () => {
      clearTimeout(timer)
    }
  }, [tick, stepMode, syncQueue])

  const step = useCallback(() => {
    if (queue.current.length === 0) return
    const next = queue.current.shift()
    syncQueue()
    setDisplay(toDisplay(next))
  }, [syncQueue])

  const skip = useCallback(() => {
    if (queue.current.length === 0) return
    const last = queue.current[queue.current.length - 1]
    queue.current = []
    syncQueue()
    setDisplay(toDisplay(last))
  }, [syncQueue])

  return { display, queue: queueView, playing, step, skip }
}

/* ------------------------------------------------------------------ */
/* SVG primitives                                                      */
/* ------------------------------------------------------------------ */

function Icon({ name, x, y, size = 20, className }) {
  const half = size / 2
  const props = {
    className: `df-icon ${className ?? ''}`,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  const paths = {
    box: [
      h('path', { key: 'a', d: 'M-9 -6 L0 -10 L9 -6 L9 7 L0 11 L-9 7 Z' }),
      h('path', { key: 'b', d: 'M-9 -6 L0 -2 L9 -6 M0 -2 V11' }),
    ],
    loop: [
      h('path', { key: 'a', d: 'M-8 -3 A8 8 0 1 1 -8 4' }),
      h('path', { key: 'b', d: 'M-11 -7 L-8 -3 L-4 -6' }),
    ],
    layers: [
      h('path', { key: 'a', d: 'M-9 -5 L0 -10 L9 -5 L0 0 Z' }),
      h('path', { key: 'b', d: 'M-9 1 L0 6 L9 1' }),
      h('path', { key: 'c', d: 'M-9 6 L0 11 L9 6' }),
    ],
    book: [
      h('path', { key: 'a', d: 'M-9 -8 H-1 A4 4 0 0 1 3 -4 V9 H-9 Z' }),
      h('path', { key: 'b', d: 'M9 -8 H1 A4 4 0 0 0 -3 -4 V9 H9 Z' }),
    ],
    split: [
      h('path', { key: 'a', d: 'M-10 0 H-2 M-2 0 L6 -7 H10 M-2 0 L6 7 H10' }),
    ],
    wrench: [
      h('path', { key: 'a', d: 'M-9 8 L-1 0 M-3 -7 A5 5 0 1 0 4 0 L-1 5' }),
      h('circle', { key: 'b', cx: -5, cy: -5, r: 2.4 }),
    ],
    gear: [
      h('circle', { key: 'a', cx: 0, cy: 0, r: 4 }),
      h('path', { key: 'b', d: 'M0 -10 V-7 M0 7 V10 M-10 0 H-7 M7 0 H10 M-7 -7 L-5 -5 M5 5 L7 7 M-7 7 L-5 5 M5 -5 L7 -7' }),
    ],
    crate: [
      h('path', { key: 'a', d: 'M-9 -6 L0 -10 L9 -6 L9 7 L0 11 L-9 7 Z' }),
      h('path', { key: 'b', d: 'M-9 -6 L0 -2 L9 -6 M-9 7 L0 3 L9 7' }),
    ],
    door: [
      h('path', { key: 'a', d: 'M-6 -10 H6 V10 H-6 Z' }),
      h('path', { key: 'b', d: 'M2 0 H10 M7 -3 L10 0 L7 3' }),
    ],
  }
  return h('g', { transform: `translate(${x} ${y})`, ...props }, paths[name] ?? paths.box)
}

function Gear({ x, y, r, teeth = 8, className }) {
  const spokes = []
  for (let index = 0; index < teeth; index += 1) {
    const angle = (index / teeth) * Math.PI * 2
    const inner = r * 0.78
    const outer = r * 1.18
    spokes.push(h('line', {
      key: `s${index}`,
      x1: x + Math.cos(angle) * inner,
      y1: y + Math.sin(angle) * inner,
      x2: x + Math.cos(angle) * outer,
      y2: y + Math.sin(angle) * outer,
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
    }))
  }
  return h('g', { className: `df-gear ${className ?? ''}` },
    h('circle', { cx: x, cy: y, r, fill: 'none', stroke: 'currentColor', strokeWidth: 2.4 }),
    h('circle', { cx: x, cy: y, r: r * 0.28, fill: 'currentColor', opacity: 0.55 }),
    ...spokes,
  )
}

/* ------------------------------------------------------------------ */
/* Station art                                                         */
/* ------------------------------------------------------------------ */

function PixelBuilding({ node, active, skipped, done, error }) {
  const { cx, cy, w, h } = node
  const d = 18
  const left = cx - w / 2
  const top = cy - h
  const bottom = cy - d / 2
  const topPoint = `${cx},${top - d / 2}`
  const topLeft = `${left},${top}`
  const topRight = `${left + w},${top}`
  const topBottom = `${cx},${top + d / 2}`
  return h('g', { className: 'df-pixel-only' },
    h('ellipse', { cx, cy: cy + 2, rx: w * 0.64, ry: 13, className: 'df-shadow' }),
    h('polygon', { points: `${topLeft} ${topPoint} ${topRight} ${topBottom}`, className: 'df-roof-3d' }),
    h('polygon', { points: `${topLeft} ${topBottom} ${cx},${bottom} ${left},${bottom - (top - bottom)}`, className: 'df-wall-left' }),
    h('polygon', { points: `${topBottom} ${topRight} ${left + w},${bottom - (top - bottom)} ${cx},${bottom}`, className: 'df-wall-right' }),
    h('polygon', { points: `${topRight} ${left + w + d},${top - d / 2} ${left + w + d},${bottom - (top - bottom) - d / 2} ${left + w},${bottom - (top - bottom)}`, className: 'df-wall-side' }),
    h('rect', { x: left + 12, y: top + 18, width: 15, height: 11, className: 'df-window-3d' }),
    h('rect', { x: left + 38, y: top + 18, width: 15, height: 11, className: 'df-window-3d' }),
    h('rect', { x: left + 24, y: bottom - 24, width: 20, height: 24, className: 'df-door-3d' }),
    h('rect', { x: left + w - 26, y: top - 24, width: 11, height: 24, className: 'df-chimney-3d' }),
    active
      ? h('g', { className: 'df-smoke' },
          h('circle', { cx: left + w - 20, cy: top - 30, r: 4 }),
          h('circle', { cx: left + w - 13, cy: top - 40, r: 5 }),
          h('circle', { cx: left + w - 24, cy: top - 49, r: 3.5 }),
        )
      : null,
    node.id === 'assembly'
      ? h('g', { className: active ? 'df-piston df-on' : 'df-piston' },
          h('rect', { x: left + w - 38, y: top + 10, width: 7, height: 22, className: 'df-piston-rod' }),
          h('rect', { x: left + w - 43, y: top + 32, width: 17, height: 9, className: 'df-piston-head' }),
        )
      : null,
    node.id === 'tools'
      ? h('g', { className: active ? 'df-robot-arm df-on' : 'df-robot-arm' },
          h('rect', { x: left + w - 20, y: bottom - 46, width: 8, height: 28, className: 'df-arm-base' }),
          h('rect', { x: left + w - 52, y: bottom - 52, width: 38, height: 7, className: 'df-arm-boom' }),
          h('circle', { cx: left + w - 52, cy: bottom - 49, r: 5, className: 'df-arm-joint' }),
        )
      : null,
    node.id === 'storage'
      ? h('g', { className: active ? 'df-crane df-on' : 'df-crane' },
          h('rect', { x: cx - 3, y: top - 42, width: 6, height: 30, className: 'df-crane-mast' }),
          h('rect', { x: cx - 20, y: top - 44, width: 40, height: 5, className: 'df-crane-boom' }),
          h('rect', { x: cx + 14, y: top - 38, width: 2, height: 22, className: 'df-crane-hook' }),
        )
      : null,
    h('rect', { x: left - 2, y: bottom - 6, width: w + d + 4, height: 6, className: 'df-plinth' }),
    done && !skipped ? h('text', { x: left + w + 4, y: top - d / 2 - 6, textAnchor: 'end', className: 'df-check' }, '✓') : null,
    error ? h('ellipse', { cx, cy: cy - h / 2, rx: w * 0.7, ry: h * 0.7, className: 'df-error-ring' }) : null,
  )
}

function WaterTank({ node, active, skipped, done, error }) {
  const { cx, cy, w, h } = node
  const left = cx - w / 2
  const top = cy - h
  const bottom = cy - 10
  const radius = Math.min(18, w / 3)
  return h('g', { className: 'df-water-only' },
    h('ellipse', { cx, cy: cy + 2, rx: w * 0.64, ry: 14, className: 'df-shadow' }),
    h('rect', { x: left, y: top, width: w, height: h - 6, rx: radius, className: 'df-tank-3d' }),
    h('ellipse', { cx, cy: top, rx: w / 2, ry: 10, className: 'df-tank-top' }),
    h('path', { d: `M${left + 8} ${bottom - 24} Q${cx - 20} ${bottom - 32} ${cx} ${bottom - 24} T${left + w - 8} ${bottom - 24}`, className: 'df-water-line' }),
    h('rect', { x: left + w - 16, y: top + 14, width: 9, height: h - 30, rx: 5, className: 'df-tank-gauge' }),
    h('circle', { cx: left + 20, cy: top + 26, r: 4, className: 'df-bubble' }),
    h('circle', { cx: left + 36, cy: top + 38, r: 2.5, className: 'df-bubble df-bubble-b' }),
    h('circle', { cx: left + w - 30, cy: top + 30, r: 3, className: 'df-bubble df-bubble-c' }),
    h('circle', { cx: left - 4, cy: cy - h / 2, r: 9, className: 'df-valve' }),
    h('line', { x1: left - 12, y1: cy - h / 2, x2: left + 4, y2: cy - h / 2, className: 'df-valve-line' }),
    h('line', { x1: left - 4, y1: cy - h / 2 - 7, x2: left - 4, y2: cy - h / 2 + 7, className: 'df-valve-line' }),
    h('path', { d: `M${left + w - 10} ${cy - 18} H${left + w + 14} V${cy + 6}`, className: 'df-pipe-out' }),
    active
      ? h('g', { className: 'df-bubbles' },
          h('circle', { cx: left + 26, cy: top + 20, r: 3 }),
          h('circle', { cx: left + 44, cy: top + 16, r: 2 }),
        )
      : null,
    done && !skipped ? h('text', { x: left + w + 8, y: top - 10, textAnchor: 'end', className: 'df-check' }, '✓') : null,
    error ? h('ellipse', { cx, cy: cy - h / 2, rx: w * 0.7, ry: h * 0.7, className: 'df-error-ring' }) : null,
  )
}

function ModelExtras({ node, active, theme }) {
  const { cx, cy } = node
  const gearY = cy - 48
  if (theme === 'water') {
    return h('g', { className: active ? 'df-model-fx df-active' : 'df-model-fx' },
      h('circle', { cx, cy: gearY, r: 22, className: 'df-turbine-ring' }),
      h('path', { d: `M${cx - 19} ${gearY} A19 19 0 0 1 ${cx + 19} ${gearY}`, className: 'df-turbine-water' }),
      active ? h('g', { className: 'df-sparks' },
        h('circle', { cx: cx - 30, cy: gearY - 14, r: 2.5 }),
        h('circle', { cx: cx + 27, cy: gearY - 20, r: 2 }),
        h('circle', { cx: cx + 34, cy: gearY + 4, r: 1.8 }),
      ) : null,
    )
  }
  return h('g', { className: active ? 'df-model-fx df-active' : 'df-model-fx' },
    h(Gear, { x: cx - 18, y: gearY, r: 13, teeth: 8, className: 'df-gear-a' }),
    h(Gear, { x: cx + 16, y: gearY + 10, r: 10, teeth: 7, className: 'df-gear-b' }),
    active ? h('g', { className: 'df-sparks' },
      h('line', { x1: cx - 38, y1: gearY - 22, x2: cx - 30, y2: gearY - 14 }),
      h('line', { x1: cx + 28, y1: gearY - 26, x2: cx + 34, y2: gearY - 18 }),
      h('line', { x1: cx + 40, y1: gearY - 2, x2: cx + 48, y2: gearY - 8 }),
    ) : null,
  )
}

function WorkerArt({ theme, active, walking, flip, carrying }) {
  const scale = flip ? -1 : 1
  const body = theme === 'water'
    ? h('g', { className: 'df-worker-body' },
        h('rect', { x: -5, y: -18, width: 10, height: 13, rx: 4, className: 'df-worker-torso' }),
        h('circle', { cx: 0, cy: -22, r: 5, className: 'df-worker-head' }),
        h('rect', { x: -9, y: -16, width: 4, height: 11, rx: 2, className: 'df-worker-arm df-arm-l' }),
        h('rect', { x: 5, y: -16, width: 4, height: 11, rx: 2, className: 'df-worker-arm df-arm-r' }),
        h('rect', { x: -5, y: -6, width: 4, height: 7, rx: 2, className: 'df-worker-leg df-leg-l' }),
        h('rect', { x: 1, y: -6, width: 4, height: 7, rx: 2, className: 'df-worker-leg df-leg-r' }),
        h('rect', { x: -6, y: -28, width: 12, height: 4, rx: 2, className: 'df-worker-helmet' }),
      )
    : h('g', { className: 'df-worker-body' },
        h('rect', { x: -5, y: -18, width: 10, height: 13, className: 'df-worker-torso' }),
        h('rect', { x: -4, y: -26, width: 8, height: 8, className: 'df-worker-head' }),
        h('rect', { x: -9, y: -16, width: 4, height: 11, className: 'df-worker-arm df-arm-l' }),
        h('rect', { x: 5, y: -16, width: 4, height: 11, className: 'df-worker-arm df-arm-r' }),
        h('rect', { x: -5, y: -6, width: 4, height: 7, className: 'df-worker-leg df-leg-l' }),
        h('rect', { x: 1, y: -6, width: 4, height: 7, className: 'df-worker-leg df-leg-r' }),
        h('rect', { x: -6, y: -29, width: 12, height: 4, className: 'df-worker-helmet' }),
      )
  return h('g', { className: 'df-worker', 'data-active': active ? '1' : '0', 'data-walking': walking ? '1' : '0' },
    h('ellipse', { cx: 0, cy: 1, rx: 10, ry: 3.5, className: 'df-worker-shadow' }),
    h('g', { transform: `scale(${scale} 1)`, className: 'df-worker-scale' },
      body,
      carrying ? h('rect', { x: 7, y: -16, width: 11, height: 9, className: 'df-worker-carry' }) : null,
    ),
  )
}

function Worker({ x, y, theme, active, walking, flip, carrying }) {
  return h('g', { className: 'df-worker-seat', style: { transform: `translate(${x}px, ${y}px)` } },
    h(WorkerArt, { theme, active, walking, flip, carrying }),
  )
}

function StationSign({ node, active, skipped, done, error }) {
  const { cx, cy, w } = node
  const width = Math.max(96, w + 6)
  return h('g', { className: 'df-sign' },
    h('rect', { x: cx - width / 2, y: cy + 5, width, height: 30, rx: 5, className: 'df-sign-bg' }),
    h('circle', { cx: cx - width / 2 + 10, cy: cy + 20, r: 4, className: `df-sign-lamp ${active ? 'df-on' : ''} ${error ? 'df-bad' : ''} ${done ? 'df-ok' : ''}` }),
    h('text', { x: cx - width / 2 + 20, y: cy + 18, className: 'df-station-name' }, node.name),
    h('text', { x: cx - width / 2 + 20, y: cy + 30, className: 'df-station-sub' }, node.sub),
    skipped
      ? h('text', { x: cx + width / 2 - 6, y: cy + 20, textAnchor: 'end', className: 'df-skip-badge' }, '跳过')
      : null,
  )
}

function Station({ node, view, display, playing, stepMode, selected, onSelect, theme }) {
  const stats = view?.workshops?.[node.id]
  const skipped = Array.isArray(view?.perTurn?.skipped) && view.perTurn.skipped.includes(node.id)
  const active = display?.workshop === node.id && (playing || stepMode)
  const done = (stats?.used ?? 0) > 0 && !active && !skipped
  const error = view?.lastError?.workshop === node.id
  const classes = ['df-station', `df-station-${node.id}`]
  if (active) classes.push('df-active')
  if (skipped) classes.push('df-skipped')
  if (selected) classes.push('df-selected')
  if (error) classes.push('df-error')
  const label = node.name
  const sub = node.sub
  return h('g', {
    className: classes.join(' '),
    role: 'button',
    tabIndex: 0,
    'aria-label': `${label}：${sub}`,
    onClick: () => onSelect(node.id),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(node.id)
      }
    },
    style: { cursor: 'pointer' },
  },
    h('title', null, `${label} · ${sub}`),
    theme === 'water'
      ? h(WaterTank, { node, active, skipped, done, error })
      : h(PixelBuilding, { node, active, skipped, done, error }),
    node.id === 'model' ? h(ModelExtras, { node, active, theme }) : null,
    h(Icon, { name: node.icon, x: node.cx - 34, y: node.cy - 18, size: 20, className: 'df-station-icon' }),
    h('text', { x: node.cx, y: node.cy + 4, textAnchor: 'middle', className: 'df-station-name' }, label),
    h('text', { x: node.cx, y: node.cy + 20, textAnchor: 'middle', className: 'df-station-sub' }, sub),
    stats !== undefined && stats.used > 0
      ? h('text', { x: node.cx, y: node.cy + 38, textAnchor: 'middle', className: 'df-station-count' }, `${stats.used} 次`)
      : null,
    skipped
      ? h('text', { x: node.cx, y: node.cy - node.h / 2 - 8, textAnchor: 'middle', className: 'df-skip-badge' }, '跳过')
      : null,
  )
}

/* ------------------------------------------------------------------ */
/* Conveyor / pipe edges                                               */
/* ------------------------------------------------------------------ */

function Edge({ edge, display, playing, stepMode, view }) {
  const active = display?.workshop === edge.to && (playing || stepMode)
  const skipActive = edge.skip && Array.isArray(view?.perTurn?.skipped) && view.perTurn.skipped.length > 0
  const errorActive = edge.error && view?.lastError !== null && view?.lastError !== undefined
  const classes = ['df-edge']
  if (edge.main) classes.push('df-edge-main')
  if (edge.dashed) classes.push('df-edge-dashed')
  if (active) classes.push('df-edge-active')
  if (skipActive) classes.push('df-edge-skip')
  if (errorActive) classes.push('df-edge-error')
  return h('g', { className: classes.join(' ') },
    h('path', { d: edge.d, className: 'df-edge-hit' }),
    h('path', { d: edge.d, className: 'df-edge-line' }),
    h('path', { d: edge.d, className: 'df-edge-flow' }),
    edge.label !== '' && edge.lx !== undefined
      ? h('text', { x: edge.lx, y: edge.ly, textAnchor: 'middle', className: 'df-edge-label' }, edge.label)
      : null,
  )
}

/* ------------------------------------------------------------------ */
/* Material box                                                        */
/* ------------------------------------------------------------------ */

function BoxArt({ stage, skill, theme, active }) {
  const sticker = stage === 'skill' && skill !== ''
  const open = stage === 'assembly'
  if (theme === 'water') {
    return h('g', { className: 'df-box-art' },
      h('rect', { x: -26, y: -19, width: 52, height: 38, rx: 13, className: 'df-water-box' }),
      h('rect', { x: -26, y: -4, width: 52, height: 8, className: 'df-box-tape' }),
      h('rect', { x: -4, y: -19, width: 8, height: 38, className: 'df-box-tape' }),
      h('circle', { cx: -16, cy: -10, r: 2.5, className: 'df-box-bubble' }),
      h('circle', { cx: 14, cy: 9, r: 2, className: 'df-box-bubble df-box-bubble-b' }),
      open ? h('g', { className: 'df-box-open' },
        h('path', { d: 'M-24 -18 L-34 -28 L-12 -22 Z', className: 'df-water-flap' }),
        h('path', { d: 'M24 -18 L34 -28 L12 -22 Z', className: 'df-water-flap' }),
        h('rect', { x: -14, y: -26, width: 28, height: 7, rx: 2, className: 'df-box-paper' }),
      ) : null,
      sticker ? h('g', { className: 'df-sticker' },
        h('rect', { x: -20, y: 24, width: 44, height: 14, rx: 4, className: 'df-sticker-bg' }),
        h('text', { x: 2, y: 34, textAnchor: 'middle', className: 'df-sticker-text' }, clip(skill, 8)),
      ) : null,
      stage === 'storage' ? h('g', { className: 'df-barcode' },
        h('line', { x1: -18, y1: 24, x2: -18, y2: 32 }),
        h('line', { x1: -14, y1: 24, x2: -14, y2: 32 }),
        h('line', { x1: -8, y1: 24, x2: -8, y2: 32 }),
        h('line', { x1: -2, y1: 24, x2: -2, y2: 32 }),
      ) : null,
      stage === 'tools' ? h('circle', { cx: 27, cy: 2, r: 5, className: 'df-box-port' }) : null,
      stage === 'exit' ? h('g', { className: 'df-stamp' },
        h('circle', { cx: 0, cy: 0, r: 16 }),
        h('text', { x: 0, y: 4, textAnchor: 'middle' }, 'DONE'),
      ) : null,
      active ? h('circle', { cx: 0, cy: 0, r: 36, className: 'df-box-glow' }) : null,
    )
  }
  return h('g', { className: 'df-box-art' },
    h('rect', { x: -26, y: -19, width: 52, height: 38, rx: 2, className: 'df-pixel-box' }),
    h('rect', { x: -26, y: -5, width: 52, height: 9, className: 'df-box-tape' }),
    h('rect', { x: -5, y: -19, width: 9, height: 38, className: 'df-box-tape' }),
    h('rect', { x: -22, y: -15, width: 8, height: 5, className: 'df-box-window' }),
    open ? h('g', { className: 'df-box-open' },
      h('path', { d: 'M-24 -18 L-36 -30 L-8 -22 Z', className: 'df-pixel-flap' }),
      h('path', { d: 'M24 -18 L36 -30 L8 -22 Z', className: 'df-pixel-flap' }),
      h('rect', { x: -14, y: -28, width: 28, height: 8, rx: 1, className: 'df-box-paper' }),
    ) : null,
    sticker ? h('g', { className: 'df-sticker' },
      h('rect', { x: -21, y: 24, width: 46, height: 15, rx: 2, className: 'df-sticker-bg' }),
      h('text', { x: 2, y: 35, textAnchor: 'middle', className: 'df-sticker-text' }, clip(skill, 8)),
    ) : null,
    stage === 'storage' ? h('g', { className: 'df-barcode' },
      h('line', { x1: -18, y1: 24, x2: -18, y2: 32 }),
      h('line', { x1: -13, y1: 24, x2: -13, y2: 32 }),
      h('line', { x1: -7, y1: 24, x2: -7, y2: 32 }),
      h('line', { x1: -1, y1: 24, x2: -1, y2: 32 }),
    ) : null,
    stage === 'tools' ? h('circle', { cx: 27, cy: 2, r: 5, className: 'df-box-port' }) : null,
    stage === 'exit' ? h('g', { className: 'df-stamp' },
      h('circle', { cx: 0, cy: 0, r: 16 }),
      h('text', { x: 0, y: 4, textAnchor: 'middle' }, 'DONE'),
    ) : null,
    active ? h('circle', { cx: 0, cy: 0, r: 36, className: 'df-box-glow' }) : null,
  )
}

function MaterialBox({ display, view, theme, active }) {
  const [animated, setAnimated] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(timer)
  }, [])
  if (display === null || display === undefined) return null
  const node = NODES[display.workshop] ?? NODES.intake
  const stage = display.workshop
  const skill = skillOfTurn(view)
  const dx = stage === 'skill' ? -70 : stage === 'tools' ? -86 : 0
  const dy = stage === 'storage' ? 18 : 0
  return h('g', {
    className: `df-box ${animated ? 'df-box-animate' : ''}`,
    style: { transform: `translate(${node.cx + dx}px, ${node.cy + dy}px)` },
  },
    h(BoxArt, { stage, skill, theme, active }),
    h('text', { x: 0, y: 54, textAnchor: 'middle', className: 'df-box-caption' }, STAGE_LABEL[stage] ?? ''),
  )
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

function SkillScan({ libraryValue, skill, theme }) {
  const shelf = libraryShelf(libraryValue)
  const hit = shelf.findIndex((library) => library.skills.includes(skill))
  return h('div', { className: `df-overlay df-skill-scan df-theme-${theme}` },
    h('div', { className: 'df-overlay-title' }, 'Skill 车间 · 4 库扫描'),
    h('div', { className: 'df-skill-beam' }),
    h('div', { className: 'df-skill-shelf' },
      shelf.map((library, index) => h('div', {
        key: library.id,
        className: `df-skill-lib ${index === hit ? 'df-hit' : ''} ${library.placeholder ? 'df-placeholder' : ''}`,
        style: { animationDelay: `${index * 160}ms` },
      },
        h('span', { className: 'df-skill-dot' }),
        h('span', { className: 'df-skill-lib-name' }, library.label),
        h('span', { className: 'df-skill-lib-count' }, library.placeholder ? '—' : `${library.count} 项`),
      )),
    ),
    h('div', { className: 'df-skill-book' },
      h('span', { className: 'df-book-cover' }),
      h('span', { className: 'df-book-page df-book-page-a' }),
      h('span', { className: 'df-book-page df-book-page-b' }),
    ),
    h('div', { className: 'df-skill-sticker' },
      h('span', { className: 'df-skill-sticker-pin' }),
      h('span', {}, skill === '' ? '扫描中…' : `命中：${skill}`),
    ),
  )
}

function ToolExchange({ tool, theme }) {
  const name = tool?.name ?? '等待工具调用'
  const mcp = tool?.mcp === true
  const endpoint = mcp ? `mcp://${tool?.server || 'server'}` : 'tool://local'
  return h('div', { className: `df-overlay df-tool-window df-theme-${theme}` },
    h('div', { className: 'df-window-bar' },
      h('span', { className: 'df-window-dot' }),
      h('span', { className: 'df-window-dot' }),
      h('span', { className: 'df-window-dot' }),
      h('span', { className: 'df-window-title' }, endpoint),
    ),
    h('div', { className: 'df-window-body' },
      h('div', { className: 'df-window-endpoint' }, name),
      h('div', { className: 'df-window-row' },
        h('span', { className: 'df-window-arrow df-req' }, 'REQ →'),
        h('code', null, clip(tool?.args || '{}', 70)),
      ),
      h('div', { className: 'df-window-row' },
        h('span', { className: 'df-window-arrow df-res' }, '← RES'),
        h('span', null, tool ? `${tool.status} · ${tool.chars} 字符` : '等待响应'),
      ),
      h('div', { className: 'df-window-wire' },
        h('span', { className: 'df-wire-in' }),
        h('span', { className: 'df-wire-out' }),
      ),
    ),
  )
}

function RouteGate({ route, theme }) {
  return h('div', { className: `df-overlay df-route-gate df-theme-${theme}` },
    h('div', { className: 'df-overlay-title' }, '路由车间 · 岔道闸门'),
    h('div', { className: 'df-fork' },
      h('span', { className: 'df-fork-trunk' }),
      h('span', { className: `df-fork-branch df-fork-a ${route.tone === 'route' ? 'df-branch-on' : ''}` }),
      h('span', { className: `df-fork-branch df-fork-b ${route.tone !== 'route' ? 'df-branch-on' : ''}` }),
      h('span', { className: `df-gate ${route.tone === 'route' ? 'df-gate-open' : ''}` }),
    ),
    h('div', { className: 'df-route-decision' }, route.label),
    h('div', { className: 'df-route-detail' }, route.detail),
  )
}

/* ------------------------------------------------------------------ */
/* Details panel                                                       */
/* ------------------------------------------------------------------ */

function Section({ title, children }) {
  return h('div', { className: 'df-section' },
    h('div', { className: 'df-section-title' }, title),
    children,
  )
}

function StationDetails({ nodeId, view, libraryValue, onClose, theme }) {
  const node = NODES[nodeId]
  if (node === undefined) return null
  const events = (view?.events ?? []).filter((event) => event.workshop === nodeId).slice(-8).reverse()
  const perTurn = view?.perTurn
  const used = perTurn?.counts?.[nodeId] ?? 0
  const bytes = perTurn?.bytes?.[nodeId] ?? 0
  const tools = (view?.tools ?? []).filter((tool) => tool.turn === view?.turn)
  const files = (view?.files ?? []).filter((file) => file.turn === view?.turn)
  const skills = (view?.skills ?? []).filter((skill) => skill.turn === view?.turn)
  const subagents = view?.subagents ?? []
  const route = routeOfView(view)
  return h('aside', { className: `df-details df-theme-${theme}`, 'aria-label': `${node.name} 详情` },
    h('div', { className: 'df-details-head' },
      h('div', null,
        h('div', { className: 'df-details-title' }, node.name),
        h('div', { className: 'df-details-sub' }, node.sub),
      ),
      h('button', { type: 'button', className: 'df-close', onClick: onClose, 'aria-label': '关闭详情' }, '×'),
    ),
    h('p', { className: 'df-details-duty' }, RESPONSIBILITY[nodeId]),
    h('div', { className: 'df-metrics' },
      h('div', { className: 'df-metric' }, h('b', null, String(used)), h('span', null, '本 turn 次数')),
      h('div', { className: 'df-metric' }, h('b', null, String(bytes)), h('span', null, '本 turn 字符')),
      nodeId === 'model'
        ? h('div', { className: 'df-metric' }, h('b', null, view?.usage?.output ?? '—'), h('span', null, '输出 token'))
        : null,
      nodeId === 'tools'
        ? h('div', { className: 'df-metric' }, h('b', null, String(tools.filter((tool) => tool.mcp).length)), h('span', null, 'MCP 调用'))
        : null,
    ),
    h(Section, { title: '本 turn 实际发生' },
      events.length === 0
        ? h('p', { className: 'df-empty' },
            view?.perTurn?.skipped?.includes(nodeId)
              ? '本 turn 没有走到这个车间，箱子走了跳过支路。'
              : '本 turn 尚未发生；等真实事件到达后会自动出现。')
        : h('ol', { className: 'df-event-list' },
            events.map((event) => h('li', { key: `${event.seq}-${event.label}` },
              h('span', { className: `df-event-time ${event.status}` }, `#${event.seq}`),
              h('span', { className: 'df-event-label' }, event.label),
              event.detail ? h('span', { className: 'df-event-detail' }, event.detail) : null,
            )),
          ),
    ),
    nodeId === 'skill'
      ? h(Section, { title: '技能库扫描' },
          h('div', { className: 'df-library-list' },
            libraryShelf(libraryValue).map((library) => h('div', { key: library.id, className: 'df-library-row' },
              h('span', null, library.label),
              h('b', null, library.placeholder ? '—' : String(library.count)),
            )),
          ),
          skills.length > 0
            ? h('div', { className: 'df-chip-row' }, skills.map((skill) => h('span', { key: `${skill.at}-${skill.name}`, className: 'df-chip df-chip-skill' }, skill.name)))
            : h('p', { className: 'df-empty' }, '本 turn 尚未命中技能。'),
        )
      : null,
    nodeId === 'tools'
      ? h(Section, { title: '工具 / MCP 端点' },
          tools.length === 0
            ? h('p', { className: 'df-empty' }, '本 turn 尚未调用工具。')
            : h('ul', { className: 'df-tool-list' },
                tools.slice(-8).reverse().map((tool) => h('li', { key: `${tool.id}-${tool.at}` },
                  h('span', { className: `df-tool-status ${tool.status}` }, tool.status === 'error' ? '×' : tool.status === 'running' ? '…' : '✓'),
                  h('div', { className: 'df-tool-main' },
                    h('div', { className: 'df-tool-name' }, tool.mcp ? `mcp://${tool.server} · ${tool.name}` : tool.name),
                    h('div', { className: 'df-tool-meta' }, `${formatMs(tool.ms)} · ${tool.chars} 字符${tool.error ? ` · ${tool.error}` : ''}`),
                  ),
                )),
              ),
        )
      : null,
    nodeId === 'route'
      ? h(Section, { title: '岔道决策' },
          h('div', { className: `df-route-pill df-route-${route.tone}` }, route.label),
          h('p', { className: 'df-route-detail' }, route.detail),
          subagents.length > 0
            ? h('ul', { className: 'df-sub-list' },
                subagents.slice(-6).reverse().map((entry) => h('li', { key: `${entry.id}-${entry.at}` },
                  h('b', null, entry.label),
                  h('span', null, `${entry.mode} · ${clip(entry.id, 18)}`),
                )),
              )
            : null,
        )
      : null,
    nodeId === 'model'
      ? h(Section, { title: '模型路由' },
          h('div', { className: 'df-kv' },
            h('span', null, 'provider'), h('b', null, view?.model?.provider || '—'),
            h('span', null, 'model'), h('b', null, view?.model?.model || '—'),
            h('span', null, 'contextWindow'), h('b', null, view?.model?.contextWindow ?? '—'),
            h('span', null, '输出 token'), h('b', null, view?.usage?.output ?? '—'),
          ),
        )
      : null,
    nodeId === 'storage'
      ? h(Section, { title: '仓储读写' },
          files.length === 0
            ? h('p', { className: 'df-empty' }, '本 turn 尚未读写工作区文件。')
            : h('ul', { className: 'df-file-list' },
                files.slice(-8).reverse().map((file) => h('li', { key: `${file.at}-${file.path}` },
                  h('span', { className: 'df-file-op' }, file.op),
                  h('code', null, clip(file.path, 60)),
                )),
              ),
        )
      : null,
    h(Section, { title: '可配置点' },
      h('ul', { className: 'df-config-list' },
        (CONFIG_POINTS[nodeId] ?? []).map((point) => h('li', { key: point.name },
          h('b', null, point.name),
          h('span', null, point.where),
        )),
      ),
    ),
    h('div', { className: 'df-details-foot' },
      h('span', null, `session ${clip(view?.sid || '—', 12)}`),
      h('span', null, `seq ${view?.seq ?? '—'}`),
    ),
  )
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

function Toolbar({ view, theme, setTheme, speed, setSpeed, stepMode, setStepMode, queue, step, skip, liveRunning }) {
  const running = view?.running === true && liveRunning !== false
  const status = running ? '运行中' : view ? '空闲' : '等待投影'
  return h('div', { className: 'df-toolbar' },
    h('div', { className: 'df-brand' },
      h('span', { className: 'df-brand-mark' }, '▦'),
      h('div', null,
        h('div', { className: 'df-brand-title' }, '工厂蓝图'),
        h('div', { className: 'df-brand-sub' }, 'DSH Agent 内部结构 · 真实事件驱动'),
      ),
    ),
    h('div', { className: 'df-status-row' },
      h('span', { className: `df-pill df-pill-${running ? 'run' : 'idle'}` }, status),
      view?.turn !== null && view?.turn !== undefined
        ? h('span', { className: 'df-pill' }, `turn ${view.turn}${view.step !== null && view.step !== undefined ? ` · step ${view.step}` : ''}`)
        : null,
      queue.length > 0 ? h('span', { className: 'df-pill df-pill-live' }, `播放队列 ${queue.length}`) : null,
    ),
    h('div', { className: 'df-controls' },
      h('div', { className: 'df-seg', role: 'group', 'aria-label': '主题' },
        h('button', { type: 'button', className: theme === 'pixel' ? 'df-seg-on' : '', onClick: () => setTheme('pixel') }, '像素工厂'),
        h('button', { type: 'button', className: theme === 'water' ? 'df-seg-on' : '', onClick: () => setTheme('water') }, '水流管道'),
      ),
      h('div', { className: 'df-seg', role: 'group', 'aria-label': '速度' },
        h('button', { type: 'button', className: speed === 1 ? 'df-seg-on' : '', onClick: () => setSpeed(1) }, '1×'),
        h('button', { type: 'button', className: speed === 0.5 ? 'df-seg-on' : '', onClick: () => setSpeed(0.5) }, '0.5×'),
        h('button', { type: 'button', className: stepMode ? 'df-seg-on' : '', onClick: () => setStepMode(!stepMode) }, stepMode ? '单步中' : '单步'),
      ),
      h('button', {
        type: 'button',
        className: 'df-ctl',
        disabled: queue.length === 0,
        onClick: stepMode ? step : skip,
        title: stepMode ? '播放队列中的下一个事件' : '跳到最新事件',
      }, stepMode ? `下一步 (${queue.length})` : '跳到最新'),
    ),
  )
}

function FactoryBoard({ view, liveRunning, theme, setTheme, speed, setSpeed, stepMode, setStepMode, compact, libraryValue }) {
  const playback = usePlayback(view, speed, stepMode)
  const [selected, setSelected] = useState(null)
  const display = playback.display
  const active = playback.playing || stepMode
  const route = routeOfView(view)
  const skill = skillOfTurn(view)
  const tool = useMemo(() => {
    const tools = (view?.tools ?? []).filter((entry) => entry.turn === view?.turn)
    return tools.length > 0 ? tools[tools.length - 1] : null
  }, [view])
  const visited = useMemo(() => {
    if (!view) return []
    const start = view.startedAt ?? 0
    const seen = []
    for (const event of view.events ?? []) {
      if (event.time < start) continue
      if (event.workshop === 'intake' || event.workshop === 'orchestrate' || event.workshop === 'exit') continue
      if (!seen.includes(event.workshop)) seen.push(event.workshop)
    }
    return seen
  }, [view])

  return h('div', { className: `df-root df-theme-${theme} ${compact ? 'df-compact' : ''}` },
    h(Toolbar, {
      view,
      theme,
      setTheme,
      speed,
      setSpeed,
      stepMode,
      setStepMode,
      queue: playback.queue,
      step: playback.step,
      skip: playback.skip,
      liveRunning,
    }),
    h('div', { className: 'df-board' },
      h('svg', { className: 'df-svg', viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'DSH Agent 工厂蓝图' },
        h('defs', null,
          h('pattern', { id: 'df-grid', width: 22, height: 22, patternUnits: 'userSpaceOnUse' },
            h('path', { d: 'M22 0 H0 V22', fill: 'none', stroke: 'currentColor', strokeWidth: 0.6, opacity: 0.16 }),
          ),
          h('pattern', { id: 'df-bubbles', width: 90, height: 90, patternUnits: 'userSpaceOnUse' },
            h('circle', { cx: 16, cy: 22, r: 2, fill: 'currentColor', opacity: 0.18 }),
            h('circle', { cx: 62, cy: 48, r: 3, fill: 'currentColor', opacity: 0.12 }),
            h('circle', { cx: 34, cy: 74, r: 1.6, fill: 'currentColor', opacity: 0.2 }),
            h('circle', { cx: 76, cy: 14, r: 1.4, fill: 'currentColor', opacity: 0.2 }),
          ),
          h('radialGradient', { id: 'df-water-glow', cx: '50%', cy: '50%', r: '50%' },
            h('stop', { offset: '0%', stopColor: 'currentColor', stopOpacity: 0.18 }),
            h('stop', { offset: '100%', stopColor: 'currentColor', stopOpacity: 0 }),
          ),
        ),
        h('rect', { x: 0, y: 0, width: 1000, height: 560, className: 'df-floor' }),
        h('rect', { x: 0, y: 0, width: 1000, height: 560, className: 'df-floor-pattern' }),
        h('path', { d: 'M0 520 Q160 500 320 520 T640 520 T1000 520 V560 H0 Z', className: 'df-water-bottom' }),
        EDGES.map((edge) => h(Edge, {
          key: edge.id,
          edge,
          display,
          playing: playback.playing,
          stepMode,
          view,
        })),
        WORKSHOP_IDS.map((id) => h(Station, {
          key: id,
          node: { ...NODES[id], id },
          view,
          display,
          playing: playback.playing,
          stepMode,
          selected: selected === id,
          onSelect: setSelected,
          theme,
        })),
        h(Station, { node: { ...NODES.intake, id: 'intake' }, view, display, playing: playback.playing, stepMode, selected: selected === 'intake', onSelect: setSelected, theme }),
        h(Station, { node: { ...NODES.exit, id: 'exit' }, view, display, playing: playback.playing, stepMode, selected: selected === 'exit', onSelect: setSelected, theme }),
        h(MaterialBox, { display, view, theme, active }),
      ),
      display?.workshop === 'skill' && active
        ? h(SkillScan, { libraryValue, skill, theme })
        : null,
      display?.workshop === 'tools' && active
        ? h(ToolExchange, { tool, theme })
        : null,
      display?.workshop === 'route' && active
        ? h(RouteGate, { route, theme })
        : null,
      selected !== null
        ? h(StationDetails, { nodeId: selected, view, libraryValue, onClose: () => setSelected(null), theme })
        : null,
    ),
    h('div', { className: 'df-footer' },
      h('div', { className: 'df-visited' },
        h('span', { className: 'df-visited-label' }, '本轮路线'),
        visited.length === 0
          ? h('span', { className: 'df-visited-empty' }, '等待第一个真实事件')
          : visited.map((id) => h('span', { key: id, className: 'df-visited-chip' }, NODES[id]?.name ?? id)),
      ),
      h('div', { className: 'df-legend' },
        h('span', null, h('i', { className: 'df-dot df-dot-run' }), '处理中'),
        h('span', null, h('i', { className: 'df-dot df-dot-done' }), '已走过'),
        h('span', null, h('i', { className: 'df-dot df-dot-skip' }), '跳过'),
        h('span', null, h('i', { className: 'df-dot df-dot-error' }), '失败回环'),
      ),
    ),
    view === undefined || view === null
      ? h('div', { className: 'df-empty-banner' }, '尚未收到 factoryTrail 投影：host 插件可能未加载，或本会话还没有事件。')
      : null,
  )
}

/* ------------------------------------------------------------------ */
/* Slots                                                               */
/* ------------------------------------------------------------------ */

function useFactoryView(props) {
  const useProjection = props.useProjection
  const useSession = props.useSession
  const view = typeof useProjection === 'function' ? useProjection('factoryTrail') : undefined
  const liveRunning = typeof useSession === 'function' ? useSession((snapshot) => snapshot.running) : undefined
  return { view, liveRunning }
}

function FactoryView(props) {
  const { view, liveRunning } = useFactoryView(props)
  const [theme, setTheme] = useTheme()
  const [speed, setSpeed] = useState(() => (readLocal(SPEED_KEY, '1') === '0.5' ? 0.5 : 1))
  const [stepMode, setStepMode] = useState(false)
  const libraryValue = useLibraries(props.sessionId)
  useEffect(() => {
    writeLocal(SPEED_KEY, String(speed))
  }, [speed])
  return h('div', { className: 'df-view' },
    h(FactoryBoard, {
      view,
      liveRunning,
      theme,
      setTheme,
      speed,
      setSpeed,
      stepMode,
      setStepMode,
      compact: false,
      libraryValue,
    }),
  )
}

function FactoryStrip(props) {
  const { view, liveRunning } = useFactoryView(props)
  const [theme, setTheme] = useTheme()
  const [speed, setSpeed] = useState(() => (readLocal(SPEED_KEY, '1') === '0.5' ? 0.5 : 1))
  const [stepMode, setStepMode] = useState(false)
  const [open, setOpen] = useState(false)
  const libraryValue = useLibraries(props.sessionId)
  useEffect(() => {
    writeLocal(SPEED_KEY, String(speed))
  }, [speed])

  const running = view?.running === true && liveRunning !== false
  const current = view?.current
  const display = current === null || current === undefined ? null : toDisplay({ ...current, kind: '', seq: view?.seq ?? -1, time: current.at, status: '' })
  const label = view === undefined || view === null
    ? '等待投影'
    : running
      ? `运行中 · ${current?.label ?? '处理中'}`
      : view.phase === 'done'
        ? '本轮完成 · 箱子已出货'
        : '空闲 · 箱子停在当前站'
  return h('div', { className: `df-strip df-theme-${theme} ${open ? 'df-strip-open' : ''}` },
    h('button', {
      type: 'button',
      className: 'df-strip-head',
      onClick: () => setOpen((value) => !value),
      'aria-expanded': open,
      'aria-label': open ? '收起工厂蓝图' : '展开工厂蓝图',
    },
      h('span', { className: 'df-strip-mark' }, '▦'),
      h('span', { className: 'df-strip-title' }, '工厂'),
      h('span', { className: `df-strip-dot ${running ? 'df-run' : ''}` }),
      h('span', { className: 'df-strip-label' }, label),
      h('span', { className: 'df-strip-mini' },
        WORKSHOP_IDS.map((id) => h('span', {
          key: id,
          className: `df-mini ${display?.workshop === id ? 'df-mini-on' : ''} ${view?.perTurn?.skipped?.includes(id) ? 'df-mini-skip' : ''}`,
          title: NODES[id].name,
        })),
      ),
      h('span', { className: 'df-strip-chev' }, open ? '▾' : '▸'),
    ),
    open
      ? h('div', { className: 'df-strip-body' },
          h(FactoryBoard, {
            view,
            liveRunning,
            theme,
            setTheme,
            speed,
            setSpeed,
            stepMode,
            setStepMode,
            compact: true,
            libraryValue,
          }),
        )
      : null,
  )
}

/* ------------------------------------------------------------------ */
/* Plugin entry                                                        */
/* ------------------------------------------------------------------ */

function installStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById('dsh-factory-style') !== null) return
  const style = document.createElement('style')
  style.id = 'dsh-factory-style'
  style.textContent = CSS
  document.head.appendChild(style)
}

function apply(ctx) {
  installStyle()
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'factory',
    order: 40,
    label: () => '工厂',
  }, (props) => h(FactoryView, props)))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'factory-strip',
    order: 50,
  }, (props) => h(FactoryStrip, props)))
}

exports.name = NS
exports.inject = ['slots']
exports.apply = apply

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
.df-root {
  --df-bg: var(--dsw-alias-bg-base, #141518);
  --df-panel: var(--dsw-specific-menu, #1c1f26);
  --df-panel-2: color-mix(in srgb, var(--dsw-specific-menu, #1c1f26) 82%, #000 18%);
  --df-line: color-mix(in srgb, var(--dsw-alias-label-primary, #eef1f7) 16%, transparent);
  --df-text: var(--dsw-alias-label-primary, #eef1f7);
  --df-muted: var(--dsw-alias-label-tertiary, #9aa3b2);
  --df-faint: color-mix(in srgb, var(--dsw-alias-label-tertiary, #9aa3b2) 60%, transparent);
  --df-accent: var(--dsw-alias-state-business-primary, #5b9dff);
  --df-green: #3ddc97;
  --df-amber: #f5b84b;
  --df-red: #ff6b6b;
  --df-radius: 10px;
  position: relative;
  color: var(--df-text);
  font-family: var(--dsw-font-family, Inter, system-ui, sans-serif);
  background: var(--df-bg);
  border: 1px solid var(--df-line);
  border-radius: var(--df-radius);
  overflow: hidden;
  box-sizing: border-box;
}
.df-root * { box-sizing: border-box; }
.df-theme-pixel { --df-accent: #f3b34b; --df-green: #6ee7a8; --df-amber: #ffd166; }
.df-theme-water { --df-accent: #54c8ff; --df-green: #43e0c4; --df-amber: #7dd3fc; }

.df-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--df-line);
  background: var(--df-panel);
  flex-wrap: wrap;
}
.df-brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
.df-brand-mark {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px;
  background: color-mix(in srgb, var(--df-accent) 18%, transparent);
  color: var(--df-accent); font-size: 17px; flex: none;
}
.df-brand-title { font-size: 13px; font-weight: 700; line-height: 1.2; }
.df-brand-sub { font-size: 10px; color: var(--df-muted); line-height: 1.3; }
.df-status-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.df-pill {
  font-size: 10px; line-height: 18px; padding: 0 7px; border-radius: 999px;
  border: 1px solid var(--df-line); color: var(--df-muted); white-space: nowrap;
}
.df-pill-run { color: var(--df-green); border-color: color-mix(in srgb, var(--df-green) 46%, transparent); background: color-mix(in srgb, var(--df-green) 10%, transparent); }
.df-pill-live { color: var(--df-accent); border-color: color-mix(in srgb, var(--df-accent) 46%, transparent); }
.df-controls { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.df-seg { display: inline-flex; border: 1px solid var(--df-line); border-radius: 7px; overflow: hidden; }
.df-seg button, .df-ctl {
  appearance: none; border: 0; background: transparent; color: var(--df-muted);
  font: inherit; font-size: 11px; line-height: 24px; padding: 0 9px; cursor: pointer;
}
.df-seg button + button { border-left: 1px solid var(--df-line); }
.df-seg button:hover, .df-ctl:hover { color: var(--df-text); background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.06)); }
.df-seg-on { color: var(--df-accent) !important; background: color-mix(in srgb, var(--df-accent) 13%, transparent) !important; font-weight: 600; }
.df-ctl { border: 1px solid var(--df-line); border-radius: 7px; }
.df-ctl:disabled { opacity: .4; cursor: default; }

.df-board { position: relative; aspect-ratio: 1000 / 560; background: var(--df-bg); overflow: hidden; }
.df-svg { display: block; width: 100%; height: 100%; color: var(--df-muted); }
.df-floor { fill: var(--df-bg); }
.df-floor-pattern { fill: url(#df-grid); }
.df-theme-water .df-floor-pattern { fill: url(#df-bubbles); }
.df-theme-water .df-water-bottom { fill: color-mix(in srgb, var(--df-accent) 9%, transparent); }
.df-theme-pixel .df-water-bottom { display: none; }

/* Pixel skin */
.df-roof { fill: #3b2a20; stroke: #1c1612; stroke-width: 2; }
.df-building { fill: #2a211b; stroke: #6b4a32; stroke-width: 2; }
.df-window { fill: #f3b34b; opacity: .75; }
.df-chimney { fill: #3b2a20; stroke: #1c1612; stroke-width: 2; }
.df-belt { fill: #1b1512; stroke: #5b3e2b; stroke-width: 1.5; }
.df-smoke circle { fill: #a7b0c0; opacity: .2; animation: df-smoke 1.8s ease-out infinite; }
.df-smoke circle:nth-child(2) { animation-delay: .45s; }
.df-smoke circle:nth-child(3) { animation-delay: .9s; }
.df-theme-pixel .df-tank, .df-theme-pixel .df-water-fill, .df-theme-pixel .df-valve, .df-theme-pixel .df-valve-line, .df-theme-pixel .df-bubble, .df-theme-pixel .df-turbine-ring, .df-theme-pixel .df-turbine-water { display: none; }
.df-theme-water .df-roof, .df-theme-water .df-building, .df-theme-water .df-window, .df-theme-water .df-chimney, .df-theme-water .df-belt, .df-theme-water .df-smoke { display: none; }

/* Water skin */
.df-tank { fill: color-mix(in srgb, var(--df-accent) 12%, var(--df-panel)); stroke: color-mix(in srgb, var(--df-accent) 60%, #fff 6%); stroke-width: 2; }
.df-water-fill { fill: color-mix(in srgb, var(--df-accent) 24%, transparent); }
.df-bubble { fill: color-mix(in srgb, var(--df-accent) 55%, #fff); opacity: .5; animation: df-bubble 2.8s ease-in-out infinite; }
.df-bubble-b { animation-delay: .7s; }
.df-bubble-c { animation-delay: 1.3s; }
.df-valve { fill: var(--df-panel); stroke: var(--df-accent); stroke-width: 2; }
.df-valve-line { stroke: var(--df-accent); stroke-width: 2; }
.df-turbine-ring { fill: none; stroke: var(--df-accent); stroke-width: 2; opacity: .55; }
.df-turbine-water { fill: none; stroke: var(--df-accent); stroke-width: 3; opacity: .35; }

/* Stations */
.df-station { color: var(--df-muted); }
.df-station-name { fill: var(--df-text); font-size: 13px; font-weight: 650; }
.df-station-sub { fill: var(--df-muted); font-size: 9.5px; }
.df-station-count { fill: var(--df-faint); font-size: 9px; }
.df-station-icon { color: var(--df-accent); opacity: .9; }
.df-station:hover .df-building, .df-station:hover .df-tank { stroke: var(--df-accent); }
.df-station.df-active .df-building, .df-station.df-active .df-tank { stroke: var(--df-accent); filter: drop-shadow(0 0 6px color-mix(in srgb, var(--df-accent) 65%, transparent)); }
.df-station.df-selected .df-building, .df-station.df-selected .df-tank { stroke: #fff; stroke-width: 2.6; }
.df-station.df-skipped { opacity: .48; }
.df-station.df-error .df-building, .df-station.df-error .df-tank { stroke: var(--df-red); }
.df-check { fill: var(--df-green); font-size: 14px; font-weight: 800; }
.df-skip-badge { fill: var(--df-amber); font-size: 9px; font-weight: 700; letter-spacing: .06em; }
.df-skip-mark line { stroke: var(--df-amber); stroke-width: 1.5; stroke-dasharray: 4 4; }
.df-skip-text { fill: var(--df-amber); font-size: 8px; letter-spacing: .08em; }
.df-error-ring { fill: none; stroke: var(--df-red); stroke-width: 2; stroke-dasharray: 5 4; animation: df-error-pulse 1.2s linear infinite; }

/* Edges */
.df-edge-hit { fill: none; stroke: transparent; stroke-width: 12; }
.df-edge-line { fill: none; stroke: color-mix(in srgb, var(--df-muted) 25%, transparent); stroke-width: 1.6; stroke-linecap: round; }
.df-edge-main .df-edge-line { stroke-width: 2.2; stroke: color-mix(in srgb, var(--df-muted) 40%, transparent); }
.df-edge-dashed .df-edge-line { stroke-dasharray: 5 5; }
.df-edge-flow { fill: none; stroke: transparent; stroke-width: 3; stroke-linecap: round; }
.df-edge-active .df-edge-line { stroke: var(--df-accent); }
.df-edge-active .df-edge-flow { stroke: var(--df-accent); stroke-dasharray: 7 11; animation: df-flow .6s linear infinite; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--df-accent) 60%, transparent)); }
.df-edge-error .df-edge-line { stroke: var(--df-red); stroke-dasharray: 3 4; }
.df-edge-error .df-edge-flow { stroke: var(--df-red); stroke-width: 4; stroke-dasharray: 2 9; animation: df-flow .8s linear infinite; }
.df-edge-skip .df-edge-line { stroke: var(--df-amber); stroke-dasharray: 6 6; }
.df-edge-label { fill: var(--df-faint); font-size: 8px; letter-spacing: .04em; }
.df-theme-water .df-edge-line { stroke-width: 5; stroke-linecap: round; stroke: color-mix(in srgb, var(--df-accent) 22%, transparent); }
.df-theme-water .df-edge-flow { stroke-width: 2; }
.df-theme-water .df-edge-main .df-edge-line { stroke-width: 7; }
.df-theme-water .df-edge-label { fill: color-mix(in srgb, var(--df-accent) 55%, var(--df-muted)); }

/* Model gears / sparks */
.df-gear { color: var(--df-accent); opacity: .8; }
.df-active .df-gear-a { animation: df-spin 2.4s linear infinite; }
.df-active .df-gear-b { animation: df-spin-rev 1.8s linear infinite; }
.df-sparks line, .df-sparks circle { stroke: var(--df-amber); stroke-width: 2; fill: var(--df-amber); opacity: 0; animation: df-spark 1s ease-out infinite; }
.df-sparks line:nth-child(2) { animation-delay: .25s; }
.df-sparks line:nth-child(3) { animation-delay: .55s; }
.df-sparks circle:nth-child(2) { animation-delay: .3s; }
.df-sparks circle:nth-child(3) { animation-delay: .6s; }

/* Material box */
.df-box { transition: transform .55s cubic-bezier(.4,0,.2,1); }
.df-box-animate { will-change: transform; }
.df-pixel-box { fill: #b9793f; stroke: #4a2a12; stroke-width: 2.4; }
.df-water-box { fill: color-mix(in srgb, #5cc8ff 72%, #1b4f72); stroke: #1a5c8a; stroke-width: 2.2; filter: drop-shadow(0 2px 4px rgba(0,0,0,.3)); }
.df-box-tape { fill: #e8d7a8; opacity: .9; }
.df-box-window { fill: #f3b34b; opacity: .65; }
.df-box-bubble { fill: #d8f4ff; opacity: .7; }
.df-box-bubble-b { opacity: .45; }
.df-pixel-flap { fill: #8a5527; stroke: #4a2a12; stroke-width: 1.6; }
.df-water-flap { fill: color-mix(in srgb, #5cc8ff 55%, #fff); stroke: #1a5c8a; stroke-width: 1.4; opacity: .9; }
.df-box-paper { fill: #f4efe2; stroke: #9b8a6b; stroke-width: 1; }
.df-box-port { fill: #1b1f27; stroke: var(--df-accent); stroke-width: 2; }
.df-box-caption { fill: var(--df-muted); font-size: 8.5px; letter-spacing: .03em; }
.df-box-glow { fill: none; stroke: var(--df-glow, var(--df-accent)); stroke-width: 2; opacity: .18; animation: df-glow 1.2s ease-in-out infinite; }
.df-sticker-bg { fill: #ffd166; stroke: #9a6b0a; stroke-width: 1; }
.df-sticker-text { fill: #3a2a05; font-size: 7.5px; font-weight: 700; }
.df-barcode line { stroke: #2b2117; stroke-width: 1.6; }
.df-stamp circle { fill: none; stroke: var(--df-green); stroke-width: 2; }
.df-stamp text { fill: var(--df-green); font-size: 7px; font-weight: 800; letter-spacing: .08em; }

/* Overlays */
.df-overlay {
  position: absolute; z-index: 3; border-radius: 10px; padding: 10px 12px;
  background: color-mix(in srgb, var(--df-panel) 94%, transparent);
  border: 1px solid color-mix(in srgb, var(--df-accent) 40%, var(--df-line));
  box-shadow: 0 12px 30px rgba(0,0,0,.32);
  backdrop-filter: blur(8px);
  color: var(--df-text);
}
.df-overlay-title { font-size: 10px; font-weight: 700; color: var(--df-accent); letter-spacing: .05em; margin-bottom: 6px; }
.df-skill-scan { left: 43%; top: 72%; transform: translate(-50%, -50%); width: 330px; }
.df-tool-window { left: 62%; top: 55%; transform: translate(-50%, -50%); width: 330px; }
.df-route-gate { left: 61%; top: 30%; transform: translate(-50%, -50%); width: 280px; }
.df-skill-beam {
  position: absolute; left: 12px; right: 12px; height: 2px; top: 30px;
  background: linear-gradient(90deg, transparent, var(--df-accent), transparent);
  animation: df-beam 1.4s ease-in-out infinite;
}
.df-skill-shelf { display: flex; flex-direction: column; gap: 5px; position: relative; z-index: 1; }
.df-skill-lib {
  display: flex; align-items: center; gap: 8px; padding: 4px 7px; border-radius: 6px;
  border: 1px solid var(--df-line); background: color-mix(in srgb, var(--df-bg) 70%, transparent);
  font-size: 10px; animation: df-lib-scan 1.4s ease-in-out both;
}
.df-skill-lib.df-hit { border-color: #ffd166; background: color-mix(in srgb, #ffd166 14%, transparent); box-shadow: 0 0 0 1px #ffd166 inset; }
.df-skill-lib.df-placeholder { opacity: .45; }
.df-skill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--df-muted); flex: none; }
.df-skill-lib.df-hit .df-skill-dot { background: #ffd166; box-shadow: 0 0 8px #ffd166; }
.df-skill-lib-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-skill-lib-count { color: var(--df-muted); font-size: 9px; flex: none; }
.df-skill-book {
  position: absolute; right: 20px; top: -26px; width: 34px; height: 26px;
  transform: translateY(10px) scale(.7); opacity: 0; animation: df-book-out 1.6s ease-out forwards;
}
.df-book-cover { position: absolute; inset: 0; border-radius: 3px 6px 6px 3px; background: #c05a3e; border: 1px solid #6d2d1c; }
.df-book-page { position: absolute; right: 2px; top: 3px; width: 14px; height: 20px; background: #f7f1df; border: 1px solid #b9a98a; transform-origin: left center; animation: df-page 1.5s ease-in-out infinite; }
.df-book-page-b { animation-delay: .18s; }
.df-skill-sticker {
  margin-top: 7px; display: inline-flex; align-items: center; gap: 5px;
  background: #ffd166; color: #3a2a05; font-size: 10px; font-weight: 800;
  padding: 3px 8px; border-radius: 3px; transform: rotate(-2deg);
  animation: df-sticker-in .5s .9s ease-out both;
}
.df-skill-sticker-pin { width: 5px; height: 5px; border-radius: 50%; background: #b4790b; }
.df-window-bar { display: flex; align-items: center; gap: 4px; padding-bottom: 6px; border-bottom: 1px solid var(--df-line); margin-bottom: 6px; }
.df-window-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--df-muted); opacity: .5; }
.df-window-title { margin-left: auto; font-size: 9px; color: var(--df-accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.df-window-endpoint { font-size: 11px; font-weight: 700; color: var(--df-text); margin-bottom: 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.df-window-row { display: flex; gap: 6px; align-items: baseline; font-size: 9.5px; color: var(--df-muted); margin: 3px 0; min-width: 0; }
.df-window-row code { font-size: 9px; color: var(--df-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-window-arrow { flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; }
.df-window-arrow.df-req { color: var(--df-accent); }
.df-window-arrow.df-res { color: var(--df-green); }
.df-window-wire { position: relative; height: 8px; margin-top: 5px; }
.df-wire-in, .df-wire-out { position: absolute; top: 3px; width: 8px; height: 2px; background: var(--df-accent); animation: df-wire-in 1.2s linear infinite; }
.df-wire-out { background: var(--df-green); animation: df-wire-out 1.2s .5s linear infinite; }
.df-fork { position: relative; height: 46px; margin: 4px 0 6px; }
.df-fork-trunk { position: absolute; left: 50%; top: 0; bottom: 50%; width: 3px; background: var(--df-line); transform: translateX(-50%); }
.df-fork-branch { position: absolute; top: 50%; width: 44%; height: 3px; background: var(--df-line); border-radius: 3px; }
.df-fork-a { left: 0; transform: rotate(-18deg); transform-origin: right center; }
.df-fork-b { right: 0; transform: rotate(18deg); transform-origin: left center; }
.df-fork-branch.df-branch-on { background: var(--df-accent); box-shadow: 0 0 8px color-mix(in srgb, var(--df-accent) 60%, transparent); }
.df-gate { position: absolute; left: 50%; top: 38%; width: 14px; height: 22px; background: var(--df-panel-2); border: 2px solid var(--df-amber); transform: translate(-50%, -50%); border-radius: 2px; }
.df-gate.df-gate-open { transform: translate(-50%, -50%) rotate(38deg); border-color: var(--df-green); }
.df-route-decision { font-size: 13px; font-weight: 800; color: var(--df-accent); }
.df-route-detail { font-size: 9.5px; color: var(--df-muted); margin-top: 2px; }

/* Details */
.df-details {
  position: absolute; z-index: 5; right: 10px; top: 10px; width: 326px; max-height: calc(100% - 20px);
  overflow: auto; background: color-mix(in srgb, var(--df-panel) 96%, transparent);
  border: 1px solid var(--df-line); border-radius: 10px; box-shadow: 0 16px 40px rgba(0,0,0,.4);
  padding: 12px; font-size: 11px;
}
.df-details-head { display: flex; align-items: flex-start; gap: 8px; }
.df-details-title { font-size: 14px; font-weight: 800; }
.df-details-sub { font-size: 10px; color: var(--df-muted); }
.df-close { margin-left: auto; appearance: none; border: 1px solid var(--df-line); background: transparent; color: var(--df-muted); width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 16px; line-height: 1; }
.df-close:hover { color: var(--df-text); }
.df-details-duty { margin: 8px 0; color: var(--df-muted); line-height: 1.55; }
.df-metrics { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.df-metric { flex: 1; min-width: 74px; border: 1px solid var(--df-line); border-radius: 7px; padding: 5px 7px; background: color-mix(in srgb, var(--df-bg) 55%, transparent); }
.df-metric b { display: block; font-size: 15px; }
.df-metric span { font-size: 9px; color: var(--df-muted); }
.df-section { margin-top: 10px; }
.df-section-title { font-size: 9px; font-weight: 800; letter-spacing: .08em; color: var(--df-accent); text-transform: uppercase; margin-bottom: 4px; }
.df-empty { color: var(--df-muted); line-height: 1.5; margin: 4px 0; }
.df-event-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.df-event-list li { display: grid; grid-template-columns: 38px 1fr; gap: 2px 6px; padding: 3px 0; border-bottom: 1px solid color-mix(in srgb, var(--df-line) 55%, transparent); }
.df-event-time { color: var(--df-faint); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; }
.df-event-time.error { color: var(--df-red); }
.df-event-label { color: var(--df-text); font-size: 10.5px; }
.df-event-detail { grid-column: 2; color: var(--df-muted); font-size: 9.5px; line-height: 1.4; }
.df-library-list { display: flex; flex-direction: column; gap: 3px; }
.df-library-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 6px; border: 1px solid var(--df-line); border-radius: 5px; font-size: 10px; }
.df-library-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-library-row b { color: var(--df-accent); }
.df-chip-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.df-chip { font-size: 9.5px; padding: 2px 6px; border-radius: 999px; border: 1px solid var(--df-line); }
.df-chip-skill { color: #ffd166; border-color: color-mix(in srgb, #ffd166 50%, transparent); background: color-mix(in srgb, #ffd166 10%, transparent); }
.df-tool-list, .df-file-list, .df-sub-list, .df-config-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.df-tool-list li { display: flex; gap: 6px; align-items: flex-start; }
.df-tool-status { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--df-line); display: grid; place-items: center; font-size: 9px; flex: none; }
.df-tool-status.done { color: var(--df-green); border-color: var(--df-green); }
.df-tool-status.error { color: var(--df-red); border-color: var(--df-red); }
.df-tool-status.running { color: var(--df-amber); border-color: var(--df-amber); }
.df-tool-name { font-size: 10px; color: var(--df-text); overflow-wrap: anywhere; }
.df-tool-meta { font-size: 9px; color: var(--df-muted); }
.df-route-pill { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--df-line); }
.df-route-route { color: var(--df-accent); border-color: var(--df-accent); }
.df-route-hit { color: var(--df-green); border-color: var(--df-green); }
.df-route-miss { color: var(--df-amber); border-color: var(--df-amber); }
.df-route-single { color: var(--df-muted); }
.df-route-detail { color: var(--df-muted); font-size: 9.5px; margin: 4px 0; }
.df-sub-list li { display: flex; flex-direction: column; padding: 3px 0; border-bottom: 1px solid color-mix(in srgb, var(--df-line) 55%, transparent); }
.df-sub-list b { font-size: 10px; }
.df-sub-list span { font-size: 9px; color: var(--df-muted); }
.df-kv { display: grid; grid-template-columns: 82px 1fr; gap: 3px 6px; font-size: 10px; }
.df-kv span { color: var(--df-muted); }
.df-kv b { font-weight: 500; color: var(--df-text); overflow-wrap: anywhere; }
.df-file-list li { display: flex; gap: 6px; align-items: baseline; }
.df-file-op { color: var(--df-accent); font-size: 9px; flex: none; }
.df-file-list code { font-size: 9px; color: var(--df-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-config-list li { display: flex; flex-direction: column; padding: 3px 0; border-bottom: 1px solid color-mix(in srgb, var(--df-line) 55%, transparent); }
.df-config-list b { font-size: 10px; font-weight: 600; }
.df-config-list span { font-size: 9px; color: var(--df-muted); overflow-wrap: anywhere; }
.df-details-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; color: var(--df-faint); font-size: 8.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

/* Footer / strip / empty */
.df-footer { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-top: 1px solid var(--df-line); background: var(--df-panel); flex-wrap: wrap; }
.df-visited { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; }
.df-visited-label { font-size: 9px; color: var(--df-muted); }
.df-visited-empty { font-size: 9px; color: var(--df-faint); }
.df-visited-chip { font-size: 9px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--df-line); color: var(--df-text); }
.df-visited-chip + .df-visited-chip::before { content: '→'; color: var(--df-faint); margin-right: 4px; }
.df-legend { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.df-legend span { display: inline-flex; align-items: center; gap: 3px; font-size: 8.5px; color: var(--df-muted); }
.df-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.df-dot-run { background: var(--df-accent); box-shadow: 0 0 6px var(--df-accent); }
.df-dot-done { background: var(--df-green); }
.df-dot-skip { background: var(--df-amber); }
.df-dot-error { background: var(--df-red); }
.df-empty-banner { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); z-index: 4; max-width: 420px; text-align: center; font-size: 11px; line-height: 1.6; color: var(--df-muted); background: color-mix(in srgb, var(--df-panel) 92%, transparent); border: 1px solid var(--df-line); border-radius: 9px; padding: 10px 14px; }

.df-view { height: 100%; overflow: auto; padding: 14px; background: var(--dsw-alias-bg-base, #141518); }
.df-view .df-root { max-width: 1160px; margin: 0 auto; }

.df-strip { width: 100%; max-width: var(--dsh-composer-card-max-width, 920px); margin: 0 auto 4px; border: 1px solid var(--df-line); border-radius: 9px; background: var(--df-panel); overflow: hidden; color: var(--df-text); font-family: var(--dsw-font-family, Inter, system-ui, sans-serif); }
.df-strip-head { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 30px; padding: 2px 9px; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; text-align: left; }
.df-strip-head:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.05)); }
.df-strip-mark { color: var(--df-accent); font-size: 15px; }
.df-strip-title { font-size: 12px; font-weight: 700; }
.df-strip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--df-muted); flex: none; }
.df-strip-dot.df-run { background: var(--df-green); box-shadow: 0 0 6px var(--df-green); animation: df-pulse 1.2s ease-in-out infinite; }
.df-strip-label { font-size: 10px; color: var(--df-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
.df-strip-mini { display: inline-flex; gap: 2px; flex: none; }
.df-mini { width: 6px; height: 6px; border-radius: 2px; background: color-mix(in srgb, var(--df-muted) 35%, transparent); }
.df-mini-on { background: var(--df-accent); box-shadow: 0 0 5px var(--df-accent); }
.df-mini-skip { background: var(--df-amber); }
.df-strip-chev { font-size: 10px; color: var(--df-muted); margin-left: 2px; }
.df-strip-body { border-top: 1px solid var(--df-line); max-height: 460px; overflow: auto; }
.df-strip-body .df-root { border: 0; border-radius: 0; }
.df-compact .df-toolbar { padding: 6px 8px; gap: 6px; }
.df-compact .df-brand-sub { display: none; }
.df-compact .df-footer { display: none; }
.df-compact .df-station-sub { display: none; }
.df-compact .df-station-count { display: none; }
.df-compact .df-details { width: 300px; }

/* Keyframes */
@keyframes df-flow { to { stroke-dashoffset: -18; } }
@keyframes df-spin { to { transform: rotate(360deg); } }
@keyframes df-spin-rev { to { transform: rotate(-360deg); } }
@keyframes df-pulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
@keyframes df-glow { 0%,100% { opacity: .1; transform: scale(.94); } 50% { opacity: .3; transform: scale(1.05); } }
@keyframes df-smoke { 0% { opacity: .18; transform: translate(0, 0) scale(.7); } 100% { opacity: 0; transform: translate(-4px, -18px) scale(1.5); } }
@keyframes df-bubble { 0%,100% { transform: translateY(0); opacity: .35; } 50% { transform: translateY(-4px); opacity: .7; } }
@keyframes df-spark { 0% { opacity: 0; transform: translate(0,0); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(8px,-8px); } }
@keyframes df-error-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes df-beam { 0% { transform: scaleX(0); transform-origin: left; opacity: 0; } 30% { opacity: 1; } 100% { transform: scaleX(1); transform-origin: left; opacity: 0; } }
@keyframes df-lib-scan { 0%,100% { border-color: var(--df-line); } 45% { border-color: var(--df-accent); } }
@keyframes df-book-out { 0% { opacity: 0; transform: translate(20px, 14px) scale(.6) rotate(-8deg); } 35% { opacity: 1; transform: translate(-8px, -10px) scale(1) rotate(-3deg); } 100% { opacity: 1; transform: translate(-8px, -22px) scale(1.05) rotate(-2deg); } }
@keyframes df-page { 0%,100% { transform: rotateY(0deg); } 50% { transform: rotateY(-55deg); } }
@keyframes df-sticker-in { 0% { opacity: 0; transform: translateY(-4px) scale(.85) rotate(-8deg); } 100% { opacity: 1; transform: translateY(0) scale(1) rotate(-2deg); } }
@keyframes df-wire-in { 0% { left: 0; opacity: 0; } 30% { opacity: 1; } 100% { left: 100%; opacity: 0; } }
@keyframes df-wire-out { 0% { right: 0; opacity: 0; } 30% { opacity: 1; } 100% { right: 100%; opacity: 0; } }

@media (max-width: 720px) {
  .df-details { position: static; width: auto; max-height: none; margin: 8px; }
  .df-skill-scan, .df-tool-window, .df-route-gate { width: 260px; }
  .df-controls { width: 100%; margin-left: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .df-root *, .df-root *::before, .df-root *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
}
`
