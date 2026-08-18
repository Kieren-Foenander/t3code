import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE board_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX idx_board_events_project_sequence
    ON board_events(project_id, sequence)
  `;
  yield* sql`
    CREATE TABLE board_command_receipts (
      command_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      last_sequence INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE projection_board_objects (
      object_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      object_kind TEXT NOT NULL,
      thread_id TEXT,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_sequence INTEGER NOT NULL
    )
  `;
  yield* sql`
    CREATE UNIQUE INDEX idx_board_thread_frame
    ON projection_board_objects(project_id, thread_id)
    WHERE object_kind = 'thread-frame' AND thread_id IS NOT NULL
  `;
  yield* sql`
    CREATE INDEX idx_board_objects_project_sequence
    ON projection_board_objects(project_id, updated_sequence)
  `;

  yield* sql`
    CREATE TABLE projection_board_relationships (
      relationship_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_sequence INTEGER NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE projection_board_grants (
      project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      object_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY(project_id, thread_id, object_id)
    )
  `;
});
