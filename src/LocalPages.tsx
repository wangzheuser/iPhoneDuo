import { useEffect, useState, type FormEvent } from "react";
import {
  LoaderCircle,
  RefreshCw,
  Settings2,
  Radio,
  LayoutDashboard,
  Clock3,
} from "lucide-react";
import type { Bridge } from "./api";
import {
  active,
  LOCAL_ID,
  localDefaults,
  type Account,
  type Action,
  type Data,
  type ScheduleRequest,
  type Snapshot,
  type Task,
} from "./types";
import { duoProducts, presetProducts, priceText } from "./products";
import { useAccountPrivacy } from "./AccountPrivacy";
import { AddressForm } from "./AddressForm";
import { SelectField } from "./SelectField";

export type Route = "workspace" | "settings" | "duo" | "schedule";
const readRoute = (): Route =>
  location.hash === "#/settings"
    ? "settings"
    : location.hash === "#/duo"
      ? "duo"
      : location.hash === "#/schedule"
        ? "schedule"
        : "workspace";
export function useRoute() {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return [
    route,
    (next: Route) => {
      location.hash = next === "workspace" ? "/" : `/${next}`;
      setRoute(next);
    },
  ] as const;
}
export function RouteNav({
  route,
  navigate,
}: {
  route: Route;
  navigate: (route: Route) => void;
}) {
  return (
    <nav className="route-nav" aria-label="页面导航">
      {(
        [
          ["workspace", "账号工作台", LayoutDashboard],
          ["settings", "本地配置", Settings2],
          ["duo", "DUO 状态", Radio],
          ["schedule", "定时抢单", Clock3],
        ] as const
      ).map(([id, label, Icon]) => (
        <a
          key={id}
          title={label}
          aria-label={label}
          href={id === "workspace" ? "#/" : `#/${id}`}
          aria-current={route === id ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault();
            navigate(id);
          }}
        >
          <Icon size={16} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
export function ProductSelect({
  sku,
  onChange,
}: {
  sku: string;
  onChange: (sku: string) => void;
}) {
  const known = presetProducts.some((p) => p.sku === sku.replace(/\/A$/i, ""));
  return (
    <SelectField
      label="预制商品"
      value={known ? sku.replace(/\/A$/i, "") : ""}
      onChange={onChange}
      options={[
        { value: "", label: "自定义 SKU" },
        ...presetProducts.map((p) => ({
          value: p.sku,
          label: `${p.name} · ${p.sku}`,
        })),
      ]}
    />
  );
}
function localDateTime(ms: number) {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function dateTimeText(ms: number) {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}
const scheduleLabels: Record<string, string> = {
  armed: "待执行",
  running: "尝试中",
  waiting: "等待输入",
  retrying: "等待下一次尝试",
  succeeded: "已下单",
  failed: "失败",
  cancelled: "已取消",
  expired: "已结束",
  unknown: "结果不确定",
};
type PageProps = {
  snapshot: Snapshot;
  bridge: Bridge;
  refresh: () => Promise<void>;
};
export function SchedulePage({ snapshot, bridge, refresh }: PageProps) {
  const { format } = useAccountPrivacy();
  const accounts = snapshot.accounts.filter((account) => !account.pending);
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const account = accounts.find((item) => item.id === accountId);
  const now = Date.now();
  const [sku, setSku] = useState(account?.preset_sku || "MK2U4CH");
  const [quantity, setQuantity] = useState(account?.preset_quantity || 1);
  const [startAt, setStartAt] = useState(localDateTime(now + 60_000));
  const [deadlineAt, setDeadlineAt] = useState(localDateTime(now + 120_000));
  const [interval, setInterval] = useState(5);
  const [maxAttempts, setMaxAttempts] = useState(10);
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [maxTotal, setMaxTotal] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const schedules = snapshot.schedules || [];

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    setSku(account?.preset_sku || "MK2U4CH");
    setQuantity(account?.preset_quantity || 1);
  }, [account?.id, account?.preset_sku, account?.preset_quantity]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const start = new Date(startAt).getTime();
    const deadline = new Date(deadlineAt).getTime();
    if (!accountId || !Number.isFinite(start) || !Number.isFinite(deadline)) {
      setError("请选择账号和有效的执行时间。");
      setSaving(false);
      return;
    }
    const request: ScheduleRequest = {
      accountId,
      sku,
      quantity,
      startAtMs: start,
      deadlineAtMs: deadline,
      intervalMs: interval * 1000,
      maxAttempts,
      autoConfirm,
      ...(autoConfirm ? { maxTotal } : {}),
    };
    try {
      await bridge.createSchedule(request);
      await refresh();
      setMessage("定时抢单计划已保存");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="local-page schedule-page">
      <header className="local-heading">
        <h1>定时抢单</h1>
        <p>一次性执行，在时间窗口内有限重试；应用需要保持运行。</p>
      </header>
      <section className="section schedule-create">
        <div className="section-title">
          <h2>新建计划</h2>
        </div>
        {accounts.length === 0 ? (
          <p className="muted">请先添加并完成登录验证的账号。</p>
        ) : (
          <form onSubmit={submit}>
            <div className="buy-fields">
              <SelectField
                label="账号"
                value={accountId}
                onChange={setAccountId}
                options={accounts.map((item) => ({
                  value: item.id,
                  label: format(`${item.name} · ${item.email}`),
                }))}
              />
              <label>
                商品 SKU
                <input
                  required
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                />
              </label>
              <label>
                数量
                <input
                  type="number"
                  min={1}
                  max={999}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </label>
              <label>
                开始时间
                <input
                  type="datetime-local"
                  step={1}
                  required
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </label>
              <label>
                截止时间
                <input
                  type="datetime-local"
                  step={1}
                  required
                  value={deadlineAt}
                  onChange={(e) => setDeadlineAt(e.target.value)}
                />
              </label>
              <label>
                尝试间隔（秒）
                <input
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                />
              </label>
              <label>
                最大尝试次数
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={autoConfirm}
                onChange={(e) => setAutoConfirm(e.target.checked)}
              />
              自动确认创建订单（仍不会自动付款）
            </label>
            {autoConfirm && (
              <label>
                最高总金额（人民币）
                <input
                  required
                  inputMode="decimal"
                  value={maxTotal}
                  onChange={(e) => setMaxTotal(e.target.value)}
                  placeholder="例如 5999"
                />
              </label>
            )}
            <p className="muted schedule-note">
              进入购物袋修改、结账或订单提交后不会自动重试；结果不确定时请先查询订单。
            </p>
            <div className="button-row">
              <button
                className="primary"
                type="submit"
                disabled={saving || !accountId}
              >
                保存计划
              </button>
              {message && <span role="status">{message}</span>}
            </div>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
          </form>
        )}
      </section>
      <section className="section">
        <div className="section-title">
          <h2>已有计划</h2>
        </div>
        {schedules.length === 0 ? (
          <p className="muted">暂无定时抢单计划。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>账号 / 商品</th>
                  <th>执行窗口</th>
                  <th>尝试</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => {
                  const owner = snapshot.accounts.find(
                    (item) => item.id === schedule.account_id,
                  );
                  const canCancel = [
                    "armed",
                    "retrying",
                    "running",
                    "waiting",
                  ].includes(schedule.status);
                  return (
                    <tr key={schedule.id}>
                      <td>
                        <strong>
                          {format(owner?.name || schedule.account_id)}
                        </strong>
                        <br />
                        <small>
                          {format(owner?.email || "")} · {schedule.sku} ×{" "}
                          {schedule.quantity}
                        </small>
                      </td>
                      <td>
                        <small>
                          {dateTimeText(schedule.start_at_ms)}
                          <br />至 {dateTimeText(schedule.deadline_at_ms)}
                        </small>
                      </td>
                      <td>
                        {schedule.attempts} / {schedule.max_attempts}
                      </td>
                      <td>
                        <span className={`status ${schedule.status}`}>
                          {scheduleLabels[schedule.status] || schedule.status}
                        </span>
                        {schedule.last_error && (
                          <small className="error-text">
                            {schedule.last_error}
                          </small>
                        )}
                      </td>
                      <td>
                        {canCancel && (
                          <button
                            className="text-button"
                            onClick={() =>
                              bridge
                                .cancelSchedule(schedule.id)
                                .then(refresh)
                                .catch((e) => setError(String(e)))
                            }
                          >
                            取消
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
function TaskStatus({ task, cancel }: { task?: Task; cancel: () => void }) {
  if (!task) return null;
  return (
    <div
      className={`local-task ${task.status === "failed" ? "error-text" : "muted"}`}
      id={`task-${task.id}`}
      tabIndex={-1}
      role={task.status === "failed" ? "alert" : "status"}
    >
      {active(task) && <LoaderCircle size={15} className="spin" />}
      <span>{task.result?.message || task.stage}</span>
      {active(task) && <button onClick={cancel}>取消</button>}
    </div>
  );
}
export function LocalSettings({
  snapshot,
  bridge,
  refresh,
  initialAccount = LOCAL_ID,
}: PageProps & { initialAccount?: string }) {
  const { format } = useAccountPrivacy();
  const [scope, setScope] = useState(initialAccount);
  const [requestId, setRequestId] = useState("");
  const account =
    scope === LOCAL_ID
      ? snapshot.defaults || localDefaults
      : snapshot.accounts.find((a) => a.id === scope) || localDefaults;
  const tasks = snapshot.tasks.filter((t) => t.account_id === account.id);
  const recent = (actions: Action[]) =>
    tasks
      .filter((t) => actions.includes(t.action))
      .sort(
        (a, b) => b.created_at - a.created_at || b.updated_at - a.updated_at,
      );
  const addressTasks = recent(["address_read", "address_save", "region"]);
  const requested = tasks.find((t) => t.id === requestId);
  const result = (
    requested?.status === "succeeded" && requested.result?.config
      ? requested
      : recent(["address_read", "address_save"]).find(
          (t) => t.status === "succeeded",
        )
  )?.result;
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState("");
  const busy = dispatching || tasks.some(active);
  async function start(action: Action, params: Data = {}) {
    setError("");
    setDispatching(true);
    try {
      setRequestId(await bridge.start(account.id, action, params));
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setDispatching(false);
    }
  }
  return (
    <main className="local-page">
      <header className="local-heading">
        <h1>本地配置</h1>
        <p>提前设置地址和购买偏好，保存在本机。</p>
      </header>
      <SelectField
        className="scope-select"
        label="配置范围"
        value={account.id}
        disabled={busy}
        onChange={(value) => {
          setScope(value);
          setError("");
        }}
        options={[
          { value: LOCAL_ID, label: "通用预设 · 新账号默认" },
          ...snapshot.accounts.map((a) => ({
            value: a.id,
            label: `${format(`${a.name} · ${a.email}`)}${a.pending ? "（待完成登录）" : ""}`,
          })),
        ]}
      />
      <p className="muted scope-note">
        {account.id === LOCAL_ID
          ? "新添加的账号会复制通用预设，已有账号的配置不变。无需登录即可保存。"
          : "仅修改此账号的本地配置，无需先登录。"}
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <PurchasePreset
        key={`purchase-${account.id}`}
        account={account}
        bridge={bridge}
        refresh={refresh}
      />
      <AddressForm
        key={`address-${account.id}`}
        account={account}
        busy={busy}
        result={result || undefined}
        region={
          recent(["region"]).find((t) => t.status === "succeeded")?.result
            ?.region
        }
        start={start}
      />
      <TaskStatus
        task={requested || addressTasks[0]}
        cancel={() => {
          const current = requested || addressTasks[0];
          if (current)
            bridge
              .cancel(account.id, current.id)
              .catch((e) => setError(String(e)));
        }}
      />
    </main>
  );
}
function PurchasePreset({
  account,
  bridge,
  refresh,
}: {
  account: Account;
  bridge: Bridge;
  refresh: () => Promise<void>;
}) {
  const [sku, setSku] = useState(account.preset_sku || "MK2U4CH");
  const [quantity, setQuantity] = useState(account.preset_quantity || 2);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const changeSku = (value: string) => {
    setSku(value);
    setStatus("");
  };
  return (
    <section className="section">
      <div className="section-title">
        <h2>购买预设</h2>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          setStatus("");
          try {
            await bridge.savePreset(account.id, sku, quantity);
            await refresh();
            setStatus("购买预设已保存");
          } catch (e) {
            setError(String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <ProductSelect sku={sku} onChange={changeSku} />
        <div className="buy-fields">
          <label>
            商品 SKU
            <input
              required
              value={sku}
              onChange={(e) => changeSku(e.target.value.toUpperCase())}
            />
          </label>
          <label>
            数量
            <input
              required
              type="number"
              min={1}
              max={999}
              value={quantity}
              onChange={(e) => {
                setQuantity(Number(e.target.value));
                setStatus("");
              }}
            />
          </label>
        </div>
        <p className="muted">
          预制商品仅用于快捷选择，价格与可购买状态以官网实时结果及结账金额为准。
        </p>
        <div className="button-row">
          <button type="submit" disabled={saving}>
            保存购买预设
          </button>
          <span role="status">{status}</span>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
export function DuoStatus({ snapshot, bridge, refresh }: PageProps) {
  const [requestId, setRequestId] = useState("");
  const tasks = snapshot.tasks
    .filter((t) => t.account_id === LOCAL_ID && t.action === "catalog")
    .sort((a, b) => b.created_at - a.created_at || b.updated_at - a.updated_at);
  const task = tasks.find((t) => t.id === requestId) || tasks[0];
  const result = tasks.find((t) => t.status === "succeeded")?.result;
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const busy = starting || tasks.some(active);
  const live: Data[] = result?.items || [];
  const normalize = (sku: string) => sku.toUpperCase().replace(/\/A$/, "");
  const known = new Set(duoProducts.map((p) => p.sku));
  const rows = [
    ...duoProducts.map((p) => ({
      preset: p,
      item: live.find((i) => normalize(i.sku) === p.sku),
    })),
    ...live
      .filter((i) => !known.has(normalize(i.sku)))
      .map((item) => ({ preset: undefined, item })),
  ];
  return (
    <main className="local-page duo-page">
      <header className="local-heading">
        <div>
          <h1>DUO 状态</h1>
          <p>公开发售状态 · 无需登录 Apple 账号</p>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setStarting(true);
            setError("");
            try {
              setRequestId(
                await bridge.start(LOCAL_ID, "catalog", { mode: "duo" }),
              );
              await refresh();
            } catch (e) {
              setError(String(e));
            } finally {
              setStarting(false);
            }
          }}
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          刷新状态
        </button>
      </header>
      <p className="muted">
        内置 8
        款预制商品。点击刷新读取官网选购页；未知表示官网未提供明确的加购许可，不代表有货。
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <TaskStatus
        task={task}
        cancel={() => {
          if (task)
            bridge.cancel(LOCAL_ID, task.id).catch((e) => setError(String(e)));
        }}
      />
      <div className="duo-meta">
        <span>
          {result?.queried_at
            ? `上次成功查询：${new Date(result.queried_at).toLocaleString("zh-CN")}`
            : "尚未查询官网 · 当前为预制资料"}
        </span>
        <a
          href="https://www.apple.com.cn/shop/buy-iphone/iphone-duo"
          target="_blank"
          rel="noreferrer"
        >
          官网选购页 ↗
        </a>
      </div>
      {task?.status === "failed" && result && (
        <p className="error-text">
          刷新失败，下方保留上次成功结果，并非本次实时状态。
        </p>
      )}
      {result?.purchase_message && (
        <p className="duo-message">{result.purchase_message}</p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>型号 / 配置</th>
              <th>价格</th>
              <th>发售 / 加购状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ preset, item }) => {
              const status =
                item?.can_add_to_bag === false
                  ? "未开放"
                  : item?.can_add_to_bag === true
                    ? "可加购"
                    : "未知";
              return (
                <tr key={preset?.sku || item?.sku}>
                  <td>
                    <code>{preset?.sku || item?.sku}</code>
                  </td>
                  <td>
                    {item?.name && item.name !== "iPhone Duo"
                      ? item.name
                      : preset?.name || item?.name}
                  </td>
                  <td className="price-cell">
                    {priceText(item?.price ?? preset?.price)}
                    <small>
                      {item?.price != null ? "官网价格" : "预设参考价"}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`release-status ${status === "未开放" ? "closed" : ""}`}
                    >
                      {status}
                    </span>
                    <small>
                      {item
                        ? item.coming_soon === false
                          ? "官网未标记为即将发售；许可待确认"
                          : item.reason
                        : result
                          ? "本次响应未包含此 SKU"
                          : "待刷新官网"}
                    </small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">只读查询，不进行加购，也不查询门店或配送库存。</p>
    </main>
  );
}
