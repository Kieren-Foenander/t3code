import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("044_RepairBoardCommandReceipts", (it) => {
  it.effect("repairs databases that recorded the board migration before receipts existed", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 43 });
      yield* sql`DROP TABLE board_command_receipts`;

      yield* runMigrations({ toMigrationInclusive: 44 });

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(board_command_receipts)
      `;
      assert.deepStrictEqual(
        columns.map((column) => column.name),
        ["command_id", "project_id", "last_sequence", "created_at"],
      );
    }),
  );
});
