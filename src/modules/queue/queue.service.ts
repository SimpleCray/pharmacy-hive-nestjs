import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import createLogger from '../../common/logger/logger';
import { extractErrorInfo } from '../../common/logger/logger.utils';
import { QUEUE_NAMES } from '../../common/constants/queue.constant';

const logger = createLogger();

@Injectable()
export class QueueService {
  constructor(@InjectQueue(QUEUE_NAMES.SYNC_DATA) private readonly syncQueue: Queue) {}

  /**
   * Add a job to the sync data queue
   */
  async addSyncJob(data: any, options?: { priority?: number; delay?: number }) {
    try {
      const job = await this.syncQueue.add('sync-data', data, {
        priority: options?.priority || 0,
        delay: options?.delay || 0,
      });
      return job;
    } catch (error) {
      logger.error('Error adding sync job to queue:', { error: extractErrorInfo(error) });
      throw error;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string) {
    try {
      const job = await this.syncQueue.getJob(jobId);
      if (!job) {
        return null;
      }
      return {
        id: job.id,
        name: job.name,
        data: job.data,
        status: await job.getState(),
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
      };
    } catch (error) {
      logger.error(`Error getting job status for ${jobId}:`, { error: extractErrorInfo(error) });
      throw error;
    }
  }

  /**
   * Remove a job from the queue
   */
  async removeJob(jobId: string) {
    try {
      const job = await this.syncQueue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info(`Removed job ${jobId} from queue`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Error removing job ${jobId}:`, { error: extractErrorInfo(error) });
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    try {
      const stats = await this.syncQueue.getJobCounts();
      return stats;
    } catch (error) {
      logger.error('Error getting queue stats:', { error: extractErrorInfo(error) });
      throw error;
    }
  }

  /**
   * Get detailed queue statistics including metrics
   */
  async getDetailedQueueStats() {
    try {
      const queue = this.syncQueue;
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      const jobCounts = await queue.getJobCounts();
      const paused = jobCounts.paused || 0;

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused,
        total: waiting + active + completed + failed + delayed + paused,
      };
    } catch (error) {
      logger.error('Error getting detailed queue stats:', { error: extractErrorInfo(error) });
      throw error;
    }
  }
}
