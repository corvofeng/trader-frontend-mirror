# MainLayout Component Documentation

The `MainLayout` component serves as the main layout wrapper for the application.

## Key Features

- Consistent layout structure
- Navigation integration
- Theme application
- Toast notifications
- Conditional navigation display

## Props

- `children`: Child components
- `user`: User information
- `theme`: Active theme
- `mobileMenuOpen`: Mobile menu state
- `showThemeDropdown`: Theme dropdown visibility
- `onThemeChange`: Theme change handler
- `onSignIn`: Sign in handler
- `onSignOut`: Sign out handler
- `onMobileMenuToggle`: Mobile menu toggle
- `onThemeDropdownToggle`: Theme dropdown toggle

## Layout Structure

```
MainLayout
├── Toast Container
├── Navigation (conditional)
└── Content Area
```

## Theme Integration

- Background colors
- Transition effects
- Component styling
- Dynamic theme application

## Responsive Design

- Full-height layout
- Proper spacing
- Mobile optimization
- Flexible content area