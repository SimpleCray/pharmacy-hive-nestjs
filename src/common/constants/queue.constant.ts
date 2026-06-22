export const QUEUE_JOB_TYPES = {
  TEST: 'TEST',
  SYNC_FORM_SUBMISSION_TO_MONDAY: 'SYNC_FORM_SUBMISSION_TO_MONDAY',
} as const;

export type QueueJobType = (typeof QUEUE_JOB_TYPES)[keyof typeof QUEUE_JOB_TYPES];

/** Queue names — kept identical to the Express app so existing Redis jobs/board work unchanged. */
export const QUEUE_NAMES = {
  SYNC_DATA: 'sync-data',
} as const;
