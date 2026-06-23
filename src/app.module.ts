import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';

import { envValidationSchema, EnvKey } from './config/env.validation';
import databaseConfig from './config/database';
import { AppController } from './app.controller';

import User from './models/user.model';
import MondaySubscription from './models/monday-subscription.model';
import SyncedFormSubmission from './models/synced-form-submission.model';

import { AuthModule } from './modules/auth/auth.module';
import { FieldsModule } from './modules/fields/fields.module';
import { ActionsModule } from './modules/actions/actions.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { QueueModule } from './modules/queue/queue.module';
import { FormModule } from './modules/form/form.module';
import { TasksModule } from './modules/tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),

    // Database — Sequelize (kept from the Express app; models use sequelize-typescript).
    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>(EnvKey.NODE_ENV, 'development');
        const dbConfig = databaseConfig[nodeEnv];
        return {
          dialect: dbConfig.dialect,
          host: dbConfig.host,
          port: parseInt(dbConfig.port, 10),
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          logging: dbConfig.logging || false,
          ...(dbConfig.storage ? { storage: dbConfig.storage } : {}),
          models: [User, MondaySubscription, SyncedFormSubmission],
          // Mirrors the Express app's sequelize.sync({ force: false }) on boot.
          // Set to false and rely on migrations (npm run db:migrate) for production.
          synchronize: true,
        };
      },
    }),

    // BullMQ / Redis connection (shared by all queues).
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>(EnvKey.REDIS_HOST, 'localhost'),
          port: parseInt(config.get<string>(EnvKey.REDIS_PORT, '6379'), 10),
          password: config.get<string>(EnvKey.REDIS_PASSWORD, '') || '',
          maxRetriesPerRequest: null,
        },
      }),
    }),

    ScheduleModule.forRoot(),

    AuthModule,
    FieldsModule,
    ActionsModule,
    SubscriptionsModule,
    WebhooksModule,
    QueueModule,
    FormModule,
    TasksModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
