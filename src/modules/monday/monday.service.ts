import initMondayClient, { MondayServerSdk } from 'monday-sdk-js';
import {
  Board,
  ColumnValue,
  Item,
  MondayBoardResponse,
  MondayCreateFolderResponse,
  MondayDeleteItemResponse,
  MondayFolderResponse,
  MondayItemsByColumnValuesResponse,
  MondayNextItemsPageResponse,
  MondayBoardColumn,
  MondayRequestProps,
  MondayResponse,
} from '../../common/interfaces/monday.interface';
import createLogger from '../../common/logger/logger';
import { extractErrorInfo } from '../../common/logger/logger.utils';
import { convertMondayData, sleep } from '../../common/utils/commonFunctions';

const logger = createLogger();

const isComplexityError = (errorMessage: string) => {
  return errorMessage.toLowerCase().includes('complexity');
};

/**
 * Wrapper over the Monday GraphQL API. Instantiated per request with the user's
 * access token (`new MondayService({ token })`) — kept as a plain class rather than
 * a Nest provider because the token is only known at runtime.
 */
export class MondayService {
  private mondayClient: MondayServerSdk;
  private token: string;

  constructor({ token }: { token: string }) {
    this.token = token;
    this.mondayClient = initMondayClient({ token, apiVersion: '2023-10' });
  }

  private async mondayRequest<T>({ query, variables = undefined, retry = false }: MondayRequestProps): Promise<MondayResponse<T>> {
    let response: MondayResponse<T>['response'] = null;
    let completed = !retry;
    let count = 0;

    do {
      response = await this.mondayClient.api(query, { variables });

      if (response?.errors) {
        if (response.errors[0]) {
          const error = response.errors[0];
          const errorMessage = typeof error === 'string' ? error : error.message;

          if (errorMessage === 'Not Authenticated') {
            return { error: response, response: null };
          }
          if (isComplexityError(errorMessage)) {
            completed = false; // Retry if complexity error
            await sleep(60000);
          } else {
            count += 1;
            await sleep(1000);
          }
        } else {
          count += 1;
          await sleep(60000);
        }
      } else if (response?.error_message) {
        if (isComplexityError(response.error_message)) {
          completed = false; // Retry if complexity error
          await sleep(60000);
        } else {
          count += 1;
          await sleep(1000);
        }
      } else {
        completed = true;
        return { error: null, response };
      }

      if (count >= 2) {
        if (response?.error_message) {
          return { error: response.error_message, response: null };
        }
        const error = response?.errors?.[0];
        return { error: typeof error === 'string' ? error : error?.message, response: null };
      }
    } while (!completed);

    if (response?.error_message) {
      return { error: response, response: null };
    }
    const error = response?.errors?.[0];
    return { error: typeof error === 'string' ? error : error?.message, response: null };
  }

  /**
   * Send a notification to a user or a group of users if ADMIN_USERS is defined in the .env file
   */
  async sendNotification({
    userId,
    targetId,
    message,
  }: {
    userId?: string;
    targetId: string;
    message: string;
  }): Promise<MondayResponse<{ create_notification: { text: string } }>> {
    const adminUsers = process.env.ADMIN_USERS?.split(',') || [];
    const uniqueUserIds = userId ? Array.from(new Set([...adminUsers, userId])) : adminUsers;

    const query = `mutation create_notification($userId: ID!, $targetId: ID!, $text:String!) {
      create_notification(user_id: $userId, target_id: $targetId, text: $text, target_type:Project) {
        text
      }
    }`;

    const notificationPromises = uniqueUserIds.map(async (userIdToNotify) => {
      const variables = {
        userId: userIdToNotify,
        targetId: parseInt(targetId),
        text: `Pharmacy Hive: ${message}`,
        targetType: 'Project',
      };
      return this.mondayRequest<{ create_notification: { text: string } }>({ query, variables });
    });

    const results = await Promise.allSettled(notificationPromises);

    const successfulResult = results.find((result) => result.status === 'fulfilled' && !result.value.error);
    if (successfulResult && successfulResult.status === 'fulfilled') {
      return successfulResult.value;
    }

    const firstResult = results[0];
    return firstResult.status === 'fulfilled' ? firstResult.value : { error: firstResult.reason, response: null };
  }

