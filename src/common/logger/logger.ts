import { WinstonTransport } from '@appsignal/nodejs';
import winston from 'winston';

let logger: winston.Logger | null = null;

const resetLogger = (): void => {
  logger = null;
};

const SENSITIVE_KEYS = new Set(['shortLivedToken', 'mondayAccessToken', 'accessToken', 'encryptedData', 'token']);

type LogObject = Record<string, unknown>;

const flatten = (obj: LogObject, prefix = ''): LogObject => {
  const acc: LogObject = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (SENSITIVE_KEYS.has(key)) {
      acc[fullKey] = 'REDACTED';
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
          Object.assign(acc, flatten(v as LogObject, `${fullKey}.${i}`));
        } else {
          acc[`${fullKey}.${i}`] = v;
        }
      });
    } else if (typeof value === 'object' && value !== null && !(value instanceof Date) && !(value instanceof Error)) {
      Object.assign(acc, flatten(value as LogObject, fullKey));
    } else {
      acc[fullKey] = value;
    }
  }

  return acc;
};

const createLogger = (): winston.Logger => {
  if (logger) return logger;

  const transports: winston.transport[] = [];

  if (process.env.NODE_ENV !== 'development') {
    try {
      const appsignalTransport = new WinstonTransport({
        group: 'app',
        level: 'debug',
      });
      transports.push(appsignalTransport);
    } catch (error) {
      console.error('❌ Failed to create AppSignal Winston transport:', error);
    }
  }

  transports.push(
    new winston.transports.Console({
      format: winston.format.simple(),
      log: (info, callback) => {
        // Also log to native console methods for DevTools in development only
        if (process.env.NODE_ENV === 'development') {
          const level = info.level;
          const message = info.message;

          // Extract data from Symbol(splat) - this contains the original arguments
          const splatSymbol = Object.getOwnPropertySymbols(info).find((sym) => sym.toString() === 'Symbol(splat)');
          const splatData = splatSymbol ? (info as Record<symbol, unknown>)[splatSymbol] : [];

          switch (level) {
            case 'error':
              console.error(`❌ ${message}`, ...(splatData as unknown[]));
              break;
            case 'warn':
              console.warn(`⚠️ ${message}`, ...(splatData as unknown[]));
              break;
            case 'info':
              console.info(`ℹ️  - ${message}`, ...(splatData as unknown[]));
              break;
            case 'debug':
              console.debug(`🐛 ${message}`, ...(splatData as unknown[]));
              break;
            default:
              console.log(`📝 ${message}`, ...(splatData as unknown[]));
          }
        }

        callback();
      },
    }),
  );

  logger = winston.createLogger({
    level: 'debug',
    transports,
    format: winston.format.combine(
      winston.format((info) => {
        const flattened = flatten(info as LogObject);
        return { ...info, ...flattened };
      })(),
      winston.format.json(),
    ),
  });

  logger.info('logger - running');
  return logger;
};

export { resetLogger };
export default createLogger;
