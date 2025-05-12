# Production Services Documentation

This module provides production-ready service implementations for the application's core functionality.

## Authentication Service

The authentication service handles user sessions and authentication:

- User session verification via `/api/check`
- User data retrieval from `/api/user`
- Sign-in redirection to `/api/user`
- Sign-out redirection to `/api/logout`

## Trade Service

Manages trade operations through RESTful endpoints:

- **GET** `/api/actions` - Retrieve trades with filtering support
  - Filter by stock code
  - Filter by status
  - Returns filtered trades list
- **POST** `/api/actions` - Create new trades
  - Validates trade data
  - Returns created trade with ID
- **PUT** `/api/actions` - Update existing trades
  - Handles status changes
  - Updates trade details

## Stock Service

Provides stock market data and information:

- **GET** `/api/stocks` - List all available stocks
- **GET** `/api/stocks/search` - Search stocks by query
- **GET** `/api/stocks/{symbol}/history` - Fetch historical data
- **GET** `/api/stocks/{symbol}/price` - Get current price

## Portfolio Service

Manages user portfolio data:

- **GET** `/api/portfolio/{userId}` - Retrieve holdings
- **GET** `/api/portfolio/{userId}/recent-trades` - Get recent trades
  - Supports date range filtering
  - Returns completed trades within range

## Currency Service

Handles currency preferences:

- **GET** `/api/settings/currency` - Get current currency setting
- **PUT** `/api/settings/currency` - Update currency preference

## Operations Service

Monitors system operations:

- **GET** `/api/operations` - Fetch operation logs
  - Supports date range filtering
  - Returns operation status and details

## Error Handling

All services implement consistent error handling:

- Network error detection
- Response validation
- Error message formatting
- Console logging for debugging

## API Response Format

Standard response structure:

```typescript
interface ServiceResponse<T> {
  data: T | null;
  error: Error | null;
}
```

## Security

- Authentication required for protected endpoints
- HTTPS enforced for all requests
- Request validation and sanitization
- Error messages sanitized for production

## Integration Points

- REST API endpoints
- JSON request/response format
- Bearer token authentication
- Query parameter support
- Date range filtering