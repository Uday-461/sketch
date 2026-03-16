# Guide: Creating a Database Migration

## Step-by-Step

### 1. Check the Next Migration Number
Read `packages/server/src/db/migrate.ts` and find the last `import * as mNNN` line. The next number is NNN+1.

### 2. Create the Migration File
Create `packages/server/src/db/migrations/{NNN}-{description}.ts`:

```ts
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("my_table")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.defaultTo("CURRENT_TIMESTAMP").notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("my_table").execute();
}
```

### 3. Update Schema Types
Edit `packages/server/src/db/schema.ts`:

```ts
export interface MyTable {
  id: string;
  name: string;
  created_at: Generated<string>;
}

// Add to DB interface:
export interface DB {
  // ... existing tables
  my_table: MyTable;
}
```

### 4. Update Migration Runner
Edit `packages/server/src/db/migrate.ts`:

```ts
import * as mNNN from "./migrations/NNN-description";

// In getMigrations():
"NNN-description": mNNN,
```

### 5. Create Repository (for new tables)
Create `packages/server/src/db/repositories/{table}.ts`:

```ts
export function createMyRepository(db: Kysely<DB>) {
  return {
    async findById(id: string) {
      return db.selectFrom("my_table").selectAll().where("id", "=", id).executeTakeFirst();
    },
    async create(data: { id: string; name: string }) {
      await db.insertInto("my_table").values(data).execute();
    },
  };
}
```

### 6. Write Tests
Create a test file for the repository, using `createTestDb()` from `test-utils.ts`.

## Rules
- Use `text` (not varchar) for string columns
- Use `CURRENT_TIMESTAMP` (not `NOW()`)
- Use `Generated<string>` for auto-columns in schema.ts
- Migration functions take `Kysely<unknown>` (not `Kysely<DB>`)
- Always implement both `up` and `down`
