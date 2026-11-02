# Portfolio Transformation Plan - Visual Showcase

## Executive Summary

Transform the current GitHub-centric portfolio into a dynamic, visual showcase of actual work with 3D animations, parallax effects, and interactive elements.

**Current State**: GitHub API-driven repository listing
**Target State**: Visual project showcase with screenshots and animations

## Technology Decisions

### Animation Library: Framer Motion
- **Rationale**: Lightweight, React-native, excellent performance
- **Size**: ~50KB vs ~600KB for Three.js
- **Features**: CSS 3D transforms, parallax, gesture support
- **Mobile**: Easily disable animations on mobile devices

### Data Source: Local Project Configuration
- **Rationale**: Screenshots require manual curation anyway
- **Format**: JSON or TypeScript config file
- **Benefit**: Full control over presentation, order, and metadata

## New Data Structure

```typescript
interface Project {
  id: string;
  title: string;
  description: string;
  screenshots: string[]; // Array of image URLs (local or CDN)
  techStack: string[];
  liveUrl?: string;
  githubUrl?: string;
  date: string; // ISO date for timeline
  featured: boolean;
  category?: string; // For filtering
}

interface TechStackItem {
  name: string;
  icon?: string;
  proficiency: number; // 1-5
  category: 'frontend' | 'backend' | 'devops' | 'design';
}
```

## Component Architecture

### New Components
1. **ProjectCarousel** - 3D rotating project cards
2. **Timeline** - Scroll-based 3D timeline
3. **TechStackVisualizer** - Interactive tech stack
4. **ParallaxSection** - Parallax scroll container
5. **ProjectModal** - Detail view with screenshot gallery
6. **ScreenshotGallery** - Image carousel within project

### Removed/Modified Components
- ~~RepoCard~~ → ProjectCard (3D enhanced)
- ~~RepoFilters~~ → CategoryFilter (if needed)
- ~~useRepositories~~ → useProjects (local data)

## Performance Considerations

### Image Optimization
- Use Next.js Image component
- Implement lazy loading
- WebP format for screenshots
- Responsive image sizes
- Consider using CDN for image hosting

### Animation Performance
- Use `transform` and `opacity` only (GPU-accelerated)
- Avoid animating layout properties (width, height)
- Disable 3D effects on mobile devices
- Use `will-change` sparingly
- Implement intersection observer for scroll animations

### Mobile Strategy
- Disable 3D card rotation on screens < 768px
- Replace parallax with simple scroll animations
- Use static timeline instead of 3D
- Optimize touch interactions

## Implementation Phases

### Phase 1: Foundation (Sprint 2)
- Set up Framer Motion
- Create new data structure
- Add sample project data
- Set up image optimization
- Create basic ProjectCard component

### Phase 2: Core Features (Sprint 3)
- Implement 3D rotating carousel
- Build timeline component
- Add parallax scrolling
- Create tech stack visualizer
- Mobile responsive variants

### Phase 3: Polish (Sprint 4)
- Project detail modal
- Screenshot gallery
- Loading states
- Error handling
- Performance optimization
- Accessibility improvements

## Migration Strategy

### Option A: Clean Break (Recommended)
- Create new branch: `feature/visual-showcase`
- Build new portfolio alongside existing
- Replace homepage when ready
- Keep GitHub repo view as a separate route (optional)

### Option B: Gradual Migration
- Keep existing GitHub API integration
- Add project showcase as new section
- Migrate over time
- More complex, maintains legacy code

**Recommendation**: Option A - Clean break is simpler and cleaner

## Risks and Mitigations

### Risk 1: Performance Degradation
- **Mitigation**: Use image optimization, GPU-accelerated animations, disable 3D on mobile

### Risk 2: Complex Maintenance
- **Mitigation**: Keep data structure simple, use TypeScript, document components

### Risk 3: Image Hosting
- **Mitigation**: Use Vercel's built-in image optimization or external CDN (Cloudinary, Imgur)

### Risk 4: Accessibility
- **Mitigation**: Respect `prefers-reduced-motion`, keyboard navigation, ARIA labels

## Story Point Estimates

### Sprint 2: Foundation (30 points)
- Setup Framer Motion + config (3 pts)
- Create project data structure (5 pts)
- Add sample project data (3 pts)
- Image optimization setup (5 pts)
- Basic ProjectCard component (5 pts)
- Project page layout (4 pts)
- Mobile responsiveness (5 pts)

### Sprint 3: Core Features (35 points)
- 3D rotating carousel (10 pts)
- Timeline component (8 pts)
- Parallax scrolling (7 pts)
- Tech stack visualizer (5 pts)
- Navigation and routing (5 pts)

### Sprint 4: Polish (20 points)
- Project detail modal (5 pts)
- Screenshot gallery (5 pts)
- Loading/error states (3 pts)
- Performance optimization (4 pts)
- Accessibility audit (3 pts)

**Total**: 85 story points (~3-4 sprints)

## Next Steps

1. **Confirm technology choice** (Framer Motion vs alternative)
2. **Confirm data source** (local config vs CMS)
3. **Confirm image hosting strategy** (local vs CDN)
4. **Confirm timeline** (start Sprint 2 after Sprint 1 completion)
5. **Begin Phase 1 implementation**
