# Landing Page Documentation

The Landing component serves as the application's homepage with engaging visuals and key feature highlights.

## Key Features

- Hero section
- Feature showcase
- Interactive chart
- Call-to-action buttons
- Responsive design

## Props

```typescript
interface LandingProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}
```

## Page Structure

```
Landing/
├── Hero Section
│   ├── Title
│   ├── Subtitle
│   └── CTA Buttons
├── Chart Demo
│   └── AnimatedChart
├── Portfolio Preview
│   ├── Holdings Cards
│   └── Performance Stats
└── Features Grid
    ├── Real-time Tracking
    ├── Performance Analytics
    └── Trade Journal
```

## Sections

1. Hero
   - Engaging headline
   - Clear value proposition
   - Strong call-to-action
   - Theme toggle

2. Demo Section
   - Interactive chart
   - Real-time animation
   - Theme integration

3. Portfolio Preview
   - Sample holdings
   - Performance metrics
   - Visual indicators

4. Features
   - Key benefits
   - Visual icons
   - Clear descriptions

## Mobile Optimizations

- Responsive layout
- Touch-friendly buttons
- Optimized spacing
- Improved readability