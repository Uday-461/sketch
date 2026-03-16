# Guide: Adding API Routes

## Step-by-Step

### 1. Create the Route File
Create `packages/server/src/api/{resource}.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod/v4";

interface MyRouteDeps {
  // Repositories, config, callbacks needed
}

export function myRoutes(deps: MyRouteDeps) {
  const app = new Hono();

  // GET — list resources
  app.get("/", async (c) => {
    const items = await deps.repo.list();
    return c.json({ items });
  });

  // POST — create resource
  app.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "BAD_REQUEST", message: "Invalid input" } }, 400);
    }
    const item = await deps.repo.create(parsed.data);
    return c.json({ item }, 201);
  });

  return app;
}
```

### 2. Define Zod Schemas
```ts
const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
```

### 3. Error Response Format
Always use the standard shape:
```ts
return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
```

Standard codes: `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL_ERROR`

### 4. Add Auth Guards
- All routes under `/api/*` get auth middleware automatically
- For admin-only routes, add `requireAdmin()`:
```ts
import { requireAdmin } from "./middleware";
app.use("/*", requireAdmin());
```

### 5. Register in `http.ts`
```ts
import { myRoutes } from "./api/my-resource";

// In createApp():
app.route("/api/my-resource", myRoutes(deps));
```

### 6. Add to API Client
Update `packages/web/src/lib/api.ts`:
```ts
myResource: {
  list() { return request<{ items: MyItem[] }>("/api/my-resource"); },
  create(data: CreateData) {
    return request<{ item: MyItem }>("/api/my-resource", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
},
```

### 7. Write Tests
Test the route handlers using `createTestDb()` and direct Hono app invocation.

## Checklist
- [ ] Route file with factory function
- [ ] Zod validation on request bodies
- [ ] Standard error response shape
- [ ] Auth middleware coverage
- [ ] Registered in `http.ts`
- [ ] API client methods added
- [ ] Tests written
