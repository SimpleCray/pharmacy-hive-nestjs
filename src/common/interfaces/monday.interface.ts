export interface MondayRequestProps {
  query: string;
  variables?: Record<string, unknown> | undefined;
  retry?: boolean;
}

export interface MondayResponse<T> {
  error: unknown;
  response: {
    data: T;
    errors?: Array<{ message: string } | string>;
    error_message?: string;
  } | null;
}

export interface ColumnValue {
  id: string;
  value: string | null;
  type: string;
  text: string | null;
  linked_item_ids?: string[];
  display_value?: string;
  column?: {
    id: string;
    title: string;
    type: string;
    settings_str: string;
  };
}

export interface Item {
  id: string;
  name: string;
  column_values?: ColumnValue[];
  subitems?: Item[];
}

/** Board column metadata from `boards { columns { ... } }` */
export interface MondayBoardColumn {
  id: string;
  title: string;
  type: string;
}

export interface Board {
  id: string;
  name: string;
  workspace_id: string;
  items_page?: {
    items: Item[];
    cursor: string;
  };
  columns?: Array<{
    id: string;
    settings_str: string;
    title: string;
    type: string;
  }>;
}

export interface MondayBoardResponse {
  boards: Array<{
    id: string;
    name: string;
    workspace_id: string;
    items_page: {
      items: Item[];
      cursor: string;
    };
    columns: Array<{
      id: string;
      settings_str: string;
      title: string;
      type: string;
    }>;
  }>;
}

export interface MondayNextItemsPageResponse {
  next_items_page: {
    items: Item[];
    cursor: string;
  };
}

export interface MondayItemsByColumnValuesResponse {
  items_page_by_column_values: {
    items: Array<{
      id: string;
      name: string;
      column_values: ColumnValue[];
    }>;
  };
}

export interface MondayFolderResponse {
  folders: Array<{
    id: string;
    name: string;
  }>;
}

export interface MondayCreateFolderResponse {
  create_folder: {
    id: string;
  };
}

export interface MondayDeleteItemResponse {
  delete_item: {
    id: string;
  };
}

export interface MondayCreateBoardResponse {
  create_board: {
    id: string;
  };
}

export interface MondayCreateItemResponse {
  create_item: {
    id: string;
  };
}

export interface MondayChangeColumnValueResponse {
  change_simple_column_value: {
    id: string;
  };
}

export interface MondayChangeMultipleColumnValuesResponse {
  change_multiple_column_values: {
    id: string;
  };
}

export interface MondayNotificationResponse {
  create_notification: {
    text: string;
  };
}

export interface MondayUserResponse {
  users: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

export interface MondayTeamResponse {
  teams: Array<{
    id: string;
    name: string;
  }>;
}

export interface MondayAssetResponse {
  assets: Array<{
    id: string;
    name: string;
    url: string;
    public_url: string;
  }>;
}

export interface MondayAccountResponse {
  me: {
    name: string;
    email: string;
    account: {
      name: string;
    };
  };
}
