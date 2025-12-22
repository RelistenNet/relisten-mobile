# All Artists Screen Design Plan

This plan defines a three-tier artists experience (Favorites, Featured, All) that scales to ~4,500 artists while keeping discovery and library curation front‑and‑center.

## Goals
- Keep the default view focused on a manageable set (Favorites + Featured).
- Make adding to Favorites fast from any tier.
- Provide a dedicated, search‑first “All Artists” view with loading state and bulk list.
- Prepare for upcoming server‑provided Popularity and Trending metrics.

## Information Architecture
- Artists screen is split into 3 tiers:
  1) **Favorites (Library)** — user‑curated; always sorted A‑Z.
  2) **Featured** — top ~100 from server; sortable by Name / Popular / Trending.
  3) **All Artists** — full catalog (~4,500+); loaded on demand with spinner; search + add to Favorites.

## Default Artists Screen (Tier 1 + Tier 2)

### Layout
- Header: “Artists” title.
- Section A: **Your Library** (Favorites).
- Section B: **Featured Artists**.
- Multiple entry points to full catalog (not only a footer action):
  - Global search (via existing Filter Bar search icon) always targets All Artists.
  - “View All Artists” button near Featured header.
  - “Browse all 4,500+ artists” CTA in empty Favorites state.

### Favorites (Library) Section
- Title: “Your Library”.
- Subtitle: “Artists you’ve added”.
- Sorting: always A‑Z, case‑insensitive.
- If empty: show inline empty state with a CTA:
  - Copy: “Add artists to build your library.”
  - Buttons:
    - “Browse Featured” (scrolls to Featured)
    - “Browse all 4,500+ artists” (navigates to All Artists)
- UI format: compact list or grid of artist rows with:
  - Artist name
  - Small “★” badge for favorite
  - Tapping artist -> artist detail page
  - Swipe or inline “Remove” action (optional)

### Featured Section
- Title: “Featured Artists”.
- Subtitle: “Top artists right now”.
- Sorting control (segmented or dropdown) lives in the **existing Filter Bar** (reuse component):
  - Name (A‑Z)
  - Popular (desc) — placeholder now
  - Trending (desc) — placeholder now
- Behavior:
  - For now, the “Popular” and “Trending” options should be visible but disabled with a “Coming soon” helper text, or enabled but fallback to server ordering if no metric is available (decide per API support).
  - When metrics land, Featured should re‑sort based on those values.
- UI format: **standard list rows** (no grid), each with:
  - Artist name
  - Popularity bucket badge (see “Popularity Buckets”)
  - “Add to Library” button (heart/star icon)
- Add a “View All Artists” action aligned with the Featured header.

## All Artists Screen (Tier 3)

### Navigation
- From Artists screen: “View All Artists” button(s) near Featured + in empty Favorites state.
- From global search: tapping search in the Filter Bar opens the All Artists screen with search focused.

### Loading Behavior
- On entry: show full‑screen loading indicator while fetching ~4,500 artists.
- If fetch takes > 1.5s: show progress copy, e.g., “Loading full catalog…”.
- If fetch fails: error state with retry.

### Search‑First UI
- Sticky search bar at top using the **existing Filter Bar** search UI.
  - Reuse `FilterBar` / `FilteringProvider` and wire the search filter to `allArtists`.
- Search always targets **All Artists**, even if the user starts from Featured.
  - If user taps search on the main Artists screen, navigate to All Artists and focus search.
- Search placeholder: “Search artists”
- If query is empty:
  - Show full list, virtualized.
- If query is non‑empty:
  - Show filtered list with count: “123 results”.

### List Behavior
- Full list is virtualized for performance.
- Each row:
  - Artist name
  - Popularity bucket badge (see “Popularity Buckets”)
  - “Add to Library” button (star/plus)
  - Optional inline “Added” state (toggle)
- Allow adding to Favorites without leaving the screen.
- If user taps artist row, go to artist detail.

### Empty / No Results
- For a query with no matches:
  - “No artists found. Try a different search.”

## Sorting & Future Data Hooks
- Favorites: local sort A‑Z.
- Featured: server provides 100 artists + metadata; local sorting options:
  - Name: A‑Z
  - Popular: descending on `popularRank` or `popularScore` (future)
  - Trending: descending on `trendingScore` (future)
- All Artists: default A‑Z; optional future sort for “Recently Added” if server provides.

## Popularity Buckets (Artist Rows)
Display a small bucket badge on artist rows when `momentum_score` is available:
- Bucket 1: `momentum_score` 0.00–0.25
- Bucket 2: 0.25–0.50
- Bucket 3: 0.50–0.75
- Bucket 4: 0.75–1.00

When popularity data is missing, hide the badge (no placeholder).

## Interaction Details
- “Add to Library” toggles favorite status in place.
  - Use existing row actions where possible (reuse current artist list item styling).
- Use optimistic UI: toggle immediately; rollback on failure with toast.
- Show toast “Added to Library” / “Removed from Library”.
- Favorited artists should appear in Favorites section immediately when user returns to main screen.

## State Model (Minimal)
- `favorites: Artist[]` — local Realm or cached list; always A‑Z.
- `featured: Artist[]` — server list; includes `name`, `uuid`, optional `popularScore`, `trendingScore`.
- `allArtists: Artist[]` — full list; fetched on demand only.
- `featuredSort: 'name' | 'popular' | 'trending'`.
- `allArtistsStatus: 'idle' | 'loading' | 'loaded' | 'error'`.

## Analytics (Optional)
- Track events:
  - `artists.viewed_all` when entering All Artists.
  - `artists.search` with query length.
  - `artists.favorite_add` and `artists.favorite_remove` by tier.
  - `artists.featured_sort` when changing sort.

## Implementation Notes
- Keep Artists screen lean: do not load the full list there.
- Ensure “All Artists” screen is separate to avoid heavy startup costs.
- **Reuse existing components:**
  - `FilterBar`, `FilteringProvider`, `FilterableList`, `RelistenSectionList` for search and sorting.
  - Use existing `ActivityIndicator` patterns for loading states (see `app/relisten/tabs/(relisten)/index.tsx`).
  - Use existing `NonIdealState` for empty/error messaging.
- Add “Coming soon” UI for Popular/Trending if metrics not available yet; keep the sort options visible to set expectation.
- Use a single “Add to Library” interaction for both Featured and All Artists.

## Acceptance Criteria
- Favorites are always sorted A‑Z and show first.
- Featured list shows ~100 artists with a sort control.
- “View All Artists” triggers a full fetch and shows a loading indicator.
- All Artists screen allows local search + add to Favorites.
- Toggling favorites updates the Library section on return.
