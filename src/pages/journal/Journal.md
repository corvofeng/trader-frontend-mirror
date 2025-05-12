# Journal Page Documentation

The Journal component provides a comprehensive trading journal interface with multiple functional tabs.

## Key Features

- Tab-based navigation
- Stock search integration
- Portfolio management
- Trade operations
- Analysis tools

## Props

```typescript
interface JournalProps {
  selectedStock: Stock | null;
  theme: Theme;
  onStockSelect: (stock: Stock) => void;
}
```

## Page Structure

```
Journal/
├── Stock Search
├── Tab Navigation
└── Content Areas
    ├── Portfolio
    ├── Trading
    ├── History
    ├── Analysis
    └── Settings
```

## Tabs

1. Portfolio
   - Holdings overview
   - Performance metrics
   - Recent trades

2. Trading
   - Trade form
   - Active trades
   - Quick actions

3. History
   - Trade history
   - Filtering
   - Status management

4. Analysis
   - Performance metrics
   - Charts and graphs
   - Statistics

5. Settings
   - User preferences
   - Account settings
   - Customization

## Mobile Optimizations

- Responsive layout
- Touch-friendly tabs
- Optimized forms
- Improved navigation