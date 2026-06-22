import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { MondaySession } from '../../common/interfaces/common.interface';
import { SubscriptionService } from './subscriptions.service';
import { extractErrorInfo } from '../../common/logger/logger.utils';
import createLogger from '../../common/logger/logger';
import { JotFormService } from '../jotform/jotform.service';
import { SubscriptionEnum } from '../../common/interfaces/subscription.interface';
import { MondaySubscribeRequestBody, MondayUnsubscribeRequestBody } from '../../common/interfaces/fields.interface';
import { MondayAuthGuard } from '../../common/guards/monday-auth.guard';
import { EnvKey } from '../../config/env.validation';

const logger = createLogger();

function webhookUrlWithSecret(appUrl: string, appSecret: string): string {
  const root = appUrl.replace(/\/$/, '');
  const url = new URL(`${root}/api/webhooks/form-submission`);
  url.searchParams.set('secret', appSecret);
  return url.href;
}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly jotFormService: JotFormService,
    private readonly configService: ConfigService,
  ) {}

  @Post('form-submit/subscribe')
  @UseGuards(MondayAuthGuard)
  async handleSubscribe(
    @Body() body: MondaySubscribeRequestBody,
    @Req() req: Request & { session: MondaySession },
    @Res() res: Response,
  ): Promise<void> {
    // Router-level webhookType injection from the Express app.
    body.webhookType = SubscriptionEnum.FORM_SUBMISSION;
    try {
      const { accountId, userId, user } = req.session;
      const { payload, webhookType } = body;
      const { webhookUrl, subscriptionId } = payload;
      const formId = payload.inboundFieldValues?.formList?.value;

      const logPrefix = `subscription-controller.${webhookType.toLowerCase()}`;

      logger.info(`${logPrefix} - subscribe to ${webhookType.toLowerCase()} updates. User ID: ${userId}, account ID: ${accountId}`, {
        userId,
        accountId,
        payload,
      });

      if (webhookType === SubscriptionEnum.FORM_SUBMISSION) {
        if (!formId) {
          logger.warn(`${logPrefix} - formId is required for form submission subscription`);
          res.status(400).send({ message: 'formId is required' });
          return;
        }

        const appUrl = this.configService.get<string>(EnvKey.APP_URL, '');
        const appSecret = this.configService.get<string>(EnvKey.APP_SECRET, '');
        const jotformWebhookUrl = webhookUrlWithSecret(appUrl, appSecret);
        try {
          await this.jotFormService.addWebhook(formId, jotformWebhookUrl);
        } catch (error: any) {
          const errorMessage = error?.response?.data?.message;
          if (typeof errorMessage === 'string' && errorMessage.includes('is already in WebHooks List')) {
            logger.warn(`${logPrefix} - Webhook already exists for form. formID: ${formId}`);
          } else {
            logger.error(`${logPrefix} - Error adding webhook to form. formID: ${formId}`, { error: extractErrorInfo(error) });
            throw error;
          }
        }
      }

      const subscription = await this.subscriptionService.createSubscription({
        monday_user_id: user.id,
        webhook_url: webhookUrl,
        subscription_id: subscriptionId,
        webhook_type: webhookType,
        form_id: webhookType === SubscriptionEnum.FORM_SUBMISSION ? formId : null,
      });

      logger.info(`${logPrefix} - Subscription ${subscription.id} created`);
      res.status(200).send({ webhookId: subscription.id });
    } catch (err: unknown) {
      const error = err as Error;
      const logPrefix = `subscription-controller.${body.webhookType?.toLowerCase() || 'unknown'}`;
      logger.error(`${logPrefix} - An unknown error has occurred: ${error.message}`, { error: extractErrorInfo(error) });
      res.status(400).send({ message: 'an error has occurred' });
    }
  }

  @Post('form-submit/unsubscribe')
  @UseGuards(MondayAuthGuard)
  async handleUnsubscribe(@Body() body: MondayUnsubscribeRequestBody, @Res() res: Response): Promise<void> {
    body.webhookType = SubscriptionEnum.FORM_SUBMISSION;
    try {
      const { payload, webhookType } = body;
      const { webhookId } = payload;

      const logPrefix = `subscription-controller.${webhookType.toLowerCase()}`;

      logger.info(`${logPrefix} - unsubscribe from ${webhookType.toLowerCase()} updates`, { webhookId });

      if (webhookType === SubscriptionEnum.FORM_SUBMISSION) {
        const subscription = await this.subscriptionService.findSubscription({ id: webhookId });
        if (!subscription) {
          logger.warn(`${logPrefix} - Subscription ${webhookId} not found`);
          res.status(400).send({ message: 'Subscription not found' });
          return;
        }

        const formId = subscription.form_id;
        if (formId) {
          const formSubscriptionCount = await this.subscriptionService.countSubscriptions(formId);
          /** If there is only one subscription for this form, delete the Jotform webhook */
          if (formSubscriptionCount === 1) {
            const appUrl = this.configService.get<string>(EnvKey.APP_URL, '');
            const appSecret = this.configService.get<string>(EnvKey.APP_SECRET, '');
            const jotformWebhookUrl = webhookUrlWithSecret(appUrl, appSecret);
            await this.jotFormService.deleteWebhookByUrl(formId, jotformWebhookUrl);
          } else {
            logger.info(`${logPrefix} - Skipping Jotform webhook delete; ${formSubscriptionCount - 1} subscription(s) still use this webhook`, {
              formId,
              webhookId,
            });
          }
        }
      }

      await this.subscriptionService.deleteSubscription({ id: webhookId });
      logger.info(`${logPrefix} - Subscription ${webhookId} deleted`);
      res.status(200).send({ webhookId });
    } catch (err: unknown) {
      const error = err as Error;
      const logPrefix = `subscription-controller.${body.webhookType?.toLowerCase() || 'unknown'}`;
      logger.error(`${logPrefix} - An unknown error has occurred: ${error.message}`, { error: extractErrorInfo(error) });
      res.status(400).send({ message: 'an error has occurred' });
    }
  }
}
