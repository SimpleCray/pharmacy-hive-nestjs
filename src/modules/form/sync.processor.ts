import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import createLogger from '../../common/logger/logger';
import { extractErrorInfo } from '../../common/logger/logger.utils';
import { QUEUE_JOB_TYPES, QUEUE_NAMES } from '../../common/constants/queue.constant';
import { FormService } from './form.service';

const logger = createLogger();

/**
 * Replaces the standalone BullMQ Worker from the Express app.
 * Concurrency 5 mirrors the original worker configuration.
 */
@Processor(QUEUE_NAMES.SYNC_DATA, { concurrency: 5 })
export class SyncProcessor extends WorkerHost {
  constructor(private readonly formService: FormService) {
    super();
  }

  async process(job: Job): Promise<any> {
    try {
      switch (job.data.type) {
        case QUEUE_JOB_TYPES.TEST:
          return;
        case QUEUE_JOB_TYPES.SYNC_FORM_SUBMISSION_TO_MONDAY:
          return this.formService.processSyncJotformSubmissionToMonday({
            submissionId: job.data.submissionId,
            formId: job.data.formId,
            formQuestions: job.data.formQuestions || {},
            itemMapping: job.data.itemMapping || {},
            boardId: job.data.boardId,
            userId: job.data.userId,
            mondayAccessToken: job.data.mondayAccessToken,
          });
        default:
          return { success: true };
      }
    } catch (error) {
      logger.error(`Error processing job ${job.id}`, { error: extractErrorInfo(error) });
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    if (process.env.NODE_ENV === 'development') {
      logger.info(`Job ${job.id} completed successfully`, {
        jobId: job.id,
        jobName: job.name,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    logger.error(`Job ${job?.id} failed`, {
      jobId: job?.id,
      jobName: job?.name,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    logger.warn(`Job ${jobId} stalled`, { jobId, timestamp: new Date().toISOString() });
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    logger.error('Worker error', { error: extractErrorInfo(error) });
  }
}
