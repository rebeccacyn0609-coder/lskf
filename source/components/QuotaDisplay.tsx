import React from 'react';
import { Progress, Tag, Tooltip, Typography } from 'antd';

import { formatCny3, type QuotaMode } from './mockData';

export function QuotaLimitTag({ mode }: { mode: QuotaMode }) {
  return mode === 'limited' ? <Tag>有限</Tag> : <Tag color="processing">无限</Tag>;
}

type QuotaAmountCellProps = {
  mode: QuotaMode;
  totalQuota?: number;
  remainingQuota?: number;
  consumptionTotal?: number;
};

/** 有限：剩余额度条形图 + 悬停明细；无限：消费总额 */
export function QuotaAmountCell({
  mode,
  totalQuota = 0,
  remainingQuota = 0,
  consumptionTotal = 0,
}: QuotaAmountCellProps) {
  if (mode === 'unlimited') {
    return (
      <div className="quota-amount-cell">
        <Typography.Text type="secondary" className="quota-amount-label">
          消费总额
        </Typography.Text>
        <div className="quota-amount-value">¥{formatCny3(consumptionTotal)}</div>
      </div>
    );
  }

  const total = totalQuota || 0;
  const remaining = Math.min(remainingQuota ?? 0, total);
  const used = Math.max(0, total - remaining);
  const percent = total > 0 ? Math.round((remaining / total) * 100) : 0;

  return (
    <Tooltip
      title={
        <span>
          已使用 ¥{formatCny3(used)} / 未使用 ¥{formatCny3(remaining)} / 总额度 ¥{formatCny3(total)}
        </span>
      }
    >
      <div className="quota-amount-cell quota-amount-cell--limited">
        <Progress percent={percent} size="small" showInfo={false} strokeColor="#1677ff" />
        <Typography.Text type="secondary" className="quota-amount-hint">
          剩余 ¥{formatCny3(remaining)}
        </Typography.Text>
      </div>
    </Tooltip>
  );
}
