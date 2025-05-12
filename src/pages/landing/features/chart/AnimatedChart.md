# AnimatedChart Component Documentation

The `AnimatedChart` component provides an animated candlestick chart visualization.

## Key Features

- Real-time candlestick chart rendering
- Progressive data loading animation
- Volume histogram display
- Theme integration
- Responsive design
- Error handling and loading states
- Disabled user interactions
- Fixed scale and view

## Props

```typescript
interface AnimatedChartProps {
  theme: Theme;
}
```

## Technical Details

1. Chart Configuration
   - Transparent background
   - Theme-aware colors
   - Fixed time scale
   - Disabled user interactions
   - Auto-scaling

2. Data Visualization
   - Candlestick series
   - Volume histogram
   - Progressive loading
   - Smooth animations

3. State Management
   - Loading states
   - Error handling
   - Container readiness
   - Chart instance references

4. Responsive Behavior
   - Window resize handling
   - Container width adaptation
   - Content fitting

## Implementation Notes

- Uses lightweight-charts library
- Implements smooth data animation
- Handles cleanup on unmount
- Maintains chart references
- Provides visual feedback during loading