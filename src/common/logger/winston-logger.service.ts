import { LoggerService } from '@nestjs/common';
import createLogger from './logger';

/**
 * Adapter that lets Nest's framework logs flow through the existing winston logger.
 * Wire it in main.ts via `app.useLogger(new WinstonLoggerService())`.
 */
export class WinstonLoggerService implements LoggerService {
  private readonly logger = createLogger();

  log(message: unknown, context?: string) {
    this.logger.info(String(message), { context });
  }

  error(message: unknown, trace?: string, context?: string) {
    this.logger.error(String(message), { trace, context });
  }

  warn(message: unknown, context?: string) {
    this.logger.warn(String(message), { context });
  }

  debug(message: unknown, context?: string) {
    this.logger.debug(String(message), { context });
  }

  verbose(message: unknown, context?: string) {
    this.logger.verbose(String(message), { context });
  }
}
