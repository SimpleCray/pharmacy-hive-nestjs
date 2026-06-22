import { Controller, Get, HttpStatus, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { QueueService } from './queue.service';
import createLogger from '../../common/logger/logger';
import { extractErrorInfo } from '../../common/logger/logger.utils';
import { MondayAuthGuard } from '../../common/guards/monday-auth.guard';

const logger = createLogger();

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  /**
   * Get queue metrics and statistics
   * GET /api/queue/metrics
   */
  @Get('metrics')
  async getMetrics(@Res() res: Response) {
    try {
      const stats = await this.queueService.getQueueStats();
      const detailedStats = await this.queueService.getDetailedQueueStats();

      res.status(HttpStatus.OK).send({
        success: true,
        data: {
          ...stats,
          ...detailedStats,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting queue metrics', { error: extractErrorInfo(error) });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to retrieve queue metrics',
      });
    }
  }

  /**
   * Get job status by ID
   * GET /api/queue/jobs/:jobId
   */
  @Get('jobs/:jobId')
  @UseGuards(MondayAuthGuard)
  async getJob(@Param('jobId') jobId: string, @Res() res: Response) {
    try {
      const jobStatus = await this.queueService.getJobStatus(jobId);

      if (!jobStatus) {
        throw new NotFoundException({ success: false, error: 'Job not found' });
      }

      res.status(HttpStatus.OK).json({
        success: true,
        data: jobStatus,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json(error.getResponse());
        return;
      }
      logger.error('Error getting job status', { error: extractErrorInfo(error) });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to retrieve job status',
      });
    }
  }
}
