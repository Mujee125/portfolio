# ADR-0016: Memory Limits for Repository Loading

## Status
Proposed

## Context
The repository loading process loads all repositories into memory before filtering. With `GITHUB_MAX_PAGES=50` and 100 repos per page, that's up to 5,000 repositories loaded simultaneously. This could cause memory pressure on serverless instances with cold starts. This is a performance gap identified in the security/performance audit.

## Decision
Implement a safety limit on the total number of repositories that can be loaded, with a "truncated" flag to inform users when the limit is reached.

## Architecture

### Limit Strategy
- **Location**: `src/lib/github/index.ts` in `loadSnapshot` function
- **Approach**: Check total repository count after collection, abort if exceeds limit
- **Default limit**: 2000 repositories (configurable via environment variable)
- **Behavior**: Set `truncated: true` flag and log warning when limit exceeded

### Configuration

### Environment Variables
```bash
# OPTIONAL — memory limits (defaults shown)
GITHUB_MAX_REPOSITORIES=2000
```

### Implementation Approach

1. After collecting all repositories, check total count
2. If count > limit:
   - Set `truncated: true` in snapshot
   - Log warning with actual count and limit
   - Continue with limited set (first N repos)
3. If count ≤ limit: proceed normally

### Error Type
```typescript
logger('warn', 'github.pagination_capped', {
  maxRepositories: config.github.maxRepositories,
  actualCount: totalRepos,
  pages,
});
```

## Implementation Details

### Algorithm Pseudocode
```typescript
async function loadSnapshot(): Promise<RepositorySnapshot> {
  // ... existing collection logic ...
  
  const totalRepos = collected.length;
  const maxRepos = config.github.maxRepositories;
  
  if (totalRepos > maxRepos) {
    logger('warn', 'github.repository_count_capped', {
      maxRepositories: maxRepos,
      actualCount: totalRepos,
    });
    // Keep only the first maxRepos
    collected.length = maxRepos;
    truncated = true;
  }
  
  // ... rest of existing logic ...
}
```

### Integration Point
Add check in `loadSnapshot` after the collection loop and before mapping.

## Testing Strategy

### Unit Tests
- Test with normal repository count (under limit)
- Test with repository count exceeding limit
- Test that truncated flag is set correctly
- Test that log warning is called
- Test with maxRepositories = 0 (should reject all)

### Integration Tests
- Test with mock GitHub server returning many repos
- Verify UI shows truncation notice
- Verify health endpoint reports truncated state

### E2E Tests
- Test that truncation message appears when limit hit
- Verify site still functions with truncated data

## Performance Considerations

### Pros
- Prevents memory exhaustion on serverless instances
- Configurable limit based on instance size
- Graceful degradation (partial data vs. crash)

### Cons
- Some repositories won't be indexed (truncated ones)
- Users with >2000 repos won't see all their work
- Limit is arbitrary (2000 is heuristic)

### Mitigations
- Truncated flag is visible in UI
- Users can increase limit if they have larger instances
- 2000 repos is generous for most portfolios
- Health endpoint reports truncation status

## Security Considerations

### Attack Vectors Mitigated
- **Memory exhaustion**: Limited to 2000 repos
- **DoS via pagination**: Existing page cap (50) combined with repo limit prevents abuse

### Limitations
- **Serverless memory varies**: 2000 may still be high for smallest instances
  - Mitigation: Make limit configurable, document for instance sizing
- **Large repos with many commits**: Each repo object is small (metadata only)
  - Acceptable: We're only storing metadata, not full repo content

## Alternatives Considered

### Streaming Processing
**Pros**: No memory cap needed
**Cons**: Complex to implement, breaks single-pass design
**Decision**: Rejected - over-engineering for this use case

### Per-Page Limit Only
**Pros**: Simpler, already have page cap
**Cons**: Could still load 5000 repos with maxPages=50
**Decision**: Rejected - need explicit repo count limit

### No Limit (Current State)
**Pros**: Simplest
**Cons**: Memory exhaustion risk
**Decision**: Rejected - identified as security/performance gap

## Migration Plan

1. Add configuration to config.ts
2. Add limit check in loadSnapshot
3. Add tests
4. Update documentation
5. Deploy with high default (5000) for observation
6. Lower to 2000 after monitoring

## Success Criteria
- [ ] Repositories > limit are rejected with truncated flag
- [ ] Normal counts (≤2000) pass through unchanged
- [ ] Warning is logged when limit exceeded
- [ ] UI shows truncation notice when appropriate
- [ ] Health endpoint reports truncated state
- [ ] Documentation is clear on configuration

## Open Questions
1. Should we sort repos before truncating? (Decision: Yes, by stars descending to show most important repos)
2. Should limit be per-instance or global? (Decision: Per-instance, in-process cache)
3. Should we include skipped repos in the count? (Decision: No, only valid repos count toward limit)
