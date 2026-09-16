// src/domain/admin/types.ts
import { UserRole } from '../../types/enums';

export type ComponentHealthState = 'HEALTHY' | 'DEGRADED' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export type UserAccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface TenantOperationalConfig {
  companyId: string;
  companyName: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  timezone: string;
  currency: string;
  maxVehiclesLimit: number;
  maxDriversLimit: number;
  slaResponseHours: number;
  securityPolicy: {
    enforceMfa: boolean;
    sessionTimeoutMinutes: number;
    maxLoginAttempts: number;
  };
  auditRetentionDays: number;
  backupFrequencyHours: number;
  uiPreferences: {
    density: 'COMFORTABLE' | 'COMPACT';
    theme: 'LIGHT' | 'DARK' | 'SYSTEM';
    notificationsEnabled: boolean;
  };
  updatedAt: string;
  updatedBy: string;
}

export interface SystemUserRecord {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: UserRole | string;
  status: UserAccountStatus;
  lastAccessAt: string;
  permissions: string[];
}

export interface ComponentHealthStatus {
  componentName: string;
  status: ComponentHealthState;
  score: number;
  details: string;
  lastCheckedAt: string;
}

export interface SystemHealthBreakdown {
  overallScore: number;
  statusClassification: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
  persistence: ComponentHealthStatus;
  backup: ComponentHealthStatus;
  restore: ComponentHealthStatus;
  auditLog: ComponentHealthStatus;
  multiTenancy: ComponentHealthStatus;
  rbac: ComponentHealthStatus;
  integrity: ComponentHealthStatus;
  observability: ComponentHealthStatus;
  performance: ComponentHealthStatus;
  configuration: ComponentHealthStatus;
  security: ComponentHealthStatus;
  continuity: ComponentHealthStatus;
}

export interface AdministrativeAlertItem {
  id: string;
  severity: AlertSeverity;
  category: 'SECURITY' | 'INTEGRITY' | 'BACKUP' | 'RBAC' | 'CONFIG' | 'TENANT' | 'PERFORMANCE';
  message: string;
  companyId: string;
  createdAt: string;
  correlationId: string;
  resolved: boolean;
}

export interface ActiveSessionRecord {
  sessionId: string;
  userId: string;
  userName: string;
  userRole: string;
  companyId: string;
  ipAddress: string;
  userAgent: string;
  loginTime: string;
  lastActiveTime: string;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
}

export interface RbacMatrixRule {
  role: string;
  action: string;
  allowed: boolean;
  description: string;
}
