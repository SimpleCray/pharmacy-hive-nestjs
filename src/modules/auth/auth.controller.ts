import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import randomstring from 'randomstring';
import createLogger from '../../common/logger/logger';
import { UserService } from '../users/users.service';
import { EnvKey } from '../../config/env.validation';

const logger = createLogger();

@Controller('auth')
export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async authoriseMonday(@Query('token') token: string, @Res() res: Response): Promise<void> {
    logger.info('auth-controller.authoriseMonday - Attempt to authorise user');
    const signingSecret = this.configService.get<string>(EnvKey.MONDAY_SIGNING_SECRET, '');
    const clientId = this.configService.get<string>(EnvKey.MONDAY_CLIENT_ID, '');
    const redirectUrl = this.configService.get<string>(EnvKey.MONDAY_REDIRECT_URL, '');

    try {
      jwt.verify(token, signingSecret);
    } catch (err) {
      logger.warn('auth-controller.authoriseMonday - Error occured while validating monday token', { err });
      res.status(400).send('<html><body><h1>Authorisation error</h1><p>Invalid Monday token.</p></body></html>');
      return;
    }

    const decoded = jwt.verify(token, signingSecret) as {
      accountId: string;
      userId: string;
      backToUrl: string;
    };
    const { accountId, userId, backToUrl } = decoded;
    logger.info('auth-controller.authoriseMonday - Authorise user', {
      account_id: accountId,
      user_id: userId,
    });

    let user = await this.userService.findUserByAccountId(accountId);
    if (!user) {
      user = await this.userService.createUser({
        monday_user_id: userId,
        monday_account_id: accountId,
      });
    }

    if (user.monday_access_token) {
      logger.info('auth-controller.authoriseMonday - User has already authorised monday.com', { account_id: accountId, user_id: userId });
      logger.info('auth-controller.authoriseMonday - Redirect to monday.com', { account_id: accountId, user_id: userId });
      res.redirect(backToUrl);
      return;
    }

    logger.info('auth-controller.authoriseMonday - Redirect to monday.com Oauth', { account_id: accountId, user_id: userId });
    const state = randomstring.generate();
    const oauthUrl = `https://auth.monday.com/oauth2/authorize?client_id=${clientId}&state=${state}&redirect_uri=${redirectUrl}`;
    res
      .cookie('state', state)
      .cookie('userId', userId)
      .cookie('accountId', accountId)
      .cookie('backToUrl', backToUrl)
      .redirect(oauthUrl);
  }

  @Get('callback')
  async authoriseMondayCallback(@Req() req: Request, @Res() res: Response): Promise<Response | void> {
    logger.info('auth-controller.mondayCallback - Attempt to authorise user');

    const { code, state, error, error_description } = req.query as Record<string, string>;
    const { state: cookieState, userId, accountId, backToUrl } = req.cookies;

    if (error) {
      logger.warn('auth-controller.mondayCallback - Error occured while authorising user', { error, error_description, userId, accountId });
      return res.status(400).send(`An error has occured, please try again - ${error_description}`);
    }

    if (state !== cookieState) {
      logger.warn('auth-controller.mondayCallback - State does not match', { state, cookieState, userId, accountId });
      return res.status(400).send('Invalid state, please try again');
    }

    const user = await this.userService.findUserByAccountId(accountId);
    if (!user) {
      logger.warn('auth-controller.mondayCallback - User not found', { userId, accountId });
      return res.status(400).send('Invalid state, please try again');
    }

    try {
      const response = await axios.post('https://auth.monday.com/oauth2/token', {
        code,
        client_id: this.configService.get<string>(EnvKey.MONDAY_CLIENT_ID, ''),
        client_secret: this.configService.get<string>(EnvKey.MONDAY_CLIENT_SECRET, ''),
        redirect_uri: this.configService.get<string>(EnvKey.MONDAY_REDIRECT_URL, ''),
      });

      const accessToken = response.data.access_token;
      if (!accessToken) {
        logger.warn('auth-controller.mondayCallback - Access token not found', { userId, accountId, response: response.data });
        return res.status(400).send('An error has occured, please try again');
      }

      await this.userService.updateUser(user, { monday_access_token: accessToken });
      logger.info('auth-controller.authoriseMonday - Redirect to monday.com', { account_id: accountId, user_id: userId });
      return res.redirect(backToUrl);
    } catch (err: any) {
      if (err.response) {
        logger.error('auth-controller.handleWebhook - an unknown error has occured requesting monday.com access token', {
          error: err.response.data,
          userId,
          accountId,
        });
      } else {
        logger.error('auth-controller.handleWebhook - an unknown error has occured requesting monday.com access token', {
          error: err.data,
          userId,
          accountId,
        });
      }
      return res.status(400).json({ error: 'An error has occured, please try again' });
    }
  }
}
