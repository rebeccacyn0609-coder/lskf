import '../components/page.css';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Dropdown,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  DollarOutlined,
  FilterOutlined,
  KeyOutlined,
  LineChartOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { MenuProps } from 'antd';

import { PageHeader } from '../components/PageHeader';
import { QuotaAmountCell, QuotaLimitTag } from '../components/QuotaDisplay';
import {
  DEFAULT_API_KEY_QUERY,
  fetchApiKeys,
  fetchKeyUsageLogs,
  toggleApiKeyPlatformStatus,
  type ApiKeyQuery,
  type KeyUsageLogQuery,
} from '../components/apiKeyService';
import {
  formatCny3,
  formatTokens,
  type ApiKeyRow,
  type KeyUsageLogRow,
  type PlatformKeyStatus,
  type UsageLogType,
} from '../components/mockData';

const { RangePicker } = DatePicker;
const POLL_INTERVAL_MS = 5000;

const logTypeColor: Record<UsageLogType, string> = {
  消耗: 'blue',
  充值: 'green',
  扣款: 'orange',
};

const platformStatusLabel: Record<PlatformKeyStatus, string> = {
  enabled: '已启用',
  disabled: '已禁用',
};

function maskApiKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    message.success(`已复制${label}`);
  } catch {
    message.error('复制失败，请手动复制');
  }
}

function formValuesToQuery(values: Record<string, unknown>): ApiKeyQuery {
  return {
    name: (values.name as string | undefined) || undefined,
    platformStatus: (values.platformStatus as PlatformKeyStatus | 'all' | undefined) || 'all',
  };
}

