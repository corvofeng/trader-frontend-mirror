# StockSearch Component Documentation

The `StockSearch` component provides a searchable dropdown for stock selection.

## Key Features

- Real-time stock search
- Dropdown suggestions
- Mobile optimization
- Click-outside behavior
- Theme integration
- iOS zoom prevention

## Props

```typescript
interface StockSearchProps {
  onSelect: (stock: Stock) => void;
  selectedStockCode?: string;
}
```

## Component Structure

1. Search Input
   - Auto-focus behavior
   - Mobile-optimized input
   - Search icon
   - Placeholder text

2. Dropdown List
   - Stock suggestions
   - Highlighted selection
   - Empty state handling
   - Smooth animations

3. Interaction Handling
   - Click outside detection
   - Selection management
   - Focus management
   - Mobile touch handling

## Mobile Optimizations

- Prevents iOS zoom
- Optimized font size
- Touch-friendly targets
- Smooth interactions
- Proper text size adjustment

## Implementation Notes

- Uses refs for DOM interaction
- Implements debounced search
- Handles cleanup properly
- Maintains accessibility
- Provides visual feedback