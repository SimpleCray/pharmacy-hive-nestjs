import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Response } from 'express';
import IORedis from 'ioredis';
import createLogger from './common/logger/logger';
import { extractErrorInfo } from './common/logger/logger.utils';
import { EnvKey } from './config/env.validation';

const logger = createLogger();

@Controller()
export class AppController {
  constructor(
    private readonly configService: ConfigService,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  @Get()
  home(@Res() res: Response) {
    const appName = this.configService.get<string>(EnvKey.APP_NAME, 'Pharmacy Hive');
    const appVersion = this.configService.get<string>(EnvKey.APP_VERSION, '1.0.0');
    res.status(200).send({ message: `You have reached the home page of ${appName} ${appVersion}` });
  }

  @Get('health')
  async health(@Res() res: Response) {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get<string>(EnvKey.NODE_ENV, 'development'),
      version: this.configService.get<string>(EnvKey.APP_VERSION, '1.0.0'),
      services: {
        database: 'unknown',
        redis: 'unknown',
      },
    };

    try {
      await this.sequelize.authenticate();
      healthStatus.services.database = 'connected';
    } catch (error) {
      healthStatus.services.database = 'disconnected';
      healthStatus.status = 'unhealthy';
      logger.error('Health check - Database connection failed', { error: extractErrorInfo(error) });
    }

    try {
      const redis = new IORedis({
        host: this.configService.get<string>(EnvKey.REDIS_HOST, 'localhost'),
        port: parseInt(this.configService.get<string>(EnvKey.REDIS_PORT, '6379'), 10),
        password: this.configService.get<string>(EnvKey.REDIS_PASSWORD, '') || '',
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });
      await redis.ping();
      await redis.quit();
      healthStatus.services.redis = 'connected';
    } catch (error) {
      healthStatus.services.redis = 'disconnected';
      healthStatus.status = 'unhealthy';
      logger.error('Health check - Redis connection failed', { error: extractErrorInfo(error) });
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  }
}
