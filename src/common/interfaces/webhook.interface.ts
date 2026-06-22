export interface JotformWebhookBody {
  submissionID: string;
  formID: string;
  ip: string;
}

export interface HandleFormSubmissionWebhookParams {
  submissionId: string;
  formId: string;
  formData: Record<string, unknown>;
}

export interface MondayInboundFieldValues {
  id: string;
  formId: string;
  formQuestions: Record<string, unknown>;
  itemMapping: Record<string, unknown>;
  boardId: string;
}

export interface MondaySubscriptionPayload {
  trigger: {
    outputFields: {
      id: string;
      formId: string;
      formQuestions: Record<string, unknown>;
    };
  };
}

export interface MondayWebhookPayload {
  payload: {
    inboundFieldValues: MondayInboundFieldValues;
  };
}
