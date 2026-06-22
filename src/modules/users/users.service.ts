import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import User from '../../models/user.model';
import { ModelWhereClause } from '../../common/interfaces/common.interface';

type UserWhereClause = ModelWhereClause<User>;

@Injectable()
export class UserService {
  constructor(@InjectModel(User) private readonly userModel: typeof User) {}

  getUsers = (where?: UserWhereClause): Promise<User[]> => {
    return this.userModel.findAll({ where });
  };

  findUserByAccountId = async (accountId: string): Promise<User | null> => {
    return this.userModel.findOne({ where: { monday_account_id: accountId } });
  };

  createUser = async (data: { monday_user_id: string; monday_account_id: string }): Promise<User> => {
    return this.userModel.create(data as any);
  };

  updateUser = async (user: User, data: Partial<User>): Promise<User> => {
    return user.update(data);
  };
}
