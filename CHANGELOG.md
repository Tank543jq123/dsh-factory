# Changelog

## 0.1.0 — 2026-11-19

### Added

- `factoryTrail` session projection folding real DSH session events into a per-session factory read model.
- Two client slots: `conversation.view` (full factory tab) and `conversation.input.dock` (strip + modal).
- Isometric pseudo-3D scene: 7 workshops + intake/exit, conveyor belts, workers, pistons, gears, robot arm, crane, smoke, sparks, crates, barrels, tanks, pipes, trees, lamps, fences, flowers.
- Two skins: pixel factory / water pipes, sharing the same 2:1 isometric layout and event data.
- Real-event playback queue with 1× / 0.5× / single-step / skip / replay-turn.
- Skill 4-library scan overlay (real `ctx.skills.list()` data) with hit name and sticker.
- Tool window overlay showing real tool name / MCP endpoint / request / response / error.
- Route gate overlay showing single-turn / retrieval hit-miss / subagent route.
- Station detail panel: responsibility, per-turn real events, tool/skill/MCP/subagent names, data volume, config points.
- Host live route: `agent/pre-step` (and post-step after `next()`), `agent/request`, `agent/turn-stopping`, `session/event` tool/model marks; 12-entry history to survive short polling.
- `/api/dsh-factory/libraries` route reading real skill registry into 4 categories.
- Offline fold tests + live history test.
- Static screenshot and video capture scripts (CDP).
- `docs/aesthetic.md`, `docs/live-phase-log.txt`, `docs/screenshots/*`, `docs/dsh-factory-demo.mp4`.

### Changed

- Visual redesign after user feedback: 16-color low-saturation palette, wall-mounted plaques, safe right margin (scene 0.96 + 20px), +20% workers with carrying animation/footprints, simplified belt network with thin service lines and a bridge, title moved into the toolbar.
- Fixed `h` shadowing bugs in `Crate`, `BoxArt`, `WallPlaque`, and missing `Decor`/`Station` functions during refactors.
- Bumped projection `stateVersion` to 2 after fold semantics changed.

### Stopped

- 2D prototype services/timer: `dsh-factory.service` (3092), `dsh-pixel-factory.service` (3091), `dsh-pixel-report-once.timer` (08:30 push). Not deleted; stop + disable only.
