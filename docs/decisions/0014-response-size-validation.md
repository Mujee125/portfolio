# ADR-0014: Response Body Size Validation

## Status
Proposed

## Context
The GitHub client currently has no validation of response body size before attempting JSON parsing. A malicious or misconfigured upstream could return an extremely large response, causing memory exhaustion. This is a security gap identified in the security audit.

## Decision
Implement response body size validation in the GitHub client before JSON parsing, using stream-based reading with early abort.

## Architecture

### Validation Strategy
- **Location**: `src/lib/github/client.ts` in `fetchRepositoryPage`
- **Approach**: Read response as stream, track bytes, abort if size exceeded
- **Default limit**: 10MB (configurable via environment variable)
- **Error handling**: Throw `GitHubError` with `invalid_response` kind when size exceeded

### Implementation Approach
Since `fetch` with `AbortSignal.timeout` is already used, we'll:
1. Check `Content-Length` header first (if present)
2. If missing or within limits, read the stream while counting bytes
3. Abort if size exceeds limit before full read
4. Parse JSON only after size validation passes

### Configuration

### Environment Variables
```bash
# OPTIONAL — response size limits (defaults shown)
GITHUB_MAX_RESPONSE_SIZE_MB=10
```

### Error Type
```typescript
new GitHubError('invalid_response', {
  status: response.status,
  detail: `Response body exceeds maximum size of ${limit}MB`,
});
```

## Implementation Details

### Algorithm Pseudocode
```typescript
async function fetchWithSizeLimit(response: Response, maxSize: number): Promise<unknown> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const size = Number(contentLength);
    if (size > maxSize) {
      throw new GitHubError('invalid_response', {
        detail: `Response too large: ${size} bytes (max ${maxSize})`,
      });
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new GitHubError('invalid_response', { detail: 'No response body' });
  }

  let totalBytes = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.length;
    if (totalBytes > maxSize) {
      reader.cancel();
      throw new GitHubError('invalid_response', {
        detail: `Response body exceeds ${maxSize} bytes`,
      });
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(body);
  return JSON.parse(text);
}
```

### Integration Point
Replace the direct `response.json()` call in `fetchRepositoryPage` with the size-limited version.

## Testing Strategy

### Unit Tests
- Test with normal-sized responses (should pass)
- Test with oversized responses (should abort)
- Test with Content-Length header validation
- Test with missing Content-Length (should stream-check)
- Test error message contains size information

### Integration Tests
- Test with mock GitHub server returning large responses
- Verify error propagates correctly through the inventory service
- Test that UI shows appropriate error message

### E2E Tests
- Test that large responses don't crash the application
- Verify error state is shown to user

## Security Considerations

### Attack Vectors Mitigated
- **Memory exhaustion**: Limited to 10MB per response
- **Slowloris**: Combined with existing timeout (8s default)
- **Upstream hijacking**: Size validation prevents unbounded memory allocation

### Limitations
- **Serverless memory limits**: 10MB may still be high for very small serverless instances
  - Mitigation: Make limit configurable, default conservative for production
- **Compression**: Size check is on decompressed data
  - Acceptable: We want to limit memory usage, not network bandwidth
- **Concurrent requests**: Multiple large responses could still exhaust memory
  - Mitigation: Existing page cap (10 pages) limits concurrent large responses

## Alternatives Considered

### Content-Length Only
**Pros**: Simple, no streaming needed
**Cons**: Header can be missing or incorrect
**Decision**: Rejected - need actual stream validation

### Upstream Library (e.g., got)
**Pros**: Built-in size limits
**Cons**: Additional dependency, doesn't fit minimal dependency philosophy
**Decision**: Rejected - implement ourselves for transparency

### Per-endpoint Limits
**Pros**: Different limits for different endpoints
**Cons**: Over-engineering for single use case
**Decision**: Rejected - single limit is sufficient

## Migration Plan

1. Implement size validation function
2. Add configuration to config.ts
3. Integrate into GitHub client
4. Add tests
5. Update documentation
6. Deploy with conservative default (10MB)

## Success Criteria
- [ ] Responses >10MB are rejected with clear error
- [ ] Normal responses (actual GitHub data, ~50KB) pass validation
- [ ] Error message includes size information
- [ ] No performance degradation for normal responses
- [ ] Documentation is clear on configuration

## Open Questions
1. Should the limit be per-page or per-total-refresh? (Decision: per-page, simpler and prevents individual page exhaustion)
2. Should we log when size limit is hit? (Decision: Yes, via existing logger in inventory service)
3. Should we include response size in health endpoint? (Decision: No, not a security concern, just operational)