export default function ApiKeyManagementPage() {
  const [form] = Form.useForm();
  const [drawerForm] = Form.useForm();
  const [appliedQuery, setAppliedQuery] = useState<ApiKeyQuery>(DEFAULT_API_KEY_QUERY);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [balance, setBalance] = useState({ current: 0, unlimited: false, totalSpent: 0 });
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [refreshAt, setRefreshAt] = useState<Date | null>(null);
  const appliedQueryRef = useRef(appliedQuery);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<ApiKeyRow | null>(null);
  const [usageRows, setUsageRows] = useState<KeyUsageLogRow[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [usageConsumeTotal, setUsageConsumeTotal] = useState(0);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usagePagination, setUsagePagination] = useState({ current: 1, pageSize: 10 });

  useEffect(() => {
    appliedQueryRef.current = appliedQuery;
  }, [appliedQuery]);

  const loadKeys = useCallback(async (query: ApiKeyQuery, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    else setPolling(true);

    try {
      const result = await fetchApiKeys(query);
      setKeys(result.rows);
      setBalance(result.balance);
      setRefreshAt(result.fetchedAt);
    } finally {
      if (!silent) setLoading(false);
      else setPolling(false);
    }
  }, []);

  useEffect(() => {
    loadKeys(DEFAULT_API_KEY_QUERY);
    const timer = window.setInterval(() => {
      loadKeys(appliedQueryRef.current, { silent: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadKeys]);

  const loadUsageLogs = useCallback(
    async (key: ApiKeyRow, page: number, pageSize: number, drawerValues?: Record<string, unknown>) => {
      setUsageLoading(true);
      const values = drawerValues ?? drawerForm.getFieldsValue();
      const query: KeyUsageLogQuery = {
        keyId: key.id,
        model: (values.model as string | undefined) || undefined,
        timeRange: (values.timeRange as [Dayjs, Dayjs] | null | undefined) ?? null,
        page,
        pageSize,
      };
      try {
        const result = await fetchKeyUsageLogs(query);
        setUsageRows(result.rows);
        setUsageTotal(result.total);
        setUsageConsumeTotal(result.consumeTotal);
      } finally {
        setUsageLoading(false);
      }
    },
    [drawerForm],
  );

  const openUsageDrawer = (record: ApiKeyRow) => {
    setActiveKey(record);
    setDrawerOpen(true);
    drawerForm.resetFields();
    setUsagePagination({ current: 1, pageSize: 10 });
    loadUsageLogs(record, 1, 10, { model: undefined, timeRange: null });
  };

  const handleToggleStatus = (record: ApiKeyRow) => {
    const next = toggleApiKeyPlatformStatus(record.id);
    message.success(`密钥「${record.name}」已${next === 'enabled' ? '启用' : '禁用'}`);
    loadKeys(appliedQuery);
  };

  const handleSearch = () => {
    const query = formValuesToQuery(form.getFieldsValue());
    setAppliedQuery(query);
    loadKeys(query);
    message.success('已按查询条件刷新密钥列表');
  };

  const handleReset = () => {
    form.resetFields();
    setAppliedQuery(DEFAULT_API_KEY_QUERY);
    loadKeys(DEFAULT_API_KEY_QUERY);
    message.info('已重置查询条件');
  };

  const handleDrawerSearch = () => {
    if (!activeKey) return;
    setUsagePagination((prev) => ({ ...prev, current: 1 }));
    loadUsageLogs(activeKey, 1, usagePagination.pageSize);
  };

  const handleDrawerReset = () => {
    drawerForm.resetFields();
    if (!activeKey) return;
    setUsagePagination({ current: 1, pageSize: 10 });
    loadUsageLogs(activeKey, 1, 10, { model: undefined, timeRange: null });
  };

  const handleUsageTableChange = (pagination: TablePaginationConfig) => {
    if (!activeKey) return;
    const current = pagination.current ?? 1;
    const pageSize = pagination.pageSize ?? 10;
    setUsagePagination({ current, pageSize });
    loadUsageLogs(activeKey, current, pageSize);
  };

  const balanceDisplay = balance.unlimited ? '无限' : `¥${formatCny3(balance.current)}`;

  const refreshTimeText = refreshAt?.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) ?? '—';

  const keyColumns: ColumnsType<ApiKeyRow> = useMemo(
    () => [
      { title: '密钥名称', dataIndex: 'name', width: 130, ellipsis: true },
      {
        title: '密钥状态',
        dataIndex: 'platformStatus',
        width: 96,
        render: (status: PlatformKeyStatus) => (
          <Tag color={status === 'enabled' ? 'success' : 'default'}>{platformStatusLabel[status]}</Tag>
        ),
      },
      {
        title: 'API 密钥',
        dataIndex: 'apiKey',
        width: 200,
        render: (key: string) => (
          <Space size={4}>
            <Typography.Text code className="api-key-code">
              {maskApiKey(key)}
            </Typography.Text>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyText(key, '密钥')}
              aria-label="复制密钥"
            />
          </Space>
        ),
      },
      {
        title: '额度限制',
        width: 88,
        render: (_, record) => <QuotaLimitTag mode={record.quotaMode} />,
      },
      {
        title: '密钥额度/消费总额',
        width: 180,
        render: (_, record) => (
          <QuotaAmountCell
            mode={record.quotaMode}
            totalQuota={record.totalQuota}
            remainingQuota={record.remainingQuota}
            consumptionTotal={record.consumptionTotal}
          />
        ),
      },
      {
        title: '允许模型',
        dataIndex: 'allowedModels',
        width: 180,
        render: (models: string[]) => {
          if (!models.length) return <Tag className="model-tag">全部</Tag>;
          const visible = models.slice(0, 2);
          const rest = models.length - visible.length;
          return (
            <Space size={4} wrap className="model-tag-group">
              {visible.map((model) => (
                <Tag key={model} className="model-tag">
                  {model}
                </Tag>
              ))}
              {rest > 0 ? <Tag className="model-tag model-tag--more">+{rest}</Tag> : null}
            </Space>
          );
        },
      },
      {
        title: 'IP 限制',
        dataIndex: 'ipLimit',
        width: 130,
        ellipsis: true,
        render: (value: string) => value || '无限制',
      },
      { title: '最后使用时间', dataIndex: 'lastUsedAt', width: 168 },
      {
        title: '操作',
        width: 220,
        fixed: 'right',
        render: (_, record) => {
          const moreItems: MenuProps['items'] = [
            {
              key: 'copyLink',
              icon: <CopyOutlined />,
              label: '复制链接',
              onClick: () => copyText(record.invokeLink, '链接'),
            },
            {
              key: 'copyKey',
              icon: <CopyOutlined />,
              label: '复制密钥',
              onClick: () => copyText(record.apiKey, '密钥'),
            },
          ];
          return (
            <Space className="table-actions" wrap size={0}>
              <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
                {record.platformStatus === 'enabled' ? '禁用' : '启用'}
              </Button>
              <Button
                type="link"
                size="small"
                icon={<LineChartOutlined />}
                onClick={() => openUsageDrawer(record)}
              >
                用量查询
              </Button>
              <Dropdown menu={{ items: moreItems }} trigger={['click']}>
                <Button type="link" size="small" icon={<MoreOutlined />}>
                  更多
                </Button>
              </Dropdown>
            </Space>
          );
        },
      },
    ],
  );

  const usageColumns: ColumnsType<KeyUsageLogRow> = useMemo(
    () => [
      {
        title: '类型',
        dataIndex: 'type',
        width: 80,
        render: (type: UsageLogType) => <Tag color={logTypeColor[type]}>{type}</Tag>,
      },
      { title: '时间', dataIndex: 'time', width: 168 },
      { title: '密钥名称', dataIndex: 'keyName', width: 120, ellipsis: true },
      { title: '模型', dataIndex: 'model', width: 130 },
      {
        title: '耗时',
        dataIndex: 'durationMs',
        width: 96,
        align: 'right',
        render: (value: number) => (value ? `${value} ms` : '—'),
      },
      {
        title: 'tokens',
        dataIndex: 'tokens',
        width: 100,
        align: 'right',
        render: (value: number) => (value ? formatTokens(value) : '—'),
      },
      {
        title: '费用（CNY）',
        dataIndex: 'costCny',
        width: 120,
        align: 'right',
        render: (value: number) => (value ? `¥${formatCny3(value)}` : '—'),
      },
      { title: '详情/备注', dataIndex: 'remark', ellipsis: true },
    ],
    [],
  );

  return (
    <div className="dev-platform-page">
      <PageHeader
        title="密钥管理"
        description="默认每 5 秒自动拉取运营管理端密钥与余额数据；密钥启用/禁用由开发平台本地控制。金额保留 3 位小数。"
      />

      <section className="balance-stat-row" aria-label="余额消耗情况">
        <div className="balance-stat-row-head">
          <div className="balance-stat-row-title-block">
            <h5 className="balance-stat-row-title">余额消耗情况</h5>
            <span className="balance-stat-row-desc">每 5 秒同步运营管理端数据</span>
          </div>
          <div className="balance-refresh-meta">
            <span className="balance-live-dot" aria-hidden />
            <SyncOutlined className="balance-refresh-icon" spin={polling} />
            <span>最近更新 {refreshTimeText}</span>
          </div>
        </div>

        <div className="balance-stat-row-grid">
          <Tooltip title={balance.unlimited ? '项目额度为无限' : '运营管理端项目剩余额度'}>
            <div className="balance-stat-pill balance-stat-pill--balance">
              <div className="balance-stat-pill-head">
                <WalletOutlined className="balance-stat-pill-icon" aria-hidden />
                <span className="balance-stat-pill-label">系统充值余额</span>
                {!balance.unlimited ? (
                  <Tag className="balance-stat-pill-tag" color="processing">
                    有限
                  </Tag>
                ) : (
                  <Tag className="balance-stat-pill-tag" color="default">
                    无限
                  </Tag>
                )}
              </div>
              <div className={`balance-stat-pill-value${balance.unlimited ? ' is-unlimited' : ''}`}>
                {balanceDisplay}
              </div>
            </div>
          </Tooltip>

          <Tooltip title="运营管理端对应项目的消费总额">
            <div className="balance-stat-pill balance-stat-pill--spent">
              <div className="balance-stat-pill-head">
                <DollarOutlined className="balance-stat-pill-icon" aria-hidden />
                <span className="balance-stat-pill-label">消费总额</span>
                <Tag className="balance-stat-pill-tag" color="default">
                  累计
                </Tag>
              </div>
              <div className="balance-stat-pill-value">¥{formatCny3(balance.totalSpent)}</div>
            </div>
          </Tooltip>
        </div>
      </section>

      <Card bordered={false} className="page-card usage-log-card platform-section-card">
        <div className="usage-log-card-head">
          <div className="usage-log-card-head-main">
            <KeyOutlined className="filter-card-head-icon" />
            <span className="filter-card-head-title">密钥列表</span>
            <Tag className="platform-count-tag">{keys.length} 个密钥</Tag>
            <span className="filter-card-head-hint">运营管理端已启用 · 状态为开发平台侧筛选</span>
          </div>
        </div>

        <Form form={form} layout="vertical" className="filter-panel usage-log-filter platform-section-filter">
          <Row gutter={[16, 0]} align="bottom">
            <Col xs={24} sm={12} md={8} lg={6}>
              <Form.Item name="name" label="密钥名称">
                <Input placeholder="模糊搜索" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Form.Item name="platformStatus" label="密钥状态" initialValue="all">
                <Select
                  placeholder="全部"
                  options={[
                    { value: 'all', label: '全部' },
                    { value: 'enabled', label: '已启用' },
                    { value: 'disabled', label: '已禁用' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8} lg={6} className="filter-actions">
              <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={handleSearch}>
                查询
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Col>
          </Row>
        </Form>

        <Table
          rowKey="id"
          className="platform-data-table"
          columns={keyColumns}
          dataSource={keys}
          loading={loading}
          scroll={{ x: 1400 }}
          size="middle"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>

      <Drawer
        title={`用量查询 · ${activeKey?.name ?? ''}`}
        width={920}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        className="key-usage-drawer"
      >
        <div className="usage-log-card-head">
          <div className="usage-log-card-head-main">
            <FilterOutlined className="filter-card-head-icon" />
            <span className="filter-card-head-title">消耗日志</span>
            <span className="filter-card-head-hint">当前密钥下的调用消耗记录</span>
          </div>
        </div>

        <Form form={drawerForm} layout="vertical" className="filter-panel usage-log-filter">
          <Row gutter={16} align="bottom">
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="timeRange" label="时间段（不选则全部）">
                <RangePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Form.Item name="model" label="模型">
                <Input placeholder="模糊搜索" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} lg={6} className="filter-actions">
              <Button type="primary" icon={<SearchOutlined />} loading={usageLoading} onClick={handleDrawerSearch}>
                查询
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleDrawerReset}>
                重置
              </Button>
            </Col>
          </Row>
        </Form>

        <Table
          rowKey="id"
          columns={usageColumns}
          dataSource={usageRows}
          loading={usageLoading}
          scroll={{ x: 960 }}
          size="middle"
          pagination={{
            current: usagePagination.current,
            pageSize: usagePagination.pageSize,
            total: usageTotal,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={handleUsageTableChange}
        />

        <div className="usage-result-summary" aria-label="消耗总额汇总">
          <span>
            当前查询消耗总额（参考） <strong>¥{formatCny3(usageConsumeTotal)}</strong>
          </span>
        </div>
      </Drawer>
    </div>
  );
}
