import crypto from 'crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import createLogger from '../logger/logger';

const logger = createLogger();

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function querySecret(req: Request): string {
  const raw = req.query.secret;
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === 'string') {
    return raw[0];
  }
  return '';
}

/**
 * Requires query param `secret` to match APP_SECRET (timing-safe).
 * Replaces the Express `jotformWebhookSecretQuery` middleware.
 */
@Injectable()
export class JotformWebhookSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const appSecret = this.configService.get<string>('APP_SECRET', '');

    const provided = querySecret(req);
    if (!timingSafeEqualStrings(provided, appSecret)) {
      logger.warn('jotform-webhook-secret - Invalid or missing secret query param', {
        path: req.path,
      });
      throw new ForbiddenException({ success: false, message: 'Unauthorized webhook request' });
    }

    return true;
  }
}
