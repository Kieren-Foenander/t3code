import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE board_operations (
      operation_id TEXT PRIMARY KEY,
      command_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      preimage_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      undone_at TEXT
    )
  `;
  yield* sql`
    CREATE TABLE projection_board_activities (
      operation_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_sequence INTEGER NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX idx_board_activities_project_sequence
    ON projection_board_activities(project_id, updated_sequence)
  `;
});
