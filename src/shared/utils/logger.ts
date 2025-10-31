type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const levelOrder: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// 获取当前日志级别，默认在开发环境为 'debug'，生产为 'warn'
const currentLevel: LogLevel = (import.meta as any)?.env?.VITE_LOG_LEVEL
  || ((import.meta as any)?.env?.DEV ? 'debug' : 'warn');

const shouldLog = (level: LogLevel) => levelOrder[level] <= levelOrder[currentLevel];

export const logger = {
  error: (...args: any[]) => {
    if (shouldLog('error')) console.error('[ERROR]', ...args);
  },
  warn: (...args: any[]) => {
    if (shouldLog('warn')) console.warn('[WARN]', ...args);
  },
  info: (...args: any[]) => {
    if (shouldLog('info')) console.info('[INFO]', ...args);
  },
  debug: (...args: any[]) => {
    if (shouldLog('debug')) console.debug('[DEBUG]', ...args);
  },
  level: currentLevel,
};