  async createBoard(boardName: string, boardKind: string): Promise<MondayResponse<{ create_board: { id: string } }>> {
    const query = `mutation create_board($boardName: String!, $boardKind: BoardKind!) {
      create_board(board_name: $boardName, board_kind: $boardKind) {
        id
      }
    }`;
    const variables = { boardName, boardKind };
    return this.mondayRequest({ query, variables });
  }

  async createItem({
    boardId,
    groupId,
    itemName,
    columnValues,
  }: {
    boardId: string;
    groupId?: string;
    itemName: string;
    columnValues: Record<string, unknown>;
  }): Promise<MondayResponse<{ create_item: { id: string } }>> {
    const stringifiedColumnValues = JSON.stringify(columnValues);
    const query = `mutation create_item($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, group_id: $groupId, item_name:$itemName, column_values:$columnValues, create_labels_if_missing: true) {
        id
      }
    }`;
    const variables = {
      boardId,
      groupId,
      itemName,
      columnValues: stringifiedColumnValues,
    };
    return this.mondayRequest({ query, variables });
  }

  async createSubItem({
    parentItemId,
    itemName,
    columnValues,
  }: {
    parentItemId: string;
    itemName: string;
    columnValues: Record<string, unknown>;
  }): Promise<MondayResponse<{ create_subitem: { id: string } }>> {
    const stringifiedColumnValues = JSON.stringify(columnValues);
    const query = `mutation create_subitem($parentItemId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_subitem(
        parent_item_id: $parentItemId,
        item_name: $itemName,
        column_values: $columnValues,
      ) {
        id
      }
    }`;
    const variables = {
      parentItemId,
      itemName,
      columnValues: stringifiedColumnValues,
    };
    return this.mondayRequest({ query, variables });
  }

  async changeItemName(boardId: string, itemId: string, itemName: string): Promise<MondayResponse<{ change_simple_column_value: { id: string } }>> {
    const query = `mutation change_simple_column_value($boardId: ID!, $itemId: ID!, $itemName: String!) {
      change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: "name", value: $itemName) {
        id
      }
    }`;
    const variables = { boardId, itemId, itemName };
    return this.mondayRequest({ query, variables });
  }

  async changeSimpleColumnValue(
    boardId: string,
    itemId: string,
    columnId: string,
    columnValue: string,
  ): Promise<MondayResponse<{ change_simple_column_value: { id: string } }>> {
    const query = `mutation change_simple_column_value($boardId: ID!, $itemId: ID!, $columnId: String!, $columnValue: String!) {
      change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $columnValue, create_labels_if_missing: true) {
        id
      }
    }`;
    const variables = {
      boardId,
      itemId,
      columnId,
      columnValue,
    };
    return this.mondayRequest({ query, variables });
  }

  async changeJsonColumnValue(
    boardId: string,
    itemId: string,
    columnId: string,
    columnValue: Record<string, any>,
  ): Promise<MondayResponse<{ change_column_value: { id: string } }>> {
    const query = `mutation change_simple_column_value ($boardId: ID!, $itemId: ID!, $columnId: String!, $columnValue: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $columnValue, create_labels_if_missing: true) {
        id
      }
    }`;
    const variables = {
      boardId,
      itemId,
      columnId,
      columnValue: JSON.stringify(columnValue),
    };
    return this.mondayRequest({ query, variables });
  }

  async changeMultipleColumnValues(
    boardId: string,
    itemId: string,
    columnValues: Record<string, any>,
  ): Promise<MondayResponse<{ change_multiple_column_values: { id: string } }>> {
    const query = `mutation change_multiple_column_values($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues, create_labels_if_missing: true) {
        id
      }
    }`;
    const variables = { boardId, itemId, columnValues: JSON.stringify(columnValues) };
    return this.mondayRequest({ query, variables });
  }

  async queryAccountInformation(): Promise<MondayResponse<{ me: { name: string; email: string; account: { name: string } } }>> {
    const query = 'query { me { name email account { name } } }';
    return this.mondayRequest({ query });
  }

