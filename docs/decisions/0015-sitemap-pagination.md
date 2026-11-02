# ADR-0015: Sitemap Pagination

## Status
Proposed

## Context
The current sitemap implementation includes all repositories in a single sitemap file. For accounts with thousands of repositories, this could exceed the 50MB URL limit imposed by search engines, causing sitemap rejection or indexing issues. This is a performance gap identified in the security/performance audit.

## Decision
Implement sitemap pagination following Google's sitemap index specification, with a configurable limit of URLs per sitemap file.

## Architecture

### Pagination Strategy
- **Location**: `src/app/sitemap.ts`
- **Approach**: Generate sitemap index file referencing paginated sitemaps
- **Default limit**: 1000 URLs per sitemap file (configurable)
- **Trigger**: When total repositories > 1000, generate index + multiple sitemaps

### Google Sitemap Index Format
```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-0.xml</loc>
    <lastmod>2024-01-01T00:00:00Z</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-1.xml</loc>
    <lastmod>2024-01-01T00:00:00Z</lastmod>
  </sitemap>
</sitemapindex>
```

### File Structure
```
sitemap.xml → index file (when >1000 repos)
sitemap-0.xml → first 1000 repos
sitemap-1.xml → next 1000 repos
...
```

For accounts with ≤1000 repos, keep current behavior (single `sitemap.xml`).

### Configuration

### Environment Variables
```bash
# OPTIONAL — sitemap pagination (defaults shown)
SITEMAP_MAX_URLS=1000
```

### Implementation Approach

1. Count total repositories
2. If ≤ limit: return single sitemap (current behavior)
3. If > limit: return sitemap index with references to paginated sitemaps
4. Generate paginated sitemaps as dynamic routes: `/sitemap-[index].xml`

### Dynamic Routes for Paginated Sitemaps
Create `src/app/sitemap-[index].xml/route.ts` to generate individual sitemap files.

## Implementation Details

### Main Sitemap (index)
```typescript
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = getConfig();
  const { inventory } = await getRepositoryInventory();
  
  if (!inventory || inventory.repos.length <= config.sitemap.maxUrls) {
    // Single sitemap (current behavior)
    return generateSingleSitemap(config, inventory);
  }
  
  // Sitemap index
  const totalPages = Math.ceil(inventory.repos.length / config.sitemap.maxUrls);
  return generateSitemapIndex(config, inventory, totalPages);
}
```

### Paginated Sitemap Route
```typescript
// src/app/sitemap-[index].xml/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { index: string } }
) {
  const index = Number(params.index);
  const config = getConfig();
  const { inventory } = await getRepositoryInventory();
  
  const start = index * config.sitemap.maxUrls;
  const end = start + config.sitemap.maxUrls;
  const repos = inventory?.repos.slice(start, end) ?? [];
  
  return generateSitemapXml(config, repos);
}
```

## Testing Strategy

### Unit Tests
- Test single sitemap generation (≤1000 repos)
- Test sitemap index generation (>1000 repos)
- Test paginated sitemap generation
- Test edge cases (exactly 1000 repos, 0 repos)

### Integration Tests
- Test with mock inventory of various sizes
- Verify sitemap index references correct files
- Verify each paginated sitemap contains correct subset

### E2E Tests
- Test that sitemap is accessible
- Test that paginated sitemaps are accessible
- Verify XML validates against schema

## Performance Considerations

### Pros
- Prevents sitemap rejection by search engines
- Smaller individual files are faster to download
- Allows search engines to process large portfolios incrementally

### Cons
- Multiple HTTP requests from search engines (but they already do this for large sites)
- Slightly more complex implementation
- Need to ensure index and sitemaps stay in sync

### Mitigations
- Cache sitemap generation (already dynamic with inventory cache)
- Use same inventory snapshot for index and all sitemaps
- Generate all sitemaps in single request to ensure consistency

## SEO Considerations

### Google Guidelines
- Sitemap index must be UTF-8 encoded
- Each sitemap in index must be valid
- All referenced sitemaps must be at same domain
- Maximum 50,000 URLs per sitemap, 50MB size limit

### Implementation Compliance
- UTF-8 encoding (Next.js default)
- Validate against XML schema
- Same domain (all under config.site.url)
- Conservative 1000 URL limit (well under 50,000)

## Alternatives Considered

### Increase Limit Without Pagination
**Pros**: Simpler implementation
**Cons**: Could still hit 50MB limit with many repos
**Decision**: Rejected - pagination is more robust

### Exclude Old Repositories
**Pros**: Smaller sitemap
**Cons**: Bad for SEO, excludes content from index
**Decision**: Rejected - defeats purpose of portfolio

### Static Sitemap Generation
**Pros**: No runtime cost
**Cons**: Requires rebuild on repo changes
**Decision**: Rejected - conflicts with dynamic data requirement

## Migration Plan

1. Add configuration to config.ts
2. Create paginated sitemap route
3. Update main sitemap.ts to detect and generate index
4. Add tests
5. Update documentation
6. Deploy with pagination disabled (set high limit)
7. Enable pagination in production (1000 URL limit)

## Success Criteria
- [ ] Single sitemap for ≤1000 repos (backwards compatible)
- [ ] Sitemap index + paginated files for >1000 repos
- [ ] Each paginated sitemap contains correct subset
- [ ] Sitemap index references all paginated files
- [ ] XML validates against Google schema
- [ ] No performance regression for small accounts
- [ ] Documentation is clear on configuration

## Open Questions
1. Should we include lastmod in sitemap index entries? (Decision: Yes, using inventory.generatedAt)
2. Should we exclude archived repos from sitemap? (Decision: No, they're still indexed pages)
3. Should we change frequency/priority based on repo age? (Decision: No, keep simple defaults)
