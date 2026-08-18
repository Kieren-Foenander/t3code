# Project board architecture

> For maintainers. Using T3 Code? See [Project boards](../user/project-board.md).

The project board is a server-owned, event-backed aggregate keyed by project. Its contract lives in
`packages/contracts/src/board.ts`; web and mobile subscribe through the shared Atom runtime in
`packages/client-runtime/src/state/board.ts`. Camera, zoom, selection, and follow state remain local
to each client.

Board commands are idempotent by command id. `BoardService` serializes dispatch, decides events from
current projections, and writes events, projections, and the receipt in one SQL transaction.
Subscribers receive ordered deltas after commit and reconnect from their last sequence. A
`board.batch` evaluates each semantic operation against the state produced by the previous one; a
validation or revision conflict rolls back the whole batch.

Agent-authored commands persist an operation preimage and compact activity in the same transaction.
`board.operation.undo` projects that preimage as new revisions and marks the activity undone. It
never calls checkpointing or a provider adapter. Project authority, operation preimages, and
activity projections were added in migrations 42 and 43.

Objects are thread frames, notes, file references, diagram shapes, or soft groups. Tombstones are
reversible. Relationships carry `spawned-from`, `context-shared-with`, `blocked-by`, or purely visual
`connector` meaning; none implicitly grants authority.

## Authority and providers

Projects persist independent `own` or `board` defaults for read scope and write authority. Explicit
`(project, thread, object)` read/edit grants act as per-thread overrides. The special `board:*`
object id represents visible, revocable whole-board authority and includes future objects. It never
grants control over sibling sessions. Thread-scoped reads omit inaccessible objects, relationships,
identifiers, and positions rather than returning placeholders. Mutation authorization runs again
while holding the dispatch mutex.

Every built-in provider receives the same board MCP capability through `ProviderService`. The board
toolkit exposes manifest, provider-context, lazy search/read, revision-checked mutation, atomic batch,
and full-board undo tools. Handler scope comes from the session credential, never from model-supplied
thread or project ids. The registry updates scope with the active turn and provider kind before tools
run, so activity attribution is not model-authored.

| Provider | Semantic board tools | Spatial context                |
| -------- | -------------------- | ------------------------------ |
| Codex    | Full toolkit         | SVG image tiles plus structure |
| Claude   | Full toolkit         | SVG image tiles plus structure |
| Cursor   | Full toolkit         | SVG image tiles plus structure |
| Grok     | Full toolkit         | Structure-only fallback        |
| OpenCode | Full toolkit         | Structure-only fallback        |

`board_context` considers only active object grants. Origin ownership, whole-board authority,
proximity, and ordinary connectors do not add ambient objects. Notes up to 2,000 characters are
included directly; other objects remain stable lazy references. Image-capable providers receive
1,200 × 800 spatial tiles with stable object ids, avoiding one microscopic board image.

## Rendering

The web canvas uses one translated and scaled world layer. Thread frames outside the viewport are
not mounted, and semantic zoom avoids mounting timelines and composers until close range. Static
edge indicators surface off-screen running work and artifact changes without continuously repainting.
Desktop inherits the web surface. Mobile uses the same snapshot in a touch-scroll supervisory view
and opens the canonical thread route for detailed work.

## Performance and connection budgets

The board has its own project-scoped snapshot/delta subscription and never adds board objects to
shell or thread detail snapshots. Shell rows expose at most three paths from the latest checkpoint
plus the total changed-file count for semantic summaries; full checkpoint lists remain in thread
detail. Focused tests hold a representative 500-object JSON snapshot below 512 KiB and a
single-object delta below 2 KiB. Viewport culling mounts fewer than 30 cards from the representative
400-frame layout; only close thread cards call the detail selector and mount a timeline.

Durable objects, grants, authority, activities, and operation receipts converge through ordered
sequences. Reconnect replays after the client's cursor; command ids deduplicate retries and expected
revisions reject unsafe concurrent writes. Subscription and MCP endpoints use relative/single-origin
routing, so local, relay, and tunnel connections do not bake in a host origin.
