import { DocumentStatus } from '../types/enums';
import {
  evaluateCnhCompliance,
  type CnhEvaluationResult,
  DEFAULT_CIVIL_TIMEZONE,
} from '../shared/utils/civilDate';

export { type CnhEvaluationResult };

export function evaluateCnhStatus(
  expiration?: string | null,
  options?: {
    now?: Date;
    timeZone?: string;
    yellowDays?: number;
    redDays?: number;
  }
): DocumentStatus {
  return evaluateCnhCompliance(expiration, options).status;
}

export function evaluateCnhStatusDetailed(
  expiration?: string | null,
  options?: {
    now?: Date;
    timeZone?: string;
    yellowDays?: number;
    redDays?: number;
  }
): CnhEvaluationResult {
  return evaluateCnhCompliance(expiration, options);
}
