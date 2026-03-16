Create a new Kysely database migration.

Ask the user for a description if not provided: $ARGUMENTS

1. Read `packages/server/src/db/migrate.ts` to determine the next migration number
2. Create the migration file at `packages/server/src/db/migrations/{NNN}-{description}.ts` with:

```ts
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Migration logic here
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Rollback logic here
}
```

3. Update `packages/server/src/db/schema.ts`:
   - Add or modify the table interface
   - Add to the `DB` interface if it's a new table

4. Update `packages/server/src/db/migrate.ts`:
   - Add the static import: `import * as mNNN from "./migrations/NNN-description";`
   - Add to the `getMigrations()` return object: `"NNN-description": mNNN`

5. Use `text` column type (not varchar) for SQLite compatibility
6. Use `CURRENT_TIMESTAMP` for default timestamps
7. Use `Generated<string>` in schema.ts for auto-generated columns

8. If this is a new table, create a repository at `packages/server/src/db/repositories/{table}.ts` following the factory pattern.
