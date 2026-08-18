# Project board architecture

> For maintainers. Using T3 Code? See [Project boards](../user/project-board.md).

The project board is a server-owned, event-backed aggregate keyed by project. Its contract lives in
`packages/contracts/src/board.ts`; web and mobile subscribe through the shared Atom runtime in
`packages/client-runtime/src/state/board.ts`. Presentation state such as camera position, zoom,
selection, and follow mode stays client-local.

Board commands are idempotent by command id. `BoardService` serializes dispatch, decides events from
the current projections, and writes events, projections, and the receipt in one SQL transaction.
Subscribers receive ordered deltas after commit and can reconnect from their last sequence. A
`board.batch` command evaluates each semantic operation against the state produced by the previous
operation, then commits all emitted events together. Any validation or revision conflict rolls back
the batch.

Objects are thread frames, notes, file references, diagram shapes, or soft groups. Tombstones are
reversible. Relationships carry meaning such as `spawned-from`, `context-shared-with`, `blocked-by`,
or a purely visual `connector`; they do not imply authority.

## Authority and providers

Grants are explicit `(project, thread, object)` records with read or edit access. The special
`board:*` object id represents revocable whole-board authority and includes future objects. The
thread-scoped service filters inaccessible objects and relationships out rather than returning
redacted placeholders. It also repeats authorization while holding the dispatch mutex so a stale
client snapshot cannot bypass a revoke.

Every built-in provider receives the same board MCP capability through `ProviderService`. The board
toolkit exposes a compact manifest, lazy search/read tools, revision-checked semantic mutations, and
an atomic batch tool. Handler scope comes from the session credential, never from model-supplied
thread or project ids. Provider-specific adapters therefore remain transport boundaries rather than
duplicating board policy.

## Rendering

The web canvas uses one translated and scaled world layer. Thread frames outside the viewport are
not mounted, and semantic zoom avoids mounting timelines and composers until close range. Static
edge indicators surface off-screen running work without a continuously repainting animation. The
desktop app inherits the web surface. Mobile uses the same synchronized snapshot in a simpler
touch-scroll overview and opens the canonical thread route for detailed work.
