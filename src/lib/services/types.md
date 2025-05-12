# Service Types Documentation

This module defines the core type definitions for application services.

## Key Features

- Type definitions for all services
- Response type structures
- Error handling types
- Shared interfaces

## Type Definitions

### ServiceResponse<T>
- Generic response wrapper
- Data payload
- Error handling
- Type safety

### Stock Data Types
- Basic stock information
- OHLCV data structure
- Real-time price updates
- Historical data format

### Service Interfaces

1. AuthService
   - User authentication
   - Session management
   - Profile operations

2. TradeService
   - Trade operations
   - Status management
   - Notes handling
   - History tracking

3. StockService
   - Stock information
   - Name resolution
   - Symbol management
   - Historical data retrieval

4. PortfolioService
   - Holdings management
   - Performance tracking
   - Trade history

5. CurrencyService
   - Currency preferences
   - Format configuration
   - Exchange rates

## Integration

- Used by both mock and production implementations
- Ensures consistent service interfaces
- Maintains type safety
- Defines error handling patterns