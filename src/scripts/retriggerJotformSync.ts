import 'reflect-metadata';
import axios from 'axios';
import 'dotenv/config';
import { createInterface } from 'readline/promises';
import dayjs from 'dayjs';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import { JotFormService } from '../modules/jotform/jotform.service';
import { SubscriptionService } from '../modules/subscriptions/subscriptions.service';
import { SubscriptionEnum } from '../common/interfaces/subscription.interface';
import { MondaySubscriptionPayload } from '../common/interfaces/webhook.interface';
import { transformAnswer } from '../common/utils/commonFunctions';
import { EnvKey } from '../config/env.validation';

const SUBMISSION_FETCH_LIMIT = 1000;
const DATE_FORMAT = 'YYYY-MM-DD';

type CliInput = {
  formId: string;
  fromDate: string;
  toDate: string;
};

type RunSummary = {
  totalFetched: number;
  submissionSuccess: number;
  submissionFailed: number;
  webhookSuccess: number;
  webhookFailed: number;
};

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = dayjs(value);
  return parsed.isValid() && parsed.format(DATE_FORMAT) === value;
}

async function askForInputs(): Promise<CliInput | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const formId = (await rl.question('🧾 Form ID: ')).trim();
    const fromDate = (await rl.question(`📅 From date (${DATE_FORMAT}): `)).trim();
    const toDate = (await rl.question(`📅 To date (${DATE_FORMAT}): `)).trim();

    if (!formId) {
      console.error('❌ Form ID is required.');
      return null;
    }
    if (!isValidDate(fromDate)) {
      console.error(`❌ Invalid From date. Expected format: ${DATE_FORMAT}.`);
      return null;
    }
    if (!isValidDate(toDate)) {
      console.error(`❌ Invalid To date. Expected format: ${DATE_FORMAT}.`);
      return null;
    }
    if (dayjs(fromDate).isAfter(dayjs(toDate))) {
      console.error('❌ From date must be before or equal to To date.');
      return null;
    }

    return { formId, fromDate, toDate };
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  console.log('🚀 Jotform manual sync retrigger');
  const input = await askForInputs();
  if (!input) {
    process.exitCode = 1;
    return;
  }

  const { formId, fromDate, toDate } = input;
  const fromDateTime = `${fromDate} 00:00:00`;
  const toDateTimeExclusive = `${dayjs(toDate).add(1, 'day').format(DATE_FORMAT)} 00:00:00`;
  const filter = {
    'created_at:gt': fromDateTime,
    'created_at:lt': toDateTimeExclusive,
  };

  console.log('🔌 Bootstrapping application context...');
  const appContext = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const jotFormService = appContext.get(JotFormService);
  const subscriptionService = appContext.get(SubscriptionService);
  const config = appContext.get(ConfigService);
  const signingSecret = config.get<string>(EnvKey.MONDAY_SIGNING_SECRET, '');

  const subscriptions = await subscriptionService.getSubscriptions({
    webhook_type: SubscriptionEnum.FORM_SUBMISSION,
    form_id: formId,
  });

  if (!subscriptions.length) {
    console.log(`⚠️ No active subscriptions found for form ${formId}. Nothing to sync.`);
    await appContext.close();
    return;
  }

  console.log(`📡 Found ${subscriptions.length} active subscription(s).`);
  console.log(`🔎 Fetching submissions from ${fromDate} to ${toDate}...`);

  const allSubmissionIds: string[] = [];
  let offset = 0;

  while (true) {
    const response = await jotFormService.getFormSubmissions(formId, {
      limit: SUBMISSION_FETCH_LIMIT,
      offset,
      filter,
    });
    const batch = response.content ?? [];
    allSubmissionIds.push(...batch.map((item) => item.id));
    console.log(`📥 Fetched batch: ${batch.length} submission(s) (offset=${offset}).`);

    if (batch.length < SUBMISSION_FETCH_LIMIT) break;
    offset += SUBMISSION_FETCH_LIMIT;
  }

  const uniqueSubmissionIds = [...new Set(allSubmissionIds)];
  if (!uniqueSubmissionIds.length) {
    console.log('ℹ️ No submissions found in this date range.');
    await appContext.close();
    return;
  }

  console.log(`📋 Total submissions to replay: ${uniqueSubmissionIds.length}`);

  const summary: RunSummary = {
    totalFetched: uniqueSubmissionIds.length,
    submissionSuccess: 0,
    submissionFailed: 0,
    webhookSuccess: 0,
    webhookFailed: 0,
  };

  for (let index = 0; index < uniqueSubmissionIds.length; index += 1) {
    const submissionId = uniqueSubmissionIds[index];
    console.log(`\n➡️ [${index + 1}/${uniqueSubmissionIds.length}] Processing submission ${submissionId}`);

    try {
      const detailResponse = await jotFormService.getSubmissionData(submissionId);
      const formData = transformAnswer(detailResponse.content.answers, {
        submissionTimezone: detailResponse.content.ip,
      });

      const payload: MondaySubscriptionPayload = {
        trigger: {
          outputFields: {
            id: submissionId,
            formId,
            formQuestions: formData,
          },
        },
      };

      let hasFailure = false;
      for (const subscription of subscriptions) {
        try {
          await axios.post(subscription.webhook_url, payload, {
            headers: { Authorization: signingSecret },
          });
          summary.webhookSuccess += 1;
          console.log(`✅ Sent to subscription ${subscription.id}`);
        } catch (error) {
          hasFailure = true;
          summary.webhookFailed += 1;
          console.error(`❌ Failed sending to subscription ${subscription.id}:`, error);
        }
      }

      if (hasFailure) {
        summary.submissionFailed += 1;
      } else {
        summary.submissionSuccess += 1;
      }
    } catch (error) {
      summary.submissionFailed += 1;
      console.error(`❌ Failed to process submission ${submissionId}:`, error);
    }
  }

  await appContext.close();

  console.log('\n🏁 Sync replay finished');
  console.log('📊 Summary');
  console.log(`- Total fetched: ${summary.totalFetched}`);
  console.log(`- Submission success: ${summary.submissionSuccess}`);
  console.log(`- Submission failed: ${summary.submissionFailed}`);
  console.log(`- Webhook success: ${summary.webhookSuccess}`);
  console.log(`- Webhook failed: ${summary.webhookFailed}`);
}

main().catch(async (error: unknown) => {
  console.error('💥 Retrigger script failed:', error);
  process.exitCode = 1;
});
