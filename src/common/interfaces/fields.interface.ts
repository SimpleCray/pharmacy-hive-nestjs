/** Monday dynamic mapping field definition returned by the Field Definitions URL */
export interface MondayFieldDefinition {
  id: string;
  title: string;
  outboundType: MondayOutboundType;
  inboundTypes: MondayInboundType[];
}

export type MondayOutboundType = 'text' | 'numeric' | 'text_array' | 'date_time' | 'date' | 'boolean' | 'user_emails' | 'text_with_label';
export type MondayInboundType = 'text' | 'numeric' | 'text_array' | 'date' | 'date_time' | 'boolean' | 'user_emails' | 'text_with_label';

/**
 * Maps a Jotform question type to its Monday.com dynamic mapping outbound/inbound types.
 * Any type not listed here falls back to { outboundType: 'text', inboundTypes: ['text'] }.
 */
export const JOTFORM_TYPE_TO_MONDAY_TYPE: Record<string, Pick<MondayFieldDefinition, 'outboundType' | 'inboundTypes'>> = {
  control_textbox: { outboundType: 'text', inboundTypes: ['text', 'text_array', 'numeric', 'date', 'date_time', 'boolean'] },
  control_textarea: { outboundType: 'text', inboundTypes: ['text', 'text_array', 'numeric', 'date', 'date_time', 'boolean'] },
  control_fullname: { outboundType: 'text', inboundTypes: ['text', 'text_array'] },
  control_email: { outboundType: 'text', inboundTypes: ['text', 'text_array'] },
  control_phone: { outboundType: 'text', inboundTypes: ['text', 'text_array'] },
  control_link: { outboundType: 'text_with_label', inboundTypes: ['text', 'text_with_label'] },
  control_number: { outboundType: 'numeric', inboundTypes: ['numeric'] },
  control_rating: { outboundType: 'numeric', inboundTypes: ['numeric'] },
  control_checkbox: { outboundType: 'text_array', inboundTypes: ['text', 'text_array', 'numeric'] },
  control_dropdown: { outboundType: 'text', inboundTypes: ['text', 'text_array', 'numeric'] },
  control_radio: { outboundType: 'text', inboundTypes: ['text', 'text_array', 'numeric'] },
  control_date: { outboundType: 'date_time', inboundTypes: ['date', 'date_time'] },
  control_datetime: { outboundType: 'date_time', inboundTypes: ['date', 'date_time'] },
  control_time: { outboundType: 'text', inboundTypes: ['text'] },
  control_fileupload: { outboundType: 'text', inboundTypes: ['text'] },
  control_address: { outboundType: 'text', inboundTypes: ['text', 'text_array'] },
  control_widget: { outboundType: 'boolean', inboundTypes: ['boolean'] },
  control_signature: { outboundType: 'text', inboundTypes: ['text'] },
};

export const MONDAY_FIELD_TYPE_FALLBACK: Pick<MondayFieldDefinition, 'outboundType' | 'inboundTypes'> = {
  outboundType: 'text',
  inboundTypes: ['text'],
};

/** Shared form list option used in both field and subscription payloads */
export interface MondayFormListSelection {
  value: string;
  title: string;
  invalid: boolean;
}

/** Monday custom recipe / integration request body for field endpoints */
export interface MondayFieldsDependencyData {
  fieldTypeId: number;
  formList: MondayFormListSelection;
}

export interface MondayFieldsPayload {
  formList: MondayFormListSelection;
  side: string;
  recipeId: number;
  integrationId: number;
  dependencyData: MondayFieldsDependencyData;
}

export interface MondayFieldsRequestBody {
  payload: MondayFieldsPayload;
}

/** Monday subscription request body sent when a user subscribes/unsubscribes */
export interface MondaySubscriptionInboundFieldValues {
  formList: MondayFormListSelection;
}

export interface MondaySubscriptionPayload {
  webhookUrl: string;
  subscriptionId: number;
  previousSubscriptionId: number | null;
  blockMetadata: {
    shouldCalculateDynamicMapping: boolean;
  };
  inboundFieldValues: MondaySubscriptionInboundFieldValues;
  credentialsValues: Record<string, unknown>;
  inputFields: MondaySubscriptionInboundFieldValues;
  recipeId: number;
  integrationId: number;
}

export interface MondaySubscribeRequestBody {
  payload: MondaySubscriptionPayload;
  webhookType: string;
}

export interface MondayUnsubscribePayload {
  webhookId: string;
  unsubscribeReason: string;
}

export interface MondayUnsubscribeRequestBody {
  payload: MondayUnsubscribePayload;
  webhookType: string;
}

/** @deprecated Use MondaySubscribeRequestBody or MondayUnsubscribeRequestBody */
export interface MondaySubscriptionRequestBody {
  payload: MondaySubscriptionPayload;
  webhookType: string;
  action: string;
  webhookId?: string;
}
