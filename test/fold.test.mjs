import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __test } from '../src/host.js'

const { initialState, fold, isStorageTool, isSubagentTool, isSkillTool, parseArgs, markLive, LIVE } = __test

function event(type, seq, time, data) {
  return { type, seq, time, data }
}

test('turn/start opens a run and parks the box at intake', () => {
  let state = initialState({ id: 's1' })
  state = fold(state, event('turn/start', 0, 1000, { turn: 1 }))
  assert.equal(state.running, true)
  assert.equal(state.turn, 1)
  assert.equal(state.current.workshop, 'intake')
  assert.equal(state.perTurn.counts.intake, 1)
})

test('assembly and model events light the right workshops', () => {
  let state = initialState({ id: 's1' })
  state = fold(state, event('turn/start', 0, 1000, { turn: 1 }))
  state = fold(state, event('step/start', 1, 1100, { turn: 1, step: 1 }))
  assert.equal(state.current.workshop, 'assembly')
  state = fold(state, event('system/message', 2, 1200, { message: { role: 'system', content: [{ type: 'text', text: 'hello' }] } }))
  assert.equal(state.perTurn.counts.assembly, 2)
  state = fold(state, event('request/header', 3, 1300, { header: { config: { provider: 'p', model: 'm' }, tools: [{ name: 'bash' }] } }))
  state = fold(state, event('request/context', 4, 1400, { provider: 'p', model: 'm', contextWindow: 1000 }))
  assert.equal(state.current.workshop, 'model')
  assert.equal(state.model.model, 'm')
})

test('tool call/result marks a tool running then done', () => {
  let state = initialState({ id: 's1' })
  state = fold(state, event('turn/start', 0, 1000, { turn: 1 }))
  state = fold(state, event('tool/call', 1, 2000, { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' }))
  assert.equal(state.tools.length, 1)
  assert.equal(state.tools[0].status, 'running')
  assert.equal(state.perTurn.counts.tools, 1)
  state = fold(state, event('tool/result', 2, 2600, {
    message: { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'ok' }] },
  }))
  assert.equal(state.tools[0].status, 'done')
  assert.equal(state.tools[0].ms, 600)
  assert.equal(state.tools[0].chars, 2)
})

test('mcp tools expose their server and count separately', () => {
  let state = initialState({ id: 's1' })
  state = fold(state, event('turn/start', 0, 1000, { turn: 1 }))
  state = fold(state, event('tool/call', 1, 2000, {
    turn: 1, step: 1, callId: 'c1', name: 'mcp__github__create_issue', arguments: '{"title":"x"}',
  }))
  assert.equal(state.tools[0].mcp, true)
  assert.equal(state.tools[0].server, 'github')
  assert.equal(state.counts.mcp, 1)
  assert.equal(state.current.workshop, 'tools')
})

test('skill invocation lands in the skill workshop with its name', () => {
  let state = initialState({ id: 's1' })
  state = fold(state, event('turn/start', 0, 1000, { turn: 1 }))
  state = fold(state, event('developer/message', 1, 1100, {
    turn: 1, step: 1, message: { role: 'developer', source: { kind: 'skill-invocation', name: 'html-report', form: 'instructions' }, content: [{ type: 'text', text: 'body' }] },
  }))
  assert.equal(state.current.workshop, 'skill')
  assert.equal(state.skills.at(-1).name, 'html-report')
  assert.equal(state.counts.skills, 1)
})

test('subagent catalog lands in the route workshop', () => {
  let state = initialState({ id: 's1' })
  state = fold(state, event('turn/start', 0, 1000, { turn: 1 }))
  state = fold(state, event('subagent/catalog', 1, 1100, { childId: 'child-1', childCreatedAt: 1100, version: 2, mode: 'continuable', label: 'research' }))
  assert.equal(state.current.workshop, 'route')
  assert.equal(state.subagents[0].id, 'child-1')
  assert.equal(state.counts.subagents, 1)
})

test('turn/end computes skipped workshops and parks at exit', () => {
  let state = initialState({ id: 's1' })
  state = fold(state, event('turn/start', 0, 1000, { turn: 1 }))
  state = fold(state, event('step/start', 1, 1100, { turn: 1, step: 1 }))
  state = fold(state, event('turn/end', 2, 2000, { turn: 1, reason: 'completed' }))
  assert.equal(state.running, false)
  assert.equal(state.current, null)
  assert.ok(state.perTurn.skipped.includes('skill'))
  assert.ok(state.perTurn.skipped.includes('tools'))
  assert.ok(state.perTurn.skipped.includes('route'))
  assert.ok(!state.perTurn.skipped.includes('assembly'))
})

test('tool classifiers stay narrow', () => {
  assert.equal(isStorageTool('read_file'), true)
  assert.equal(isStorageTool('bash'), false)
  assert.equal(isSubagentTool('subagent'), true)
  assert.equal(isSkillTool('skill'), true)
  assert.equal(isSkillTool('skills_list'), false)
  assert.deepEqual(parseArgs('{"a":1}'), { a: 1 })
  assert.deepEqual(parseArgs('not json'), {})
})


test('live phase history keeps pre-step and post-step marks', () => {
  LIVE.clear()
  const agent = { id: 'session-live' }
  markLive(agent, 'pre-step', 'pre-step：装配第 1 步', { turn: 1, step: 1 })
  markLive(agent, 'post-step', 'post-step：第 1 步装配完成', { turn: 1, step: 1 })
  markLive(agent, 'model-request', 'agent/request：第 1 步请求模型', { turn: 1, step: 1 })
  const record = LIVE.get('session-live')
  assert.equal(record.phase, 'model-request')
  assert.deepEqual(record.history.map((entry) => entry.phase), ['pre-step', 'post-step', 'model-request'])
  LIVE.clear()
})
