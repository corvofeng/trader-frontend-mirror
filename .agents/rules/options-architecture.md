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