  async queryItemInformation(
    itemId: string,
  ): Promise<MondayResponse<{ items: Array<{ name: string; board: { name: string }; group: { title: string }; column_values: ColumnValue[] }> }>> {
    const query = `query { items (ids:${itemId}) { name board { name } group { title } column_values { id type text value title } } }`;
    return this.mondayRequest({ query });
  }

  async getItemData(itemId: string, columnIds?: string[]): Promise<Item | null> {
    const columns_query = columnIds ? `(ids: ${JSON.stringify(columnIds)})` : '';
    const query = `query {
      items(ids: ${itemId}) {
        name
        column_values${columns_query} {
          column {
            title
          }
          id
          value
          type
          text
          ... on BoardRelationValue {
              linked_item_ids
              linked_items {
                id
              }
            }
          ...on MirrorValue{
            display_value
            value
            text
          }
        }
      }
    }`;
    const { error, response } = await this.mondayRequest({ query });
    if (error) {
      throw error;
    }

    const items = (response?.data as { items: Item[] })?.items;

    if (items.length > 0) {
      return items[0];
    }

    return null;
  }

  async getItemColumnValue(itemId: string, columnId: string, isMultiple = false): Promise<{ name: string; value: any } | undefined> {
    const query = `query {
        items(ids: ${itemId}) {
          name
          column_values(ids: "${columnId}") {
            id
            value
            text
            column {
              type
              settings_str
            }
            ... on BoardRelationValue {
              linked_item_ids
              linked_items {
                id
              }
            }
          }
      }
    }`;
    const { error, response } = await this.mondayRequest({ query });
    if (error) {
      throw error;
    }

    const items = (response?.data as { items: Item[] })?.items;

    if (items.length > 0) {
      let value: any = null;
      const columnType = items[0]?.column_values?.[0]?.column?.type;
      if (columnType === 'board_relation') {
        value = isMultiple ? items[0]?.column_values?.[0]?.linked_item_ids : items[0]?.column_values?.[0]?.linked_item_ids?.[0];
      } else if (columnType === 'people') {
        const columValues = items[0]?.column_values?.[0];
        const rawValue = columValues?.value;
        const parsedValue = rawValue ? JSON.parse(rawValue) : null;
        if (parsedValue && parsedValue.personsAndTeams.length > 0) {
          value = { id: parsedValue.personsAndTeams[0]?.id, name: columValues?.text || '' };
        } else {
          value = null;
        }
      } else {
        value = items[0]?.column_values?.[0]?.value;
      }
      return { name: items[0].name, value: value || null };
    }

    return undefined;
  }

  async queryItemName(itemId: string): Promise<MondayResponse<{ items: Array<{ name: string }> }>> {
    const query = `query { items (ids:${itemId}) { name } }`;
    return this.mondayRequest({ query });
  }

  async queryUsers(): Promise<MondayResponse<{ users: Array<{ id: string; email: string }> }>> {
    const query = 'query { users (limit: 500) { id email } }';
    return this.mondayRequest({ query });
  }

  async queryColumnInformationByBoardId(
    boardId: string,
    columnId?: string,
  ): Promise<MondayResponse<{ boards: Array<{ columns: Array<{ id: string; settings_str: string; title: string; type: string }> }> }>> {
    const query = `query { boards(ids: ${boardId}) { columns${columnId ? `(ids: "${columnId}")` : ''} { id settings_str title type } } } `;
    return this.mondayRequest({ query });
  }

  /** Returns all columns on the board (id, title, type). Used to pair text “proxy” columns with file columns by title. */
  async getBoardColumns(boardId: string): Promise<MondayResponse<{ boards: Array<{ columns: MondayBoardColumn[] }> }>> {
    const query = `query { boards(ids: ${boardId}) { columns { id title type } } }`;
    return this.mondayRequest({ query });
  }

  async queryUsersByIds(ids: string[]): Promise<MondayResponse<{ users: Array<{ id: string; name: string; email: string }> }>> {
    const query = `query { users (ids: [${ids}], limit: 500) { id name email } }`;
    return this.mondayRequest({ query });
  }

