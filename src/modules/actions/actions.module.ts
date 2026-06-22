import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { UsersModule } from '../users/users.module';
import { QueueModule } from '../queue/queue.module';
import { FormModule } from '../form/form.module';

@Module({
  imports: [UsersModule, QueueModule, FormModule],
  controllers: [ActionsController],
})
export class ActionsModule {}
