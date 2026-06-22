import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import createLogger from '../../common/logger/logger';
import { extractErrorInfo, extractMondayErrorMessage } from '../../common/logger/logger.utils';
import { SubscriptionService } from '../subscriptions/subscriptions.service';
import { SyncedFormSubmissionService } from '../subscriptions/synced-form-submission.service';
import { SubscriptionEnum } from '../../common/interfaces/subscription.interface';
import { HandleFormSubmissionWebhookParams, MondaySubscriptionPayload } from '../../common/interfaces/webhook.interface';
import { QueueService } from '../queue/queue.service';
import { QUEUE_JOB_TYPES } from '../../common/constants/queue.constant';
import { MondayService } from '../monday/monday.service';
import { convertMondayColumnsValue, JOTFORM_UPLOADS_URL_PREFIX } from '../../common/utils/commonFunctions';
import { fetchJotformUploadFileBuffer } from '../../common/utils/jotformFileDownload';

const logger = createLogger();

function resolveFileNameFromUrl(fileUrl: string): string {
  try {
    const fileName = decodeURIComponent(fileUrl.split('/').pop() || '');
    return fileName || 'jotform-upload';
  } catch {
    return 'jotform-upload';
  }
}

/** Text / long-text columns that hold comma-joined Jotform upload URLs for dynamic file mapping */
const TEXT_LIKE_COLUMN_TYPES = new Set(['text', 'long_text']);
/** Monday "Files" column API type(s) */
const FILE_COLUMN_TYPES = new Set(['file', 'files']);

function parseJotformUploadUrlsFromItemValue(value: unknown): string[] {
  const joined =
    typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string').join(',')
        : String(value ?? '');
  return joined
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.includes(JOTFORM_UPLOADS_URL_PREFIX) && URL.canParse(p));
}

