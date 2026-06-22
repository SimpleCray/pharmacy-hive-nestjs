import { Module } from '@nestjs/common';
import { JotFormService } from './jotform.service';

@Module({
  providers: [JotFormService],
  exports: [JotFormService],
})
export class JotformModule {}
