import * as Joi from 'joi';

const port = Joi.number().integer().positive();

/**
 * Mirrors the validation rules from the Express app's `validateEnv`.
 * ConfigModule runs this at bootstrap and throws on the first failure set.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test', 'stage', 'staging', 'prod').default('development'),
  APP_NAME: Joi.string().default('Pharmacy Hive'),
  APP_VERSION: Joi.string().default('1.0.0'),
  PORT: port.default(8080),
  APP_URL: Joi.string().required(),
  REQUEST_TIMEOUT_MS: port.default(30000),
  ENABLE_QUEUE_BOARD: Joi.string().default('false'),

  // Database
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required().allow(''),
  DB_NAME: Joi.string().required(),
  DB_HOST: Joi.string().required(),
  DB_PORT: port.required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: port.default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),

  // Monday.com
  MONDAY_SIGNING_SECRET: Joi.string().required(),
  MONDAY_CLIENT_ID: Joi.string().required(),
  MONDAY_CLIENT_SECRET: Joi.string().required(),
  MONDAY_REDIRECT_URL: Joi.string().required(),

  // Jotform
  JOTFORM_API_KEY: Joi.string().required(),
  JOTFORM_BASE_URL: Joi.string().required(),

  // Admin users
  ADMIN_USERS: Joi.string().optional().allow(''),

  // AppSignal
  APPSIGNAL_PUSH_API_KEY: Joi.string().required().allow(''),

  // Security
  APP_SECRET: Joi.string().required(),
}).unknown(true);
