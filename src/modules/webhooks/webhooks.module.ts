import { Module } from '@nestjs/common';
import { WebhookController } from './webhooks.controller';
import { JotformModule } from '../jotform/jotform.module';
import { FormModule } from '../form/form.module';

@Module({
  imports: [JotformModule, FormModule],
  controllers: [WebhookController],
})
export class WebhooksModule {}
