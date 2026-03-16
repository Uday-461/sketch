# Hono Patterns

## Route Factory Functions
Routes are created as factory functions that return a `Hono` instance:

```ts
export function xyzRoutes(deps: XyzDeps): Hono {
  const app = new Hono();
  app.get("/", async (c) => { ... });
  return app;
}
```

## Dependency Injection
- Dependencies passed as function parameters, not middleware context
- Deps interface defined alongside the route file
- Repositories, config, logger, and callbacks injected from `http.ts`

## Auth Middleware
- `createAuthMiddleware(settings)` applied globally to `/api/*`
- Checks JWT from HTTP-only cookie
- Setup mode bypass for initial configuration
- `requireAdmin()` for admin-only routes

## Error Response Format
```ts
return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
```

Standard codes: `NOT_FOUND`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL_ERROR`

## Request Validation
```ts
const body = await c.req.json();
const parsed = schema.safeParse(body);
if (!parsed.success) {
  return c.json({ error: { code: "BAD_REQUEST", message: "Invalid input" } }, 400);
}
```

## Route Registration in `http.ts`
Routes are registered in order:
1. Auth middleware on `/api/*`
2. API routes (`app.route("/api/xyz", xyzRoutes(deps))`)
3. Static file serving (`serveStatic`)
4. SPA catch-all (returns `index.html` for client-side routing)

## Static File Serving
- Production: assets in `dist/public/` alongside server bundle
- Dev: falls back to `packages/web/dist/`
- Hashed assets served from `/assets/*`

## Reference Files
- `packages/server/src/http.ts`
- `packages/server/src/api/*.ts`
- `packages/server/src/api/middleware.ts`
