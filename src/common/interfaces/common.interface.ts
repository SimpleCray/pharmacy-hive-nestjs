import { WhereOptions, Model, InferAttributes } from 'sequelize';
import User from '../../models/user.model';

export interface Example {
  test: string;
}

// Type-safe where clause using Sequelize's InferAttributes
export type ModelWhereClause<T extends Model> = WhereOptions<InferAttributes<T>>;

export interface MondaySession {
  accountId: string;
  userId: string;
  mondayAccessToken: string;
  user: User;
}
