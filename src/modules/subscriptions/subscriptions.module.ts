import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import MondaySubscription from '../../models/monday-subscription.model';
import SyncedFormSubmission from '../../models/synced-form-submission.model';
import { SubscriptionService } from './subscriptions.service';
import { SyncedFormSubmissionService } from './synced-form-submission.service';
import { SubscriptionsController } from './subscriptions.controller';
import { JotformModule } from '../jotform/jotform.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [SequelizeModule.forFeature([MondaySubscription, SyncedFormSubmission]), JotformModule, UsersModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionService, SyncedFormSubmissionService],
  exports: [SubscriptionService, SyncedFormSubmissionService],
})
export class SubscriptionsModule {}