  async queryTeamsByIds(ids: string[]): Promise<MondayResponse<{ teams: Array<{ id: string; name: string }> }>> {
    const query = `query { teams (ids: [${ids}]) { id name } }`;
    return this.mondayRequest({ query });
  }

  async queryAssets(assetIds: string[]): Promise<MondayResponse<{ assets: Array<{ id: string; name: string; url: string; public_url: string }> }>> {
    const query = `query { assets (ids:[${assetIds}]) { id name url public_url } }`;
    return this.mondayRequest({ query });
  }

  async addFileToColumn({
    itemId,
    columnId,
    fileName,
    fileContent,
  }: {
    itemId: string;
    columnId: string;
    fileName: string;
    fileContent: Buffer;
  }): Promise<MondayResponse<{ add_file_to_column: { id: string } }>> {
    // Monday /v2/file endpoint is strict about multipart field names.
    // Use query + variables + map + file (not GraphQL "operations" envelope).
    const query = `mutation ($file: File!) {
      add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) {
        id
      }
    }`;
    const variables = JSON.stringify({ file: null });
    const map = JSON.stringify({ file: 'variables.file' });

    const formData = new FormData();
    formData.set('query', query);
    formData.set('variables', variables);
    formData.set('map', map);
    formData.set('file', new Blob([new Uint8Array(fileContent)]), fileName);

    try {
      const response = await fetch('https://api.monday.com/v2/file', {
        method: 'POST',
        headers: {
          Authorization: this.token,
          'API-Version': '2023-10',
        },
        body: formData,
      });

      const responseJson = (await response.json().catch(() => null)) as MondayResponse<{ add_file_to_column: { id: string } }>['response'];
      const responseError = responseJson?.errors?.[0];
      if (!response.ok || responseJson?.error_message || responseError) {
        return {
          error:
            responseJson?.error_message || (typeof responseError === 'string' ? responseError : responseError?.message) || `HTTP ${response.status}`,
          response: responseJson,
        };
      }

      return { error: null, response: responseJson };
    } catch (error) {
      return { error: extractErrorInfo(error), response: null };
    }
  }

  async cloneBoardFromTemplate(
    originalBoardId: string,
    newBoardName: string,
    folderId: string,
  ): Promise<MondayResponse<{ create_board: { id: string } }>> {
    const query = `mutation {
      create_board(board_name: "${newBoardName}", board_kind: public, folder_id: ${folderId}, template_id: ${originalBoardId}){
        id
      }
    }`;
    return this.mondayRequest({ query });
  }

  async getDropdownValues(boardId: string, columnId: string): Promise<Array<{ type: string; id: string; values: string[] }>> {
    const query = `query($boardId: [ID!], $columnId: [String!]) {
      boards (ids: $boardId) {
        columns (ids: $columnId) {
          type
          id
          settings_str
        }
      }
    }`;

    const variables = { boardId, columnId };
    const { error, response } = await this.mondayRequest({ query, variables });
    if (error) {
      throw error;
    }
    const boards = (response?.data as { boards: Array<{ columns: Array<{ type: string; id: string; settings_str: string }> }> })?.boards;
    return boards[0].columns.map((el) => ({
      type: el.type,
      id: el.id,
      values: JSON.parse(el.settings_str).labels,
    }));
  }

  async getSubItems(itemId: string, subItemsColumnIds: string[]): Promise<Item[] | undefined> {
    const query = `query {
      items (ids: ${itemId}) {
        subitems {
          id
          name
          board {
            id
          }
          column_values (ids: ${JSON.stringify(subItemsColumnIds)}) {
            id
            value
            type
            text
          }
        }
      }
    }`;

    const { error, response } = await this.mondayRequest({ query });
    if (error) {
      throw error;
    }
    const items = (response?.data as { items: Item[] })?.items;
    if (items.length > 0) {
      return items[0]?.subitems;
    }
    return undefined;
  }

