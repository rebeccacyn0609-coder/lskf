import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

import {
  mockApiKeys,
  mockKeyUsageLogs,
  projectBalance,
  type ApiKeyRow,
  type KeyUsageLogRow,
  type PlatformKeyStatus,
} from './mockData';

export interface ApiKeyQuery {
  name?: string;
  platformStatus?: PlatformKeyStatus | 'all';
}

export interface KeyUsageLogQuery {
  keyId: string;
  model?: string;
  timeRange: [Dayjs, Dayjs] | null;
  page: number;
  pageSize: number;
}

export interface KeyUsageLogResult {
  rows: KeyUsageLogRow[];
  total: number;
  consumeTotal: number;
  fetchedAt: Date;
}

export interface ApiKeyListResult {
  rows: ApiKeyRow[];
  balance: {
    current: number;
    unlimited: boolean;
    totalSpent: number;
  };
  fetchedAt: Date;
}

let platformStatusOverrides: Record<string, PlatformKeyStatus> = {};

function parseLogTime(time: string): Dayjs {
  return dayjs(time.replace(' ', 'T'));
}

function applyPlatformStatus(key: ApiKeyRow): ApiKeyRow {
  const override = platformStatusOverrides[key.id];
  if (!override) return key;
  return { ...key, platformStatus: override };
}

function matchesFuzzy(value: string, keyword?: string): boolean {
  if (!keyword?.trim()) return true;
  return value.toLowerCase().includes(keyword.trim().toLowerCase());
}

export function filterApiKeys(query: ApiKeyQuery): ApiKeyRow[] {
  return mockApiKeys
    .filter((key) => key.opsStatus === 'active')
    .map(applyPlatformStatus)
    .filter((key) => {
      if (!matchesFuzzy(key.name, query.name)) return false;
      if (query.platformStatus && query.platformStatus !== 'all' && key.platformStatus !== query.platformStatus) {
        return false;
      }
      return true;
    });
}

function filterKeyUsageLogs(query: KeyUsageLogQuery): KeyUsageLogRow[] {
  return mockKeyUsageLogs.filter((row) => {
    if (row.keyId !== query.keyId) return false;
    if (!matchesFuzzy(row.model, query.model)) return false;
    if (query.timeRange?.[0] && query.timeRange[1]) {
      const t = parseLogTime(row.time).valueOf();
      if (t < query.timeRange[0].valueOf() || t > query.timeRange[1].valueOf()) return false;
    }
    return true;
  });
}

export function summarizeKeyUsageLogs(rows: KeyUsageLogRow[]): number {
  const total = rows.reduce((sum, row) => {
    if (row.type !== '消耗') return sum;
    return sum + (Number(row.costCny) || 0);
  }, 0);
  return Number(total.toFixed(3));
}

/** 模拟拉取运营管理端已启用密钥及项目余额 */
export function fetchApiKeys(query: ApiKeyQuery): Promise<ApiKeyListResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({
        rows: filterApiKeys(query),
        balance: {
          current: projectBalance.unlimited
            ? 0
            : Number((projectBalance.current - Math.random() * 0.3).toFixed(3)),
          unlimited: projectBalance.unlimited,
          totalSpent: projectBalance.totalSpent,
        },
        fetchedAt: new Date(),
      });
    }, 240);
  });
}

export function toggleApiKeyPlatformStatus(keyId: string): PlatformKeyStatus {
  const key = mockApiKeys.find((item) => item.id === keyId);
  if (!key) return 'disabled';
  const current = platformStatusOverrides[keyId] ?? key.platformStatus;
  const next: PlatformKeyStatus = current === 'enabled' ? 'disabled' : 'enabled';
  platformStatusOverrides[keyId] = next;
  return next;
}

export function fetchKeyUsageLogs(query: KeyUsageLogQuery): Promise<KeyUsageLogResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const filtered = filterKeyUsageLogs(query);
      const start = (query.page - 1) * query.pageSize;
      const rows = filtered.slice(start, start + query.pageSize);
      resolve({
        rows,
        total: filtered.length,
        consumeTotal: summarizeKeyUsageLogs(filtered),
        fetchedAt: new Date(),
      });
    }, 220);
  });
}

export const DEFAULT_API_KEY_QUERY: ApiKeyQuery = {
  name: undefined,
  platformStatus: 'all',
};
