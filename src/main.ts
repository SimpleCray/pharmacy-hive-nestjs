import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Appsignal } from '@appsignal/nodejs';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Request, Response, NextFunction } from 'express';

import { AppModule } from './app.module';
import { EnvKey } from './config/env.validation';
import { QUEUE_NAMES } from './common/constants/queue.constant';
import createLogger, { resetLogger } from './common/logger/logger';
import { extractErrorInfo } from './common/logger/logger.utils';
import { WinstonLoggerService } from './common/logger/winston-logger.service';

async function bootstrap() {

  if (process.env.NODE_ENV !== 'development') {
  // AppSignal must be instantiated before the app is created.
  new Appsignal({
    active: true,
    name: process.env[EnvKey.APP_NAME] || 'Pharmacy Hive',
    pushApiKey: process.env[EnvKey.APPSIGNAL_PUSH_API_KEY] || '',
    environment: process.env[EnvKey.NODE_ENV] || 'development',
    enableNginxMetrics: true,
  });
}

  resetLogger();
  const logger = createLogger();
  logger.info('Logger initialized successfully');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new WinstonLoggerService(),
  });

  const config = app.get(ConfigService);
  const APP_NAME = config.get<string>(EnvKey.APP_NAME, 'Pharmacy Hive');
  const APP_VERSION = config.get<string>(EnvKey.APP_VERSION, '1.0.0');
  const NODE_ENV = config.get<string>(EnvKey.NODE_ENV, 'development');
  const PORT = parseInt(config.get<string>(EnvKey.PORT, '8080'), 10);
  const APP_SECRET = config.get<string>(EnvKey.APP_SECRET, '');
  const ENABLE_QUEUE_BOARD = config.get<string>(EnvKey.ENABLE_QUEUE_BOARD, 'false');
  const REQUEST_TIMEOUT_MS = parseInt(config.get<string>(EnvKey.REQUEST_TIMEOUT_MS, '30000'), 10);

  logger.info(`🎉 Successfully deploy app version ${APP_VERSION}`);

  app.enableCors();

  // Request timeout middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      if (!res.headersSent) {
        logger.warn('Request timeout', { url: req.url, method: req.method, timeout: REQUEST_TIMEOUT_MS });
        res.status(408).json({ error: 'Request timeout' });
      }
    });
    next();
  });

  // Body parsers with increased limits for large webhook payloads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
  app.use(cookieParser());

  // API routes live under /api; keep "/" and "/health" at the root (as in the Express app).
  app.setGlobalPrefix('api', {
    exclude: [
      { path: '/', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
    ],
  });

  // Queue monitoring board (Bull Board) — optional.
  try {
    const enableQueueBoard = ENABLE_QUEUE_BOARD === 'true' || NODE_ENV === 'development';
    if (enableQueueBoard) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createBullBoard } = require('@bull-board/api');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ExpressAdapter } = require('@bull-board/express');

      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath('/admin/queues');

      const syncQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.SYNC_DATA));
      createBullBoard({
        queues: [new BullMQAdapter(syncQueue)],
        serverAdapter,
      });

      app.use('/admin/queues', (req: Request, res: Response, next: NextFunction) => {
        if (APP_SECRET) {
          const providedSecret = req.query.secret as string;
          if (!providedSecret || providedSecret !== APP_SECRET) {
            logger.warn('Unauthorized access attempt to queue board', { ip: req.ip, url: req.url });
            return res.status(401).json({ error: 'Unauthorized. Valid secret required in query params.' });
          }
        }
        next();
      });

      app.use('/admin/queues', serverAdapter.getRouter());
      logger.info('Queue monitoring board enabled at /admin/queues');
    }
  } catch (error) {
    logger.warn('Failed to setup queue board', { error: extractErrorInfo(error) });
  }

  // Graceful shutdown — Nest closes Sequelize + BullMQ workers/queues on these hooks.
  app.enableShutdownHooks();

  await app.listen(PORT);
  logger.info(`${APP_NAME} is listening on port ${PORT} in ${NODE_ENV} mode`);
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
