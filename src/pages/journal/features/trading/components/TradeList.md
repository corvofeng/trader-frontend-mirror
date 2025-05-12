# TradeList Component Documentation

The `TradeList` component displays and manages a list of trades with filtering and status management.

## Key Features

- Trade filtering
- Status management
- Notes editing
- Manual refresh
- Expandable details
- Loading states
- Error handling

## Props

```typescript
interface TradeListProps {
  selectedStockCode?: string;
  theme: Theme;
}
```

## Component Structure

1. Header Section
   - Filter controls
   - Refresh button
   - Stock selection display
   - Status filter

2. Trade Items
   - Operation type
   - Status indicators
   - Price information
   - Time stamps
   - Expandable details

3. Trade Actions
   - Status updates
   - Notes editing
   - Expansion toggle
   - Refresh functionality

## State Management

- Loading states
- Refresh states
- Filter selection
- Expanded items
- Note editing
- Trade updates

## Mobile Optimizations

- Responsive layout
- Touch-friendly controls
- Proper spacing
- Clear visual hierarchy

## Implementation Notes

- Manual refresh mechanism
- Optimized re-renders
- Error handling
- Loading feedback
- Clean animations