  async getBoardData(boardId: string, columnIds: string[], withColumnValues = true): Promise<Item[]> {
    const allItems: Item[] = [];
    let cursor = '';
    let query = '';
    const columnsValuesQuery = withColumnValues
      ? `
        column_values(ids: ${JSON.stringify(columnIds)}) {
          column {
            id
            title
            type
          }
          value
          ... on DependencyValue {
            id
            display_value
          }
          ... on MirrorValue {
            id
            display_value
          }
          ... on BoardRelationValue {
            id
            display_value
          }
          text
        }
      `
      : '';

    do {
      if (cursor) {
        query = `query {
          next_items_page (cursor: ${cursor}, limit: 500) {
            cursor
            items {
              id
              name
              ${columnsValuesQuery}
            }
          }
        }
        `;
        const { error, response } = await this.mondayRequest<MondayNextItemsPageResponse>({ query });
        if (error) {
          throw error;
        }
        const items = response?.data?.next_items_page.items;
        if (items) {
          items.forEach((item) => {
            allItems.push({
              id: item.id,
              name: item.name,
              column_values: withColumnValues ? item.column_values?.map((el) => convertMondayData(el)) : undefined,
            });
          });
          cursor = response?.data?.next_items_page.cursor || '';
        }
      } else {
        query = `query {
          boards (ids: ${boardId}) {
            items_page(limit: 500) {
              items {
                id
                name
                ${columnsValuesQuery}
              }
              cursor
            }
          }
        }`;
        const { error, response } = await this.mondayRequest<MondayBoardResponse>({ query });
        if (error) {
          throw error;
        }
        const items = response?.data?.boards[0]?.items_page.items;
        if (items) {
          items.forEach((item) => {
            allItems.push({
              id: item.id,
              name: item.name,
              column_values: withColumnValues ? item.column_values?.map((el) => convertMondayData(el)) : undefined,
            });
          });
          cursor = response?.data?.boards[0]?.items_page.cursor || '';
        }
      }
    } while (cursor);

    return allItems;
  }

  async getBoardDetails(boardId: string): Promise<Board> {
    const query = `query {
      boards (ids: ${boardId}) {
        name
        workspace_id
      }
    }`;
    const { error, response } = await this.mondayRequest<MondayBoardResponse>({ query });
    if (error) {
      throw error;
    }
    if (!response?.data?.boards[0]) {
      throw new Error('Board not found');
    }
    return response.data.boards[0];
  }

  async getSubItemBoardId(parentBoardId: string): Promise<string | null> {
    const query = `{
      boards(ids: ${parentBoardId}) {
        columns {
          title
          settings_str
        }
      }
    }`;

    const { error, response } = await this.mondayRequest<MondayBoardResponse>({ query });
    if (error) {
      throw error;
    }

    const columns = response?.data?.boards[0]?.columns;

    if (!columns?.length) return null;

    const subItemsColumn = columns.find((el) => el.title === 'Subitems');
    if (subItemsColumn) {
      const settings = JSON.parse(subItemsColumn.settings_str);
      return settings.boardIds[0];
    }

    return null;
  }

  async findItemByColumnValue(
    boardId: string,
    columnId: string,
    columnValue: string,
    fieldsMap?: Record<string, { id: string }>,
  ): Promise<Record<string, any> | null> {
    const query = `{
      items_page_by_column_values(
        board_id: "${boardId}"
        columns: [
          {column_id: "${columnId}", column_values: ["${columnValue}"]}
        ]
      ) {
        items {
        id
        name
        column_values {
          column {
            title
          }
          id
          value
          type
          text
        }
        }
      }
    }`;

    const { error, response } = await this.mondayRequest<MondayItemsByColumnValuesResponse>({ query });
    if (error) {
      throw error;
    }
    const responseValues = response?.data?.items_page_by_column_values.items[0];
    if (!responseValues) return null;
    if (fieldsMap) {
      const { id, column_values } = responseValues;
      const data =
        Object.entries(fieldsMap).reduce((acc, [key, value]) => {
          const columnData = column_values?.find((el) => el.id === value.id);
          if (columnData) {
            const columnDataConverted = convertMondayData(columnData);
            return { ...acc, id, [key]: columnDataConverted.value };
          }
          return acc;
        }, {}) || null;
      return data;
    } else return responseValues;
  }

