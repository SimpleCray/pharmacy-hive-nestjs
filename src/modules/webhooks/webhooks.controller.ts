import { Body, Controller, Post, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { NoFilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import createLogger from '../../common/logger/logger';
import { extractErrorInfo } from '../../common/logger/logger.utils';
import * as geoip from 'geoip-lite';
import { JotformWebhookBody } from '../../common/interfaces/webhook.interface';
import { JotFormService } from '../jotform/jotform.service';
import { transformAnswer } from '../../common/utils/commonFunctions';
import { FormService } from '../form/form.service';
import { JotformWebhookSecretGuard } from '../../common/guards/jotform-webhook-secret.guard';

const logger = createLogger();

function detectSubmissionTimezoneFromIp(ipAddress: string | undefined): string | undefined {
  if (!ipAddress || typeof ipAddress !== 'string') return undefined;

  const lookup = geoip.lookup(ipAddress.trim());
  if (!lookup?.timezone) return undefined;

  return lookup.timezone;
}

@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly jotFormService: JotFormService,
    private readonly formService: FormService,
  ) {}

  /**
   * Jotform posts submissions as multipart/form-data; NoFilesInterceptor (multer().none())
   * parses the fields into the request body, mirroring the Express jotformWebhookMultipart middleware.
   */
  @Post('form-submission')
  @UseGuards(JotformWebhookSecretGuard)
  @UseInterceptors(NoFilesInterceptor())
  async handleJotformSubmissionWebhook(@Body() body: JotformWebhookBody, @Res() res: Response): Promise<void> {
    try {
      const { submissionID, formID, ip } = body;

      if (!submissionID || !formID) {
        logger.warn(
          `webhooks-controller.handleJotformSubmissionWebhook - Missing required payload fields. submissionID: ${submissionID}, formID: ${formID}`,
          {
            payload: body,
          },
        );
        res.status(400).json({ success: false, message: 'submissionID and formID are required' });
        return;
      }

      const detailResponse = await this.jotFormService.getSubmissionData(submissionID);
      const submissionTimezone = detectSubmissionTimezoneFromIp(ip || detailResponse.content.ip);
      const formData = transformAnswer(detailResponse.content.answers || {}, { submissionTimezone });

      logger.info(
        `webhooks-controller.handleJotformSubmissionWebhook - New Jotform submission webhook received. submissionID: ${submissionID}, formID: ${formID}`,
        {
          submissionID,
          formID,
          submissionTimezone,
          formData: formData,
        },
      );

      this.formService.handleFormSubmissionWebhook({
        submissionId: submissionID,
        formId: formID,
        formData: formData,
      });

      res.status(200).json({ success: true });
    } catch (error: unknown) {
      const errorInfo = extractErrorInfo(error);
      logger.error('webhooks-controller.handleJotformSubmissionWebhook - Error processing webhook', { error: errorInfo });
      res.status(500).json({ success: false, error: errorInfo || 'Internal server error' });
    }
  }
}
