import { Module } from '@nestjs/common';
import { FormService } from './form.service';
import { SyncProcessor } from './sync.processor';
import { QueueModule } from '../queue/queue.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [QueueModule, SubscriptionsModule],
  providers: [FormService, SyncProcessor],
  exports: [FormService],
})
export class FormModule {}
