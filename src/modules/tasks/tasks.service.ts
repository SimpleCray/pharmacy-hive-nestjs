import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { syncData } from '../../jobs/syncData';

/**
 * Replaces the node-cron schedule from the Express app's ExpressApp.setupCronJobs.
 * Runs daily at midnight.
 */
@Injectable()
export class TasksService {
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleDailyMidnightSync() {
    syncData();
  }
}
