import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * A board command may emit several events (for example, ensuring frames for
 * every thread). Idempotency belongs to board_command_receipts, so command_id
 * must not be unique in the event log itself.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE board_events_without_command_unique (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `;
  yield* sql`
    INSERT INTO board_events_without_command_unique (
      sequence, project_id, command_id, event_type, payload_json, occurred_at
    )
    SELECT sequence, project_id, command_id, event_type, payload_json, occurred_at
    FROM board_events
    ORDER BY sequence
  `;
  yield* sql`DROP TABLE board_events`;
  yield* sql`ALTER TABLE board_events_without_command_unique RENAME TO board_events`;
  yield* sql`
    CREATE INDEX idx_board_events_project_sequence
    ON board_events(project_id, sequence)
  `;
});
