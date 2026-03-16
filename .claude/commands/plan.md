Create or update a planning document for a feature.

Ask the user for the feature name if not provided as an argument: $ARGUMENTS

1. Determine the file name: convert the feature name to UPPER_SNAKE_CASE (e.g., "telegram adapter" → `TELEGRAM_ADAPTER.md`)
2. Check if `.planning/{FEATURE_NAME}.md` already exists
3. If it exists, read it and update based on discussion. If not, create a new plan file.
4. Write the plan to `.planning/{FEATURE_NAME}.md` with this structure:

```markdown
# Feature Name

## Context
Why this feature exists and what problem it solves.

## Design
Key architectural decisions and approach.

## Implementation Plan
### Phase 1: ...
- [ ] Step 1
- [ ] Step 2

### Phase 2: ...

## Files to Create/Modify
List of files that need changes.

## Testing Strategy
How to verify the implementation.

## Open Questions
Unresolved decisions.
```

5. After writing, summarize the plan and confirm with the user before implementing.
