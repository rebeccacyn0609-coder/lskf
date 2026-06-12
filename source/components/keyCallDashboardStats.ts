import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

import { mockApiKeys, projectBalance, type ApiKeyRow } from './mockData';

export type KeyScopeType = 'all' | 'single';

export interface KeyCallDashboardQuery {
  keyScope: KeyScopeType;
  keyId: string;
  dateRange: [Dayjs, Dayjs] | null;
}

export interface KeyCallDashboardStats {
  totalTokens: number | null;
  totalCost: number | null;
  totalCalls: number | null;
}

export interface TokenTrendPoint {
  date: string;
  tokens: number;
  costCny: number;
}

export interface CallTrendPoint {
  date: string;
  [model: string]: string | number;
}

export interface KeyCallDashboardResult {
  stats: KeyCallDashboardStats;
  tokenTrend: TokenTrendPoint[];
  callTrend: CallTrendPoint[];
  availableModels: string[];
}

interface DailyKeyRecord {
  at: Dayjs;
  keyId: string;
  model: string;
  tokens: number;
  costCny: number;
  calls: number;
}

const DAY_COUNT = 35;

const KEY_DAILY_PROFILE: Record<string, { tokenBase: number; costBase: number; callBase: number; wave: number }> = {
  dk1: { tokenBase: 8200, costBase: 15.2, callBase: 45, wave: 1.0 },
  dk2: { tokenBase: 2100, costBase: 3.8, callBase: 22, wave: 0.95 },
  dk3: { tokenBase: 5400, costBase: 10.5, callBase: 30, wave: 1.08 },
  dk4: { tokenBase: 3600, costBase: 6.2, callBase: 18, wave: 1.02 },
};

function getActiveKeys(): ApiKeyRow[] {
  return mockApiKeys.filter((key) => key.opsStatus === 'active');
}

function buildDailyRecords(): DailyKeyRecord[] {
  const records: DailyKeyRecord[] = [];
  const today = dayjs().startOf('day');

  getActiveKeys().forEach((key) => {
    const profile = KEY_DAILY_PROFILE[key.id] ?? { tokenBase: 4000, costBase: 7.5, callBase: 20, wave: 1 };
    const models = key.allowedModels.length > 0 ? key.allowedModels : ['gpt-4o-mini'];

    for (let offset = DAY_COUNT - 1; offset >= 0; offset -= 1) {
      const at = today.subtract(offset, 'day').hour(12);
      const dayIndex = DAY_COUNT - 1 - offset;
      const factor = 1 + (dayIndex % 3) * 0.12 + (dayIndex % 2) * 0.08;

      models.forEach((model, modelIndex) => {
        const modelFactor = 1 / models.length + modelIndex * 0.08;
        records.push({
          at,
          keyId: key.id,
          model,
          tokens: Math.round(profile.tokenBase * factor * profile.wave * modelFactor),
          costCny: Number((profile.costBase * factor * profile.wave * modelFactor).toFixed(3)),
          calls: Math.max(1, Math.round(profile.callBase * factor * modelFactor)),
        });
      });
    }
  });

  return records;
}

const DAILY_RECORDS = buildDailyRecords();

function inQueryDateRange(at: Dayjs, dateRange: [Dayjs, Dayjs] | null): boolean {
  if (!dateRange?.[0] || !dateRange[1]) return true;
  const recordDay = at.startOf('day').valueOf();
  const rangeStart = dateRange[0].startOf('day').valueOf();
  const rangeEnd = dateRange[1].endOf('day').valueOf();
  return recordDay >= rangeStart && recordDay <= rangeEnd;
}

function filterRecords(query: KeyCallDashboardQuery): DailyKeyRecord[] {
  const activeKeyIds = new Set(getActiveKeys().map((key) => key.id));

  return DAILY_RECORDS.filter((record) => {
    if (!activeKeyIds.has(record.keyId)) return false;
    if (!inQueryDateRange(record.at, query.dateRange)) return false;
    if (query.keyScope === 'single') {
      return record.keyId === query.keyId;
    }
    return true;
  });
}

function formatChartDate(at: Dayjs): string {
  return at.format('MM-DD');
}

export function computeKeyCallDashboard(query: KeyCallDashboardQuery): KeyCallDashboardResult {
  const records = filterRecords(query);

  if (query.keyScope === 'single' && !query.keyId) {
    return {
      stats: {
        totalTokens: null,
        totalCost: null,
        totalCalls: null,
      },
      tokenTrend: [],
      callTrend: [],
      availableModels: [],
    };
  }

  if (records.length === 0) {
    return {
      stats: {
        totalTokens: 0,
        totalCost: 0,
        totalCalls: 0,
      },
      tokenTrend: [],
      callTrend: [],
      availableModels: [],
    };
  }

  const totalTokens = records.reduce((sum, row) => sum + row.tokens, 0);
  const totalCost = Number(records.reduce((sum, row) => sum + row.costCny, 0).toFixed(3));
  const totalCalls = records.reduce((sum, row) => sum + row.calls, 0);

  const dayMap = new Map<string, { at: Dayjs; tokens: number; costCny: number; models: Record<string, number> }>();

  records.forEach((record) => {
    const key = record.at.format('YYYY-MM-DD');
    const bucket = dayMap.get(key) ?? {
      at: record.at,
      tokens: 0,
      costCny: 0,
      models: {},
    };
    bucket.tokens += record.tokens;
    bucket.costCny = Number((bucket.costCny + record.costCny).toFixed(3));
    bucket.models[record.model] = (bucket.models[record.model] ?? 0) + record.calls;
    dayMap.set(key, bucket);
  });

  const sortedDays = [...dayMap.values()].sort((a, b) => a.at.valueOf() - b.at.valueOf());
  const availableModels = [...new Set(records.map((row) => row.model))].sort();

  const tokenTrend: TokenTrendPoint[] = sortedDays.map((day) => ({
    date: formatChartDate(day.at),
    tokens: day.tokens,
    costCny: day.costCny,
  }));

  const callTrend: CallTrendPoint[] = sortedDays.map((day) => {
    const point: CallTrendPoint = { date: formatChartDate(day.at) };
    availableModels.forEach((model) => {
      point[model] = day.models[model] ?? 0;
    });
    return point;
  });

  return {
    stats: {
      totalTokens,
      totalCost,
      totalCalls,
    },
    tokenTrend,
    callTrend,
    availableModels,
  };
}

export function getKeyDashboardOptions() {
  return getActiveKeys().map((key) => ({
    value: key.id,
    label: key.name,
    desc: key.apiKey.slice(0, 12) + '...',
  }));
}

export interface ProjectRechargeBalance {
  current: number;
  unlimited: boolean;
}

/** 运营管理端项目充值余额（系统级，不随看板统计时间段变化） */
export function getProjectRechargeBalance(): ProjectRechargeBalance {
  return {
    current: projectBalance.unlimited
      ? 0
      : Number((projectBalance.current - Math.random() * 0.3).toFixed(3)),
    unlimited: projectBalance.unlimited,
  };
}
