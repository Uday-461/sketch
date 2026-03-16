# React + TanStack Patterns

## Routing (TanStack Router)
- Routes defined with `createRoute()` from `@tanstack/react-router`
- Route tree assembled in `router.ts` with `rootRoute.addChildren([...])`
- Dashboard layout with nested children routes

## Data Fetching (TanStack Query)
- `useQuery()` for data loading with cache keys
- `useMutation()` for create/update/delete operations
- Query invalidation after mutations

## Typed API Client (`lib/api.ts`)
- `api` object with namespaced methods: `api.users.list()`, `api.auth.login()`
- Internal `request<T>()` helper handles JSON serialization, error parsing
- Error shape: `{ error: { code: string, message: string } }`
- FormData bodies skip Content-Type header (browser sets multipart boundary)

## UI Components
- shadcn/ui components in `components/ui/` (Button, Dialog, Card, etc.)
- Phosphor Icons (`@phosphor-icons/react`) for iconography
- Tailwind CSS v4 for styling
- Sonner for toast notifications

## Testing
- `renderWithProviders()` wraps component with TanStack Router + Query providers
- MSW (`msw`) for mocking API responses
- `@testing-library/react` for DOM queries and interactions
- `waitFor()` for async assertions

## Reference Files
- `packages/web/src/router.ts`
- `packages/web/src/lib/api.ts`
- `packages/web/src/routes/*.tsx`
- `packages/web/src/components/ui/*.tsx`
