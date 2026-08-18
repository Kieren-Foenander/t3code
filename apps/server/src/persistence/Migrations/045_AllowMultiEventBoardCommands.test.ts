import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("045_AllowMultiEventBoardCommands", (it) => {
  it.effect("allows one command to persist several board events", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 44 });
      yield* sql`DROP TABLE board_events`;
      yield* sql`
        CREATE TABLE board_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          command_id TEXT NOT NULL UNIQUE,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          occurred_at TEXT NOT NULL
        )
      `;
      yield* runMigrations({ toMigrationInclusive: 45 });

      const schema = yield* sql<{ readonly sql: string }>`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'board_events'
      `;
      assert.strictEqual(schema.length, 1);
      const boardEventsSql = schema[0]!.sql;
      assert.ok(boardEventsSql.includes("command_id"));
      assert.notMatch(boardEventsSql, /"?command_id"?\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);

      for (const eventType of ["board.object-created", "board.activity-updated"]) {
        yield* sql`
          INSERT INTO board_events (
            project_id, command_id, event_type, payload_json, occurred_at
          ) VALUES (
            ${"project-1"}, ${"batch-1"}, ${eventType}, ${"{}"},
            ${"2026-08-18T00:00:00.000Z"}
          )
        `;
      }
      const events = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM board_events WHERE command_id = ${"batch-1"}
      `;
      assert.strictEqual(events[0]?.count, 2);
    }),
  );
});
