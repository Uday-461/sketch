# Kysely Migrations

## Static Import Pattern
Migrations use static imports in `migrate.ts` instead of `FileMigrationProvider` for tsdown bundler compatibility:

```ts
import * as m001 from "./migrations/001-initial";
// ...
const migrator = new Migrator({
  db,
  provider: {
    async getMigrations() {
      return { "001-initial": m001, ... };
    },
  },
});
```

## Migration File Format
Three-digit prefix numbering: `001-`, `002-`, etc.

```ts
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("settings").addColumn("new_column", "text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("settings").dropColumn("new_column").execute();
}
```

## Cross-Dialect Compatibility
- Use `CURRENT_TIMESTAMP` (not `NOW()`) for default timestamps
- Use `text` column type (not `varchar`) for SQLite compatibility
- Use `Generated<string>` in schema.ts for auto-generated columns

## Three-File Coordination
Every schema change requires updates to three files:
1. **Migration file** — `db/migrations/NNN-description.ts` (up + down)
2. **Schema types** — `db/schema.ts` (add/modify table interface + DB interface)
3. **Migration runner** — `db/migrate.ts` (add static import + register in getMigrations)

## Repository Factory Pattern
```ts
export function createXxxRepository(db: Kysely<DB>) {
  return {
    async findById(id: string) { ... },
    async create(data: NewXxx) { ... },
  };
}
```

## Reference Files
- `packages/server/src/db/migrate.ts`
- `packages/server/src/db/schema.ts`
- `packages/server/src/db/migrations/*.ts`
- `packages/server/src/db/repositories/*.ts`
