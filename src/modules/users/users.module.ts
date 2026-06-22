import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import User from '../../models/user.model';
import { UserService } from './users.service';

@Module({
  imports: [SequelizeModule.forFeature([User])],
  providers: [UserService],
  exports: [UserService],
})
export class UsersModule {}
