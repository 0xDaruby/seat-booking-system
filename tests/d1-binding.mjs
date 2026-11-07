import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openD1Inventory } from "../server/d1-inventory.mjs";

const migration = readFileSync(new URL("../migrations/0001_inventory.sql", import.meta.url), "utf8");

// Execute the exact adapter SQL and batch boundaries without cloud resources.
export function localBinding(t) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(migration);
  t.after(() => sqlite.close());
  function prepare(sql, params = []) {
    const statement = sqlite.prepare(sql);
    function execute() {
      if (sql.trimStart().startsWith("SELECT")) {
        return { results: statement.all(...params).map((row) => ({ ...row })), meta: { changes: 0 } };
      }
      return { results: [], meta: statement.run(...params) };
    }
    return {
      bind: (...values) => prepare(sql, values),
      first: async () => execute().results[0] ?? null,
      all: async () => execute(),
      run: async () => execute(),
      execute,
    };
  }
  const db = {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, db, inventory: openD1Inventory(db) };
}