@Injectable()
export class FormService {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly syncedFormSubmissionService: SyncedFormSubmissionService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
  ) {}

  handleFormSubmissionWebhook = async ({ submissionId, formId, formData }: HandleFormSubmissionWebhookParams) => {
    try {
      logger.info(
        `form-service.handleFormSubmissionWebhook - Handling form submission webhook. submissionID: ${submissionId}, formID: ${formId}`,
        { formData },
      );
      const subscriptions = await this.subscriptionService.getSubscriptions({
        webhook_type: SubscriptionEnum.FORM_SUBMISSION,
        form_id: formId,
      });

      if (!subscriptions.length) {
        logger.info(`form-service.handleFormSubmissionWebhook - No subscriptions found for form. formID: ${formId}`, { formData });
        return 0;
      }

      const payload: MondaySubscriptionPayload = {
        trigger: {
          outputFields: {
            id: submissionId,
            formId: formId,
            formQuestions: formData,
          },
        },
      };

      const signingSecret = this.configService.get<string>('MONDAY_SIGNING_SECRET', '');
      for (const subscription of subscriptions) {
        try {
          await axios.post(subscription.webhook_url, payload, {
            headers: { Authorization: signingSecret },
          });
          logger.info(
            `form-service.handleFormSubmissionWebhook - Successfully sent payload to subscription ${subscription.id}. submissionID: ${submissionId}, formID: ${formId}`,
            { payload },
          );
        } catch (error) {
          logger.error(
            `form-service.handleFormSubmissionWebhook - Error sending payload to subscription ${subscription.id}. Error: ${error}. submissionID: ${submissionId}, formID: ${formId}`,
            {
              error,
              payload,
            },
          );
        }
      }
    } catch (error) {
      logger.error(`form-service.handleFormSubmissionWebhook - Error processing webhook. submissionID: ${submissionId}, formID: ${formId}`, {
        error: extractErrorInfo(error),
      });
    }
  };

  /** Enqueue a sync job for the Monday action callback. Returns the BullMQ job. */
  enqueueSyncJob = async (data: {
    submissionId: string;
    formId: string;
    formQuestions: Record<string, unknown>;
    itemMapping: Record<string, unknown>;
    boardId: string;
    userId: string;
    mondayAccessToken: string;
  }) => {
    return this.queueService.addSyncJob({
      type: QUEUE_JOB_TYPES.SYNC_FORM_SUBMISSION_TO_MONDAY,
      ...data,
    });
  };

  processSyncJotformSubmissionToMonday = async (data: {
    submissionId: string;
    formId: string;
    formQuestions: Record<string, unknown>;
    itemMapping: Record<string, unknown>;
    boardId: string;
    userId: string;
    mondayAccessToken: string;
  }) => {
    const { submissionId, formId, formQuestions, itemMapping, boardId, userId, mondayAccessToken } = data;
    const mondayService = new MondayService({ token: mondayAccessToken });

    try {
      logger.info(
        `form-service.processSyncJotformSubmissionToMonday - Processing queued sync job. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}, userId: ${userId}`,
        {
          submissionId,
          formId,
          boardId,
          userId,
        },
      );

      const uploadJotformFilesFromItemMapping = async (mondayItemId: string) => {
        const { error: columnsError, response: columnsResponse } = await mondayService.getBoardColumns(boardId);
        if (columnsError || !columnsResponse?.data?.boards?.[0]?.columns) {
          logger.error(
            `form-service.processSyncJotformSubmissionToMonday - Failed to load board columns. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
            {
              submissionId,
              boardId,
              error: extractErrorInfo(columnsError),
            },
          );
          throw {
            customMessage: `Failed to load board columns: ${extractMondayErrorMessage(columnsError)}`,
          };
        }

        const columns = columnsResponse.data.boards[0].columns;
        const jotformApiKey = this.configService.get<string>('JOTFORM_API_KEY', '');
        const clearedFileColumns = new Set<string>();

        for (const [mappingColumnId, rawValue] of Object.entries(itemMapping)) {
          if (mappingColumnId === '__groupId__') {
            continue;
          }

          const urls = parseJotformUploadUrlsFromItemValue(rawValue);
          if (urls.length === 0) {
            continue;
          }

          const sourceColumn = columns.find((c) => c.id === mappingColumnId);
          if (!sourceColumn) {
            logger.warn(
              `form-service.processSyncJotformSubmissionToMonday - itemMapping column id not on board. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
              {
                submissionId,
                boardId,
                mappingColumnId,
              },
            );
            continue;
          }

          if (!TEXT_LIKE_COLUMN_TYPES.has(sourceColumn.type)) {
            logger.info(
              `form-service.processSyncJotformSubmissionToMonday - Skipping non text-like column for Jotform file upload. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
              {
                submissionId,
                mappingColumnId,
                columnType: sourceColumn.type,
                title: sourceColumn.title,
              },
            );
            continue;
          }

          const fileColumn = columns.find((c) => c.title === sourceColumn.title && FILE_COLUMN_TYPES.has(c.type));
          if (!fileColumn) {
            logger.warn(
              `form-service.processSyncJotformSubmissionToMonday - No file column with same title as text proxy column. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
              {
                submissionId,
                boardId,
                textColumnId: mappingColumnId,
                title: sourceColumn.title,
              },
            );
            continue;
          }

          // Clear existing files in Monday file column
          if (!clearedFileColumns.has(fileColumn.id)) {
            const { error: clearError, response: clearResponse } = await mondayService.changeJsonColumnValue(boardId, mondayItemId, fileColumn.id, {
              clear_all: true,
            });
            if (clearError || !clearResponse) {
              logger.error(
                `form-service.processSyncJotformSubmissionToMonday - Failed clearing existing files in Monday file column. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
                {
                  submissionId,
                  boardId,
                  mondayItemId,
                  fileColumnId: fileColumn.id,
                  error: extractErrorInfo(clearError),
                },
              );
              throw {
                customMessage: `Error clearing existing files in Monday file column ${fileColumn.id}: ${extractMondayErrorMessage(clearError)}`,
              };
            }
            clearedFileColumns.add(fileColumn.id);
            logger.info(
              `form-service.processSyncJotformSubmissionToMonday - Cleared existing files in Monday file column. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
              {
                submissionId,
                boardId,
                mondayItemId,
                fileColumnId: fileColumn.id,
              },
            );
          }

          const uploadOneFile = async (fileContent: Buffer, fileName: string, logLabel: string) => {
            logger.info(
              `form-service.processSyncJotformSubmissionToMonday - Uploading file to Monday file column. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
              {
                submissionId,
                formId,
                boardId,
                mondayItemId,
                textColumnId: mappingColumnId,
                fileColumnId: fileColumn.id,
                columnTitle: sourceColumn.title,
                source: logLabel,
                fileName,
              },
            );

            const { error: uploadError, response: uploadResponse } = await mondayService.addFileToColumn({
              itemId: mondayItemId,
              columnId: fileColumn.id,
              fileName,
              fileContent,
            });

            if (uploadError || !uploadResponse) {
              logger.error(
                `form-service.processSyncJotformSubmissionToMonday - Failed uploading file to Monday. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
                {
                  submissionId,
                  formId,
                  boardId,
                  mondayItemId,
                  fileColumnId: fileColumn.id,
                  source: logLabel,
                  fileName,
                  error: extractErrorInfo(uploadError),
                },
              );
              return;
            }

            logger.info(
              `form-service.processSyncJotformSubmissionToMonday - Uploaded file to Monday file column. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
              {
                submissionId,
                mondayItemId,
                fileColumnId: fileColumn.id,
                source: logLabel,
                fileName,
              },
            );
          };

          for (const fileUrl of urls) {
            const fileName = resolveFileNameFromUrl(fileUrl);
            const fileBuffer = await fetchJotformUploadFileBuffer(fileUrl, jotformApiKey);
            await uploadOneFile(fileBuffer, fileName, fileUrl);
          }
        }
      };

      const payload = convertMondayColumnsValue(itemMapping);
      const syncedSubmission = await this.syncedFormSubmissionService.findSyncedFormSubmission({
        submissionId,
        form_id: formId,
        board_id: boardId,
      });

      if (syncedSubmission) {
        logger.info(
          `form-service.processSyncJotformSubmissionToMonday - Updating synced submission in Monday, submissionId: ${submissionId}, formId: ${formId}, boardId: ${boardId}, mondayItemId: ${syncedSubmission.monday_item_id}`,
          {
            submissionId,
            formId,
            boardId,
            mondayItemId: syncedSubmission.monday_item_id,
            payload,
          },
        );

        const { error, response } = await mondayService.changeMultipleColumnValues(boardId, syncedSubmission.monday_item_id, payload);

        if (error || !response) {
          logger.error(
            `form-service.processSyncJotformSubmissionToMonday - Error updating synced submission in Monday. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
            {
              submissionId,
              formId,
              boardId,
              mondayItemId: syncedSubmission.monday_item_id,
              error: extractErrorInfo(error),
            },
          );
          throw {
            customMessage: `Error updating synced submission item ${syncedSubmission.monday_item_id}: ${extractMondayErrorMessage(error)}`,
          };
        }

        await uploadJotformFilesFromItemMapping(syncedSubmission.monday_item_id);

        logger.info(
          `form-service.processSyncJotformSubmissionToMonday - Successfully updated synced submission in Monday. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
          {
            submissionId,
            formId,
            boardId,
            mondayItemId: syncedSubmission.monday_item_id,
          },
        );
      } else {
        const groupId = itemMapping.__groupId__ as string | undefined;
        if (!groupId) {
          const errorMessage = 'itemMapping.__groupId__ is required to create a new Monday item';
          logger.error(
            `form-service.processSyncJotformSubmissionToMonday - Missing groupId for create flow. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
            {
              submissionId,
              formId,
              boardId,
            },
          );
          throw { customMessage: errorMessage };
        }

        const itemName = (formQuestions.name as string) || `Submission ${submissionId}`;
        logger.info(
          `form-service.processSyncJotformSubmissionToMonday - Creating synced submission in Monday. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}, itemName: ${itemName}`,
          {
            submissionId,
            formId,
            boardId,
            itemName,
            payload,
          },
        );

        const { error, response } = await mondayService.createItem({
          boardId,
          itemName,
          columnValues: payload,
          groupId,
        });

        if (error || !response) {
          logger.error(
            `form-service.processSyncJotformSubmissionToMonday - Error creating synced submission item in Monday. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}`,
            {
              submissionId,
              formId,
              boardId,
              error: extractErrorInfo(error),
            },
          );
          throw { customMessage: `Error creating synced submission item ${submissionId}: ${extractMondayErrorMessage(error)}` };
        }

        const mondayItemId = response.data.create_item.id;

        await this.syncedFormSubmissionService.createSyncedFormSubmission({
          submissionId,
          monday_item_id: mondayItemId,
          form_id: formId,
          board_id: boardId,
        });
        await uploadJotformFilesFromItemMapping(mondayItemId);

        logger.info(
          `form-service.processSyncJotformSubmissionToMonday - Successfully created synced submission in Monday. submissionID: ${submissionId}, formID: ${formId}, boardID: ${boardId}, mondayItemId: ${mondayItemId}`,
          {
            submissionId,
            formId,
            boardId,
            mondayItemId,
          },
        );
      }
    } catch (error) {
      const errorMessage = (error as { customMessage?: string }).customMessage || (error as Error).message || 'Unknown error occurred!';
      mondayService.sendNotification({ userId, targetId: boardId, message: errorMessage });
      logger.error(`form-service.processSyncJotformSubmissionToMonday - Error processing synced submission. Error: ${errorMessage}`, {
        error: extractErrorInfo(error),
        submissionId,
        formId,
        boardId,
      });
    }
  };
}
