import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { Request } from 'express';
import createLogger from '../logger/logger';
import { extractErrorInfo } from '../logger/logger.utils';
import { UserService } from '../../modules/users/users.service';
import { MondaySession } from '../interfaces/common.interface';

const logger = createLogger();

/**
 * Replaces the Express `validateMondayRequest` middleware.
 * Verifies the Monday JWT in the Authorization header, loads the user, and
 * attaches `session` to the request for downstream handlers.
 */
@Injectable()
export class MondayAuthGuard implements CanActivate {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { session?: MondaySession }>();
    try {
      const { authorization } = req.headers;

      if (!authorization) {
        logger.info('monday-auth.guard - no token provided', {
          remediation: 'Authorization token should be in authorization header',
        });
        throw new UnauthorizedException({ error: 'Not authenticated' });
      }

      const signingSecret = this.configService.get<string>('MONDAY_SIGNING_SECRET', '');
      const { accountId, userId } = jwt.verify(authorization, signingSecret) as MondaySession;

      const user = await this.userService.findUserByAccountId(accountId);
      if (!user) {
        logger.info('monday-auth.guard - no user found in the database', {
          remediation: 'User should follow the authorization process',
        });
        throw new UnauthorizedException({ error: 'Not authenticated' });
      }

      (req as unknown as { session?: MondaySession }).session = {
        accountId,
        userId,
        mondayAccessToken: user.monday_access_token as string,
        user,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      logger.error('monday-auth.guard - request authorization has failed', {
        remediation: 'Authorization token should be in authorization header',
        error: extractErrorInfo(error),
      });
      throw new UnauthorizedException({ error: 'Not authenticated' });
    }
  }
}
