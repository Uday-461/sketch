# API Design

## URL Design
- Resource-oriented URLs with nouns, no verbs in paths
- Examples: `POST /api/users/:id/verification` (not `send-verification`), `DELETE /api/channels/slack`
- Correct HTTP methods: GET (read), POST (create), PUT (idempotent upsert), PATCH (partial update), DELETE (remove)

## Hono Route Pattern
- Route factory function: `export function xyzRoutes(deps): Hono`
- Returns `new Hono()` with routes mounted
- Dependency injection through function parameters, not middleware context

## Request Validation
- zod `safeParse` for all request bodies
- Return 400 with error shape on validation failure

## Error Response Shape
All errors follow: `{ error: { code: string, message: string } }`

Example:
```ts
return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
```

## Auth
- `createAuthMiddleware()` applied to all `/api/*` routes
- Admin-only routes guarded by `requireAdmin()` middleware
- Auth tokens via HTTP-only cookies (JWT)

## Route Registration
- Register new routes in `http.ts` following existing order
- API routes first, then static assets, then SPA catch-all
