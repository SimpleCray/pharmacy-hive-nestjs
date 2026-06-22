export interface JotformApiResponse<T> {
  responseCode: number;
  message: string;
  content: T;
  duration?: string;
  info?: unknown;
  resultSet?: {
    offset: number;
    limit: number;
    orderby: string;
    count: number;
  };
  'limit-left': number;
}

export interface FormSummary {
  id: string;
  username: string;
  title: string;
  height: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_submission: string | null;
  new: string;
  count: string;
  type: string;
  favorite: string;
  archived: string;
  url: string;
  folders: string;
}

export interface FormQuestion {
  hint?: string;
  labelAlign?: string;
  name: string;
  order: string;
  qid: string;
  readonly?: string;
  required?: string;
  shrink?: string;
  size?: string;
  text: string;
  type: string;
  validation?: string;
  middle?: string;
  prefix?: string;
  suffix?: string;
  cols?: string;
  rows?: string;
  entryLimit?: string;
  sublabels?: Record<string, string>;
  [key: string]: unknown;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  ip: string;
  created_at: string;
  updated_at: string;
  status: string;
  new: string;
  answers: Record<string, FormAnswer>;
  workflowStatus: string;
}

export enum JotformControlType {
  HEAD = 'control_head',
  FULLNAME = 'control_fullname',
  EMAIL = 'control_email',
  PHONE = 'control_phone',
  TEXTBOX = 'control_textbox',
  CHECKBOX = 'control_checkbox',
  NUMBER = 'control_number',
  TEXTAREA = 'control_textarea',
  FILEUPLOAD = 'control_fileupload',
  BUTTON = 'control_button',
  ADDRESS = 'control_address',
  DATETIME = 'control_datetime',
  RADIO = 'control_radio',
  DROPDOWN = 'control_dropdown',
  SIGNATURE = 'control_signature',
  DATE = 'control_date',
  TIME = 'control_time',
}

export interface FormAnswer {
  name?: string;
  order?: string;
  qid?: string;
  text: string;
  type: string;
  answer?: string | string[] | FormFullNameAnswer | Record<string, unknown>;
  prettyFormat?: string;
}

export interface FormFullNameAnswer {
  first?: string;
  last?: string;
  middle?: string;
  prefix?: string;
  suffix?: string;
}

export type FormQuestionsMap = Record<string, FormQuestion>;
export type WebhookContent = string[] | Record<string, string>;

export interface FormQuestionsResponse extends JotformApiResponse<FormQuestionsMap> {
  duration?: string;
  info?: unknown;
}
