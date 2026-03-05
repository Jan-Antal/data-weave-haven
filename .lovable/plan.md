

## Fix: Mobile dashboard carousel — full width, infinite swipe

### Changes in `src/components/DashboardStats.tsx`

**1. Carousel options** (line 275):
- Change `loop: false` to `loop: true` for infinite swipe
- Change `align: "start"` to `align: "center"` (not strictly needed for 100% basis but cleaner)

**2. Card basis** (lines 278, 290, 310, 334):
- Change all `basis-[85%]` to `basis-full` so each card fills 100% width

**3. Remove negative margin / padding offset**:
- Change `CarouselContent` from `-ml-2` to `-ml-0` (or remove class)
- Change each `CarouselItem` from `pl-2` to `pl-0`

**4. Dot indicator colors** (lines 374-378):
- Active dot: `#223937` instead of `hsl(var(--primary))`
- Inactive dot: `#d1cdc7` instead of current muted value

**5. Active slide tracking for loop mode**:
- The existing `carouselApi.selectedScrollSnap()` works correctly with embla's loop mode — no change needed.

**6. Auto-advance** (new effect):
- Add a `useEffect` that sets an 8-second interval calling `carouselApi.scrollNext()`
- On first user interaction (`pointerDown` event on carousel), clear interval permanently via a ref flag

**7. Outer container padding**:
- Remove any horizontal padding on the carousel wrapper so cards go edge-to-edge. Cards keep internal `p-4` padding.

