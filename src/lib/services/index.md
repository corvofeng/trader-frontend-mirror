# Services Module Documentation

The services module provides a unified interface for accessing application services with environment-specific implementations.

## Key Features

- Environment-based service selection (development vs production)
- Unified service interfaces
- Type-safe implementations
- Automatic service resolution

## Service Types

1. Authentication Service
   - User management
   - Sign in/out operations
   - Session handling

2. Trade Service
   - Trade operations
   - Status management
   - Notes management

3. Stock Service
   - Stock information
   - Name resolution

## Environment Handling

- Development: Uses mock implementations
- Production: Uses actual service implementations
- Automatic detection via `import.meta.env.DEV`

## Usage

```typescript
import { authService, tradeService, stockService } from './services';

// Services are automatically resolved based on environment
const user = await authService.getUser();
```

## Integration Points

- Mock data service in development
- Production service implementations
- Type definitions
- Error handling