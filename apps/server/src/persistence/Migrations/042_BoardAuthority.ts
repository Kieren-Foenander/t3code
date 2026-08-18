import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE projection_board_authority (
      project_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_sequence INTEGER NOT NULL
    )
  `;
});
