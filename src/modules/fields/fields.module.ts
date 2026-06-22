import { Module } from '@nestjs/common';
import { FieldController } from './fields.controller';
import { JotformModule } from '../jotform/jotform.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [JotformModule, UsersModule],
  controllers: [FieldController],
})
export class FieldsModule {}