  async createFolder(workspaceId: string | null, parentFolderId: string | null, name: string): Promise<string> {
    const workspaceQuery = workspaceId ? `, workspace_id: ${workspaceId}` : '';
    const parentFolderIdQuery = parentFolderId ? `, parent_folder_id: ${parentFolderId}` : '';
    const query = `mutation {
      create_folder (name: "${name}" ${workspaceQuery} ${parentFolderIdQuery}) {
        id
      }
    }
    `;
    const { error, response } = await this.mondayRequest<MondayCreateFolderResponse>({ query });
    if (error) {
      throw error;
    }
    if (response?.data?.create_folder?.id) {
      return response.data.create_folder.id;
    }
    throw new Error('Failed to create folder');
  }

  async checkFolderExistance(folderId: string): Promise<boolean> {
    const query = `query {
      folders (ids: ${folderId}) {
        name
        id
      }
    }`;
    const { error, response } = await this.mondayRequest<MondayFolderResponse>({ query });
    if (error) {
      throw error;
    }
    return !!response?.data?.folders[0];
  }

  async deleteItem(itemId: string): Promise<MondayResponse<MondayDeleteItemResponse>> {
    const query = `mutation {
      delete_item (item_id: ${itemId}) {
        id
      }
    }
    `;
    return this.mondayRequest<MondayDeleteItemResponse>({ query });
  }

  /**
   * Delete all subitems of a parent item in Monday.com
   */
  async deleteSubItems(boardId: string, parentItemId: string, batchSize: number = 5): Promise<void> {
    try {
      const query = `query { items(ids: ${parentItemId}) { subitems { id name } } }`;
      const { error, response } = await this.mondayRequest<{ items: Array<{ subitems: Array<{ id: string; name: string }> }> }>({ query });
      if (error || !response?.data?.items?.[0]?.subitems) {
        logger.error('mondayService.deleteSubItems - Failed to fetch subitems', { boardId, parentItemId, error: extractErrorInfo(error) });
        return;
      }
      const subitems = response.data.items[0].subitems;
      for (let i = 0; i < subitems.length; i += batchSize) {
        const batch = subitems.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (subitem) => {
            try {
              await this.deleteItem(subitem.id);
            } catch (deleteErr) {
              logger.error('mondayService.deleteSubItems - Error deleting subitem', {
                subitemId: subitem.id,
                parentItemId,
                error: extractErrorInfo(deleteErr),
              });
            }
          }),
        );
      }
    } catch (err) {
      logger.error('mondayService.deleteSubItems - Unexpected error', { boardId, parentItemId, error: extractErrorInfo(err) });
    }
  }

  async getColumnId(boardId: string, columnName: string): Promise<string | null> {
    const query = `query {
      boards(ids: ${boardId}) {
        columns {
          id
          title
          type
        }
      }
    }`;
    const { error, response } = await this.mondayRequest<MondayBoardResponse>({ query });
    if (error) {
      throw error;
    }
    const columns = response?.data?.boards[0]?.columns;
    if (columns) {
      const column = columns.find((el) => el.title === columnName);
      if (column) {
        return column.id;
      }
    }
    return null;
  }

  /**
   * Get multiple column IDs from Monday.com board
   */
  async getColumnsId(boardId: string, columnNames: string[]): Promise<Array<{ name: string; id: string | null }>> {
    try {
      const query = `query {
        boards(ids: ${boardId}) {
          columns {
            id
            title
            type
          }
        }
      }`;
      const { error, response } = await this.mondayRequest<MondayBoardResponse>({ query });
      if (error) {
        throw error;
      }

      const columns = response?.data?.boards[0]?.columns;
      if (!columns) {
        return columnNames.map((name) => ({ name, id: null }));
      }

      return columnNames.map((columnName) => {
        const column = columns.find((el) => el.title === columnName);
        return {
          name: columnName,
          id: column ? column.id : null,
        };
      });
    } catch (error) {
      logger.error(`mondayService.getColumnsId - Unexpected error. BoardId: ${boardId}`, { error });
      return columnNames.map((name) => ({ name, id: null }));
    }
  }
}
