import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../common/constants/queue.constant';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.SYNC_DATA,
      defaultJobOptions: {
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 10,
      },
    }),
    UsersModule, // MondayAuthGuard on the queue controller needs UserService
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
