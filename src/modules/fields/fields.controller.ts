import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import createLogger from '../../common/logger/logger';
import { extractErrorInfo } from '../../common/logger/logger.utils';
import { JotFormService } from '../jotform/jotform.service';
import {
  JOTFORM_TYPE_TO_MONDAY_TYPE,
  MondayFieldDefinition,
  MondayFieldsRequestBody,
  MONDAY_FIELD_TYPE_FALLBACK,
} from '../../common/interfaces/fields.interface';
import { MondayAuthGuard } from '../../common/guards/monday-auth.guard';

const logger = createLogger();

@Controller('fields')
@UseGuards(MondayAuthGuard)
export class FieldController {
  constructor(private readonly jotFormService: JotFormService) {}

  @Post('form-list')
  async getFormList(@Res() res: Response): Promise<Response> {
    logger.info('field-controller.getFormList - Get form list route called');

    try {
      const response = await this.jotFormService.getForms();
      const formList: { value: string; title: string }[] = response.content
        ?.filter((form) => form.status !== 'DELETED')
        .map((form) => ({
          value: form.id,
          title: form.title,
        }));
      return res.status(200).send(formList);
    } catch (err) {
      logger.error('field-controller.getFormList - An unknown error has occured', { error: extractErrorInfo(err) });
      return res.status(400).send({ message: 'an error has occured' });
    }
  }

  @Post('form-questions')
  async getFormQuestions(@Body() body: MondayFieldsRequestBody, @Res() res: Response): Promise<Response> {
    logger.info('field-controller.getFormQuestions - Get form questions route called');
    const { value: formId } = body.payload.formList;

    try {
      const response = await this.jotFormService.getFormQuestions(formId);

      logger.info('field-controller.getFormQuestions - Form questions response', { response });

      const fieldDefinitions: MondayFieldDefinition[] = Object.entries(response.content)
        .filter(([, question]) => question.required)
        .map(([questionId, question]) => {
          const mondayType = JOTFORM_TYPE_TO_MONDAY_TYPE[question.type] ?? MONDAY_FIELD_TYPE_FALLBACK;
          return {
            id: question.type === 'control_fullname' ? 'name' : question.qid || questionId,
            title: question.text,
            outboundType: mondayType.outboundType,
            inboundTypes: mondayType.inboundTypes,
          };
        });

      logger.info('field-controller.getFormQuestions - Field definitions built', { formId, count: fieldDefinitions.length });
      return res.status(200).send(fieldDefinitions);
    } catch (err) {
      logger.error('field-controller.getFormQuestions - An unknown error has occured', { error: extractErrorInfo(err) });
      return res.status(400).send({ message: 'an error has occured' });
    }
  }
}
