# Options Architecture & Mobile Fullscreen Guidelines

## 1. Key Component Mapping
- **Expiry Board & T-Quote**: `src/features/options/components/ExpiryGroupCard.tsx`
- **Open Interest Overlay**: `src/features/options/components/OpenInterestOverlay.tsx`
- **Realtime Quotes & Subscription**: `src/features/options/components/OptionQuoteSubscription.tsx`, `useOptionPriceWebSocket.ts`
- **Options Services & Adapters**: `src/lib/services/prod/optionsServices.ts`

## 2. T-Board Fullscreen & Mobile Header Standard
When viewing T-quote (T型报价) in fullscreen or mobile viewports (< 640px):
1. **Never cram all toolbar items into a single flex row on mobile**:
   - **Row 1 (Header Bar)**: Navigation `[← 返回]` (`whitespace-nowrap shrink-0` to avoid vertical line breaks), underlying ticker symbol (`truncate`), underlying spot price, expiry badge, and right-aligned action buttons (refresh `↻` + close/minimize `⤡`).
   - **Row 2 (Quick Actions Bar)**: Compact controls: `[⌖ 定位平值]`, `[● OI: ON/OFF]` toggle, and the scale range slider (`[表格大小 ──●── 85%]`). Keep the slider isolated to prevent visual collision with instrument labels and underlying price text.
   - **Row 3 (Optional HUD)**: When OI overlay is active, show Call/Put peak strikes and PCR in a dedicated subtle bar.
2. **Desktop Layout (`sm:` and above)**:
   - Revert gracefully to a single cohesive horizontal toolbar with ample whitespace.
3. **Modal & Portal Layering**:
   - Fullscreen container: `createPortal(..., document.body)` with `z-[9999]`.
   - Modals (e.g., adjust position / combo management): Must use `z-[2147483010]` to appear above fullscreen.
   - Body scroll lock: Ensure `document.body.style.overflow = 'hidden'` on mount, restored on unmount.
   - ATM Auto-alignment: Trigger `scrollToAtm()` upon entering fullscreen to center on the spot price row (`data-spot-indicator="true"`) and strike column (`strikeHeaderRef`).

## 3. Scale & Coordinate Synchronization
- When applying CSS `zoom: mobileTBoardScale` to the `<table>`, always forward `scale={(isMobileViewport || inFullscreen) ? mobileTBoardScale : 1}` to `<OpenInterestOverlay>` so that SVG coordinates scale in tandem with table rows.

## 4. Git & Workspace Safety
- Never execute destructive git operations (`git checkout <file>`, `git restore`, `git reset --hard`) on user code without explicit instruction. Always preserve and analyze uncommitted diffs first.

## 5. Mobile Data Density & Header Guidelines
- **Dynamic Header Scaling**: Primary page `h1` must scale adaptively on mobile (`text-base sm:text-2xl font-bold tracking-tight`).
- **Hide Marketing Subtitles on Mobile**: Secondary descriptive text should be hidden on narrow viewports (`hidden sm:block`) to maximize vertical space for immediate trading data.
- **Compact Filter Controls**: Container padding uses `p-3 sm:p-5`, and controls (symbol dropdowns, account switches, refresh buttons) scale down to `text-xs sm:text-sm` with tight `gap-2` on mobile.

## 6. T-Board Heatmap & Strike Column Transparency
- **No Opaque Overlays on Heatmap Cells**: When rows render dynamic risk or time-value background gradients (`rowBg`), middle anchor columns (such as `Strike Price` / 行权价) must maintain a transparent background.
- **Never use `bg-slate-100`, `bg-zinc-800` or similar opaque backgrounds** on strike `<th>` and `<td>`; doing so creates an unsightly broken stripe that occludes row continuity.
- **Use subtle border delimiters** (`border-l border-r ${themes[theme].border}`) and bold monospace typography (`font-bold font-mono text-[13px]`) to maintain legibility without breaking row colors.

## 7. Mobile Floating Action Button (FAB) Standards
- **Non-Obstructive Presentation**: Mobile floating buttons in corners must use reduced resting opacity (e.g. `opacity-40`, ramping up to `opacity-100` on tap/hover) and compact sizing (`p-2 sm:p-3`) to avoid obscuring underlying asset quotes and table rows.
- **State-Based Condensation**: When WebSocket is connected, collapse the status button into a subtle dot on the main refresh action, surfacing the standalone alert button only when disconnected.
- **Collapsible Toggles**: Support a minimal edge collapse tab (`isFabCollapsed`) so the user can stow the floating controls entirely when analyzing dense option chains.

## 8. Options Combination Leg Density in Modals
- Compress multi-leg combination configurators from ~170px vertical space per leg into compact ~50-60px horizontal strips.
- Emphasize immediate execution price, market depth / liquidity sufficiency, and an inline strike switcher instead of deep nested cards.

