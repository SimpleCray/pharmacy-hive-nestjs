import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig, Method } from 'axios';
import {
  FormQuestionsMap,
  FormQuestionsResponse,
  FormSubmission,
  FormSummary,
  JotformApiResponse,
  WebhookContent,
} from '../../common/interfaces/form.interface';
import createLogger from '../../common/logger/logger';
import { extractErrorInfo } from '../../common/logger/logger.utils';

const logger = createLogger();

function redactWebhookUrlSecrets(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has('secret')) {
      parsed.searchParams.set('secret', '[REDACTED]');
    }
    return parsed.toString();
  } catch {
    return '[invalid-webhook-url]';
  }
}

@Injectable()
export class JotFormService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('JOTFORM_API_KEY', '');
    this.baseUrl = this.configService.get<string>('JOTFORM_BASE_URL', '');
  }

  private request = async <T>({
    method,
    url,
    params,
    data,
  }: {
    method: Method;
    url: string;
    params?: Record<string, string | number | boolean>;
    data?: string;
  }): Promise<JotformApiResponse<T>> => {
    try {
      const config: AxiosRequestConfig<string> = {
        method,
        url: `${this.baseUrl.replace(/\/$/, '')}${url}`,
        headers: {
          APIKEY: this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        params,
        data,
      };

      const response = await axios.request<JotformApiResponse<T>>(config);
      return response.data;
    } catch (error) {
      logger.error('jotForm.service.request - Failed to call Jotform API', {
        method,
        url,
        error: extractErrorInfo(error),
      });
      throw error;
    }
  };

  getForms = async (): Promise<JotformApiResponse<FormSummary[]>> => {
    logger.info('jotForm.service.getForms - Fetching forms list');
    return this.request<FormSummary[]>({
      method: 'GET',
      url: '/user/forms',
    });
  };

  getFormQuestions = async (formId: string): Promise<FormQuestionsResponse> => {
    logger.info('jotForm.service.getFormQuestions - Fetching form questions', { formId });
    return this.request<FormQuestionsMap>({
      method: 'GET',
      url: `/form/${formId}/questions`,
    });
  };

  addWebhook = async (formId: string, webhookURL: string): Promise<JotformApiResponse<WebhookContent>> => {
    logger.info('jotForm.service.addWebhook - Adding webhook to form', {
      formId,
      webhookURL: redactWebhookUrlSecrets(webhookURL),
    });
    const body = new URLSearchParams({ webhookURL }).toString();

    return this.request<WebhookContent>({
      method: 'POST',
      url: `/form/${formId}/webhooks`,
      data: body,
    });
  };

  getFormWebhooks = async (formId: string): Promise<JotformApiResponse<WebhookContent>> => {
    logger.info('jotForm.service.getFormWebhooks - Fetching webhooks for form', { formId });
    return this.request<WebhookContent>({
      method: 'GET',
      url: `/form/${formId}/webhooks`,
    });
  };

  deleteWebhook = async (formId: string, webhookID: string): Promise<JotformApiResponse<WebhookContent>> => {
    logger.info('jotForm.service.deleteWebhook - Deleting webhook from form', { formId, webhookID });
    return this.request<WebhookContent>({
      method: 'DELETE',
      url: `/form/${formId}/webhooks/${webhookID}`,
    });
  };

  /**
   * Resolves the numeric index of a webhook by its URL, then deletes it.
   * Jotform's DELETE endpoint expects the index (e.g. "0", "1"), not the URL.
   */
  deleteWebhookByUrl = async (formId: string, webhookUrl: string): Promise<JotformApiResponse<WebhookContent> | null> => {
    const safeWebhookUrl = redactWebhookUrlSecrets(webhookUrl);
    logger.info('jotForm.service.deleteWebhookByUrl - Resolving webhook index', { formId, webhookUrl: safeWebhookUrl });

    const response = await this.getFormWebhooks(formId);
    const webhooks = response.content as Record<string, string>;
    const webhookIndex = Object.entries(webhooks).find(([, url]) => url === webhookUrl)?.[0];

    if (!webhookIndex) {
      logger.warn('jotForm.service.deleteWebhookByUrl - Webhook URL not found on form', {
        formId,
        webhookUrl: safeWebhookUrl,
      });
      return null;
    }

    return this.deleteWebhook(formId, webhookIndex);
  };

  getFormSubmissions = async (
    formId: string,
    options?: {
      limit?: number;
      offset?: number;
      filter?: Record<string, string>;
    },
  ): Promise<JotformApiResponse<FormSubmission[]>> => {
    logger.info('jotForm.service.getFormSubmissions - Fetching form submissions', { formId });
    return this.request<FormSubmission[]>({
      method: 'GET',
      url: `/form/${formId}/submissions`,
      params: {
        ...(options?.limit ? { limit: options.limit } : {}),
        ...(typeof options?.offset === 'number' ? { offset: options.offset } : {}),
        ...(options?.filter ? { filter: JSON.stringify(options.filter) } : {}),
      },
    });
  };

  getSubmissionData = async (submissionId: string): Promise<JotformApiResponse<FormSubmission>> => {
    logger.info('jotForm.service.getSubmissionData - Fetching submission data', { submissionId });
    return this.request<FormSubmission>({
      method: 'GET',
      url: `/submission/${submissionId}`,
    });
  };
}
