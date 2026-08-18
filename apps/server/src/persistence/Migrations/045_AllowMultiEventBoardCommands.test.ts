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
      yield* runMigrations({ toMigrationInclusive: 45 });

      const schema = yield* sql<{ readonly sql: string }>`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'board_events'
      `;
      assert.strictEqual(schema.length, 1);
      const boardEventsSql = schema[0]!.sql;
      assert.ok(boardEventsSql.includes("command_id"));
      assert.notMatch(boardEventsSql, /command_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
    }),
  );
});
