export type SupportedDialect = 'mysql' | 'sqlite';

export interface DatabaseConfigEntry {
  username: string;
  password: string;
  database: string;
  host: string;
  port: string;
  dialect: SupportedDialect;
  logging?: boolean;
  storage?: string;
}

export type DatabaseConfigByEnv = Record<string, DatabaseConfigEntry>;

// database.config.js is shared with sequelize-cli (.sequelizerc).

const rawDatabaseConfig = require('./database.config');

const databaseConfig = rawDatabaseConfig as DatabaseConfigByEnv;

export default databaseConfig;
