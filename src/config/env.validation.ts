import * as Joi from 'joi';

/**
 * Central registry of environment variable names.
 *
 * Use these constants with `ConfigService.get(EnvKey.X)` and `process.env[EnvKey.X]`
 * instead of raw strings so renames are caught by the compiler and there is a single
 * source of truth for every key the app reads.
 */
export const EnvKey = {
  NODE_ENV: 'NODE_ENV',
  APP_NAME: 'APP_NAME',
  APP_VERSION: 'APP_VERSION',
  PORT: 'PORT',
  APP_URL: 'APP_URL',
  REQUEST_TIMEOUT_MS: 'REQUEST_TIMEOUT_MS',
  ENABLE_QUEUE_BOARD: 'ENABLE_QUEUE_BOARD',

  // Database
  DB_USERNAME: 'DB_USERNAME',
  DB_PASSWORD: 'DB_PASSWORD',
  DB_NAME: 'DB_NAME',
  DB_HOST: 'DB_HOST',
  DB_PORT: 'DB_PORT',

  // Redis
  REDIS_HOST: 'REDIS_HOST',
  REDIS_PORT: 'REDIS_PORT',
  REDIS_PASSWORD: 'REDIS_PASSWORD',

  // Monday.com
  MONDAY_SIGNING_SECRET: 'MONDAY_SIGNING_SECRET',
  MONDAY_CLIENT_ID: 'MONDAY_CLIENT_ID',
  MONDAY_CLIENT_SECRET: 'MONDAY_CLIENT_SECRET',
  MONDAY_REDIRECT_URL: 'MONDAY_REDIRECT_URL',

  // Jotform
  JOTFORM_API_KEY: 'JOTFORM_API_KEY',
  JOTFORM_BASE_URL: 'JOTFORM_BASE_URL',

  // Admin users
  ADMIN_USERS: 'ADMIN_USERS',

  // AppSignal
  APPSIGNAL_PUSH_API_KEY: 'APPSIGNAL_PUSH_API_KEY',

  // Security
  APP_SECRET: 'APP_SECRET',
} as const;

export type EnvKey = (typeof EnvKey)[keyof typeof EnvKey];

const port = Joi.number().integer().positive();

/**
 * Mirrors the validation rules from the Express app's `validateEnv`.
 * ConfigModule runs this at bootstrap and throws on the first failure set.
 */
export const envValidationSchema = Joi.object({
  [EnvKey.NODE_ENV]: Joi.string().valid('development', 'production', 'test', 'stage', 'staging', 'prod').default('development'),
  [EnvKey.APP_NAME]: Joi.string().default('Pharmacy Hive'),
  [EnvKey.APP_VERSION]: Joi.string().default('1.0.0'),
  [EnvKey.PORT]: port.default(8080),
  [EnvKey.APP_URL]: Joi.string().required(),
  [EnvKey.REQUEST_TIMEOUT_MS]: port.default(30000),
  [EnvKey.ENABLE_QUEUE_BOARD]: Joi.string().default('false'),

  // Database
  [EnvKey.DB_USERNAME]: Joi.string().required(),
  [EnvKey.DB_PASSWORD]: Joi.string().required().allow(''),
  [EnvKey.DB_NAME]: Joi.string().required(),
  [EnvKey.DB_HOST]: Joi.string().required(),
  [EnvKey.DB_PORT]: port.required(),

  // Redis
  [EnvKey.REDIS_HOST]: Joi.string().default('localhost'),
  [EnvKey.REDIS_PORT]: port.default(6379),
  [EnvKey.REDIS_PASSWORD]: Joi.string().optional().allow(''),

  // Monday.com
  [EnvKey.MONDAY_SIGNING_SECRET]: Joi.string().required(),
  [EnvKey.MONDAY_CLIENT_ID]: Joi.string().required(),
  [EnvKey.MONDAY_CLIENT_SECRET]: Joi.string().required(),
  [EnvKey.MONDAY_REDIRECT_URL]: Joi.string().required(),

  // Jotform
  [EnvKey.JOTFORM_API_KEY]: Joi.string().required(),
  [EnvKey.JOTFORM_BASE_URL]: Joi.string().required(),

  // Admin users
  [EnvKey.ADMIN_USERS]: Joi.string().optional().allow(''),

  // AppSignal
  [EnvKey.APPSIGNAL_PUSH_API_KEY]: Joi.string().required().allow(''),

  // Security
  [EnvKey.APP_SECRET]: Joi.string().required(),
}).unknown(true);
