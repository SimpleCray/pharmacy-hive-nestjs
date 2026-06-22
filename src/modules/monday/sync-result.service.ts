import { MondayService } from './monday.service';
import createLogger from '../../common/logger/logger';

const logger = createLogger();

// Column names for syncing results back to Monday
export const HQ_SYNC_STATUS_COLUMN_NAME = 'Sync Status';
export const HQ_SYNC_ERROR_DETAILS_COLUMN_NAME = 'Error Details';

// Sync status values
export const SYNC_STATUS_SUCCESS = 'Success';
export const SYNC_STATUS_ERROR = 'Error';
export const SYNC_STATUS_INPROGRESS = 'Syncing';

/**
 * Sync HQ ID and sync status back to Monday.com item.
 * Kept as a standalone helper (takes a MondayService instance) like the Express app.
 */
export const syncResultToMonday = async ({
  boardId,
  itemId,
  syncStatus,
  errorMessage,
  mondayService,
}: {
  boardId: string;
  itemId: string;
  hqId?: string | number;
  syncStatus: 'Success' | 'Error' | 'Syncing';
  errorMessage?: string;
  mondayService: MondayService;
}): Promise<boolean> => {
  try {
    const columnResults = await mondayService.getColumnsId(boardId, [HQ_SYNC_STATUS_COLUMN_NAME, HQ_SYNC_ERROR_DETAILS_COLUMN_NAME]);

    const syncStatusColumnId = columnResults.find((r) => r.name === HQ_SYNC_STATUS_COLUMN_NAME)?.id;
    const errorDetailsColumnId = columnResults.find((r) => r.name === HQ_SYNC_ERROR_DETAILS_COLUMN_NAME)?.id;

    if (!syncStatusColumnId) {
      logger.error(`syncResult.service.syncResultToMonday - "${HQ_SYNC_STATUS_COLUMN_NAME}" column not found. BoardId: ${boardId}`);
      mondayService.sendNotification({
        targetId: boardId,
        message: `"${HQ_SYNC_STATUS_COLUMN_NAME}" column not found. BoardId: ${boardId}`,
      });
      return false;
    }

    const columnValues: Record<string, any> = {
      [syncStatusColumnId]: {
        label: syncStatus,
      },
    };

    if (!errorDetailsColumnId) {
      logger.error(`syncResult.service.syncResultToMonday - "${HQ_SYNC_ERROR_DETAILS_COLUMN_NAME}" column not found. BoardId: ${boardId}`);
      mondayService.sendNotification({
        targetId: boardId,
        message: `"${HQ_SYNC_ERROR_DETAILS_COLUMN_NAME}" column not found. BoardId: ${boardId}`,
      });
    } else {
      columnValues[errorDetailsColumnId] = errorMessage;
    }

    const response = await mondayService.changeMultipleColumnValues(boardId, itemId, columnValues);

    if (response.error) {
      logger.error(
        `syncResult.service.syncResultToMonday - Error updating Monday.com item. ItemId: ${itemId}, Error: ${JSON.stringify(response.error)}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    logger.error(`syncResult.service.syncResultToMonday - Unexpected error. ItemId: ${itemId}`, { error });
    return false;
  }
};
