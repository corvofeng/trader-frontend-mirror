type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const levelOrder: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// 获取当前日志级别，默认在开发环境为 'debug'，生产为 'warn'
const currentLevel: LogLevel = (import.meta as unknown as { env?: Record<string, unknown> })?.env?.VITE_LOG_LEVEL as LogLevel
  || (((import.meta as unknown as { env?: Record<string, unknown> })?.env?.DEV as boolean) ? 'debug' : 'warn');

const shouldLog = (level: LogLevel) => levelOrder[level] <= levelOrder[currentLevel];

export const logger = {
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error('[ERROR]', ...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn('[WARN]', ...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.info('[INFO]', ...args);
  },
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.debug('[DEBUG]', ...args);
  },
  level: currentLevel,
};
