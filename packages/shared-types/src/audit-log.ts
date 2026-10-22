import { UserRole } from './user.js';

export interface AuditLogActor {
  id: string;
  phone: string;
  role: UserRole;
  profile: {
    fullName: string;
    avatarUrl: string | null;
  } | null;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actor: AuditLogActor;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogPaginationMeta {
  page: number;
  limit: number;
  totalLogs: number;
  totalPages: number;
}

export interface ListAuditLogsResponseData {
  logs: AuditLogItem[];
  pagination: AuditLogPaginationMeta;
}
