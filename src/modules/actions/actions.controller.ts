import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import createLogger from '../../common/logger/logger';
import { extractErrorInfo } from '../../common/logger/logger.utils';
import { UserService } from '../users/users.service';
import { QueueService } from '../queue/queue.service';
import { FormService } from '../form/form.service';
import { MondayAuthGuard } from '../../common/guards/monday-auth.guard';
import { MondaySession } from '../../common/interfaces/common.interface';
import { MondayWebhookPayload } from '../../common/interfaces/webhook.interface';

const logger = createLogger();

@Controller('actions')
export class ActionsController {
  constructor(
    private readonly userService: UserService,
    private readonly queueService: QueueService,
    private readonly formService: FormService,
  ) {}

  @Get('test')
  async testRoute(@Res() res: Response): Promise<void> {
    try {
      this.queueService.addSyncJob({
        userId: '123',
      });
      const users = await this.userService.getUsers();
      res.status(200).json({
        success: true,
        body: {
          users,
        },
      });
    } catch (error) {
      logger.error('actions-controller.test - Unknown error occurred!', { error: extractErrorInfo(error) });
      res.status(400).json({
        message: 'Unknown error occurred!',
        error,
      });
    }
  }

  @Post('sync-submission-to-monday')
  @UseGuards(MondayAuthGuard)
  async syncJotformSubmissionToMonday(
    @Body() body: MondayWebhookPayload,
    @Req() req: Request & { session: MondaySession },
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { payload } = body;
      const { userId, mondayAccessToken } = req.session;
      const inboundFieldValues = payload?.inboundFieldValues;
      const submissionId = inboundFieldValues?.id;
      const formId = inboundFieldValues?.formId;
      const formQuestions = inboundFieldValues?.formQuestions;
      const itemMapping = inboundFieldValues?.itemMapping;
      const boardId = inboundFieldValues?.boardId;

      if (!submissionId || !formId || !formQuestions || !itemMapping || !boardId) {
        logger.warn(
          `actions-controller.syncJotformSubmissionToMonday - Missing required inboundFieldValues. submissionID: ${submissionId}, formID: ${formId}`,
          { body },
        );
        res.status(400).json({
          success: false,
          message: 'payload.inboundFieldValues.id, formId, formQuestions, itemMapping and boardId are required',
        });
        return;
      }

      logger.info(
        `actions-controller.syncJotformSubmissionToMonday - Queueing sync job. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}, userId: ${userId}`,
      );

      const job = await this.formService.enqueueSyncJob({
        submissionId,
        formId,
        formQuestions,
        itemMapping,
        boardId,
        userId,
        mondayAccessToken,
      });

      res.status(200).json({
        success: true,
        message: 'Jotform submission queued for sync',
        jobId: job.id,
      });
    } catch (error) {
      logger.error(`actions-controller.syncJotformSubmissionToMonday - Error occurred`, {
        error: extractErrorInfo(error),
      });
      res.status(400).json({
        success: false,
        message: 'Unknown error occurred!',
      });
    }
  }
}
