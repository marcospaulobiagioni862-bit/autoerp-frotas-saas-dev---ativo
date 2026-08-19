export type NotificationSeverity = 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS';
export type NotificationStatus = 'UNREAD' | 'READ' | 'DISMISSED' | 'ARCHIVED';
export type SchedulerRunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface PersistentNotification {
  id: string;
  companyId: string;
  recipientUserId?: string;
  sourceType: string;
  sourceId: string;
  sourceVersion?: string;
  alertStage: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  dueDate?: string;
  destinationTab?: string;
  idempotencyKey: string;
  status: NotificationStatus;
  readAt?: string;
  dismissedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRun {
  id: string;
  jobKey: string;
  executionBucket: string;
  startedAt: string;
  finishedAt?: string;
  status: SchedulerRunStatus;
  instanceId: string;
  errorMessage?: string;
  metricsJson?: string;
  createdAt: string;
}
