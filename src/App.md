# App Component Documentation

The `App` component serves as the main application container and handles:

- Routing between Landing and Journal pages
- Global state management for:
  - User authentication
  - Selected stock
  - Theme preferences
  - Mobile menu state
  - Theme dropdown visibility
- Integration with mock authentication service
- Theme persistence using localStorage

## Key Features

- Responsive layout with mobile menu support
- Theme switching between light, dark, and blue themes
- User authentication flow
- Stock selection management
- Real-time theme updates across components

## Component Structure

```
App
├── Router
└── AppContent
    ├── MainLayout
    │   ├── Navigation
    │   └── Children Routes
    ├── Landing Page
    └── Journal Page
```

## State Management

- `user`: Tracks current authenticated user
- `selectedStock`: Manages currently selected stock
- `theme`: Controls application theme
- `mobileMenuOpen`: Controls mobile menu visibility
- `showThemeDropdown`: Manages theme selector dropdown

## Theme Handling

- Persists theme preference in localStorage
- Provides theme context to all child components
- Supports real-time theme switching