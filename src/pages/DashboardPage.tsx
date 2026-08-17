import {
  AlertTriangle, ArrowUpRight, Boxes, Clock3, PackageCheck, Receipt, RotateCcw, ShoppingBag,
  TrendingUp, WalletCards, Wrench,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useReport, useShop } from "../data/store";
import type { PageId } from "../types";
import {
  formatDate, formatMoney, isActiveRepair, isOverdue, isoDaysAgo, relativeTime, repairStatus, todayIso,
} from "../utils";
import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";

export function DashboardPage({ onQuickSale, onNavigate }: {
  onQuickSale: () => void;
  onNavigate: (page: PageId) => void;
}) {
  const { dashboard, repairs, products, ready, settings } = useShop();
  const { data: report } = useReport(isoDaysAgo(11), todayIso());
  const chart = useChartTheme();

  const queue = useMemo(
    () => repairs.filter((repair) => isActiveRepair(repair.status)).slice(0, 4),
    [repairs],
  );
  const lowStock = useMemo(
    () => products
      .filter((product) => product.minimumStock > 0 && product.stock <= product.minimumStock)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 4),
    [products],
  );

  const chartOption = useMemo(() => ({
    animationDuration: 620,
    grid: { top: 14, right: 8, bottom: 24, left: 6, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: chart.tooltipBg,
      borderColor: chart.border,
      textStyle: { color: chart.text, fontSize: 12 },
      formatter: (params: Array<{ axisValue: string; value: number }>) =>
        `${params[0]?.axisValue ?? ""}<br/><b>${formatMoney(params[0]?.value ?? 0)}</b>`,
    },
    xAxis: {
      type: "category",
      data: report?.series.map((item) => formatDate(item.date)) ?? [],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chart.muted, fontSize: 12, interval: 1 },
    },
    yAxis: { type: "value", show: false, splitLine: { show: false } },
    series: [{
      name: "Ciro",
      type: "bar",
      data: report?.series.map((item) => item.revenue) ?? [],
      barWidth: 12,
      itemStyle: { color: chart.cyan, borderRadius: [5, 5, 2, 2] },
      emphasis: { itemStyle: { color: chart.violet } },
    }],
  }), [report, chart]);

  if (!ready || !dashboard) {
    return (
      <div className="dashboard-grid">
        <section className="panel span-8"><Skeleton rows={5} /></section>
        <section className="panel span-4"><Skeleton rows={5} /></section>
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      <motion.section className="revenue-hero span-5" whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
        <div className="hero-glow" aria-hidden />
        <div className="hero-top">
          <span>Bugünkü Ciro</span>
          <span className="trend-pill"><TrendingUp size={13} />{settings.shopName || "Dükkan"}</span>
        </div>
        <strong>{formatMoney(dashboard.todayRevenue, true)}</strong>
        <div className="hero-meta">
          <span>{dashboard.todaySaleCount} satış</span>
          <i aria-hidden />
          <span>Kâr {formatMoney(dashboard.todayProfit, true)}</span>
        </div>
        <button onClick={onQuickSale}>Satış yap <ArrowUpRight size={16} /></button>
        <div className="hero-bars" aria-hidden>
          {(report?.series ?? []).slice(-12).map((item, index, all) => {
            const peak = Math.max(...all.map((entry) => entry.revenue), 1);
            return <i key={item.date} style={{ height: `${Math.max(8, (item.revenue / peak) * 100)}%`, opacity: 0.3 + index * 0.05 }} />;
          })}
        </div>
      </motion.section>

      <section className="metric-card span-7">
        <MetricItem icon={WalletCards} tone="cyan" label="Bu Ay Ciro" value={formatMoney(dashboard.monthRevenue, true)} />
        <div className="metric-divider" aria-hidden />
        <MetricItem
          icon={TrendingUp}
          tone={dashboard.monthProfit >= 0 ? "green" : "red"}
          label="Net Sonuç"
          value={formatMoney(dashboard.monthProfit, true)}
          negative={dashboard.monthProfit < 0}
        />
        <div className="metric-divider" aria-hidden />
        <MetricItem icon={Boxes} tone="violet" label="Stok Değeri" value={formatMoney(dashboard.stockValue, true)} />
      </section>

      <section className="panel chart-panel span-8">
        <header className="panel-header">
          <div><h2>Satış Akışı</h2><span>Son 12 gün</span></div>
          <div className="legend"><i aria-hidden /> Günlük ciro</div>
        </header>
        <Chart option={chartOption} height={214} />
      </section>

      <section className="panel span-4">
        <header className="panel-header">
          <div><h2>Tamir Sırası</h2><span>{dashboard.overdueRepairs ? `${dashboard.overdueRepairs} geciken` : "Gecikme yok"}</span></div>
          <span className="round-icon violet"><Clock3 size={16} /></span>
        </header>

        <div className="compact-list">
          {queue.length ? queue.map((repair) => {
            const status = repairStatus[repair.status];
            const overdue = isOverdue(repair.plannedDeliveryAt, repair.status);
            return (
              <button className="compact-row" key={repair.id} onClick={() => onNavigate("repairs")}>
                <span className={`device-dot ${status.tone}`}><Wrench size={15} /></span>
                <div className="grow">
                  <b>{repair.brand} {repair.model}</b>
                  <small>{repair.ticketNo} · {repair.customerName || "Müşteri"}</small>
                </div>
                <div className="row-end">
                  <em className={`status ${status.tone}`}>{status.label}</em>
                  <small className={overdue ? "danger-text" : ""}>
                    {repair.plannedDeliveryAt ? formatDate(repair.plannedDeliveryAt) : "Plansız"}
                  </small>
                </div>
              </button>
            );
          }) : <EmptyState icon={Wrench} title="Serviste cihaz yok" />}
        </div>
      </section>

      <section className="panel span-4">
        <header className="panel-header">
          <div><h2>Stok Uyarısı</h2><span>{dashboard.lowStockCount} ürün kritik</span></div>
          <span className="round-icon amber"><AlertTriangle size={16} /></span>
        </header>

        <div className="compact-list">
          {lowStock.length ? lowStock.map((product) => (
            <button className="compact-row" key={product.id} onClick={() => onNavigate("inventory")}>
              <span className="device-dot amber"><Boxes size={15} /></span>
              <div className="grow">
                <b>{product.name}</b>
                <small>{product.category} · minimum {product.minimumStock}</small>
              </div>
              <strong className={`stock-pill ${product.stock === 0 ? "empty" : "low"}`}>{product.stock}</strong>
            </button>
          )) : (
            <div className="all-good">
              <PackageCheck size={22} />
              <span>Tüm stoklar yeterli</span>
            </div>
          )}
        </div>
      </section>

      <section className="panel span-4">
        <header className="panel-header">
          <div><h2>Hızlı Erişim</h2><span>Sık kullanılan</span></div>
          <span className="round-icon"><ShoppingBag size={16} /></span>
        </header>

        <div className="quick-links">
          <button onClick={() => onNavigate("counter")}><span className="quick-icon cyan"><ShoppingBag size={17} /></span><b>Tezgah</b><small>Tek dokunuş satış</small></button>
          <button onClick={() => onNavigate("inventory")}><span className="quick-icon violet"><Boxes size={17} /></span><b>Stok</b><small>Ürün yönetimi</small></button>
          <button onClick={() => onNavigate("repairs")}><span className="quick-icon amber"><Wrench size={17} /></span><b>Tamir</b><small>{dashboard.activeRepairs} aktif</small></button>
          <button onClick={() => onNavigate("cash")}><span className="quick-icon green"><Receipt size={17} /></span><b>Kasa</b><small>Gider ve satış</small></button>
        </div>
      </section>

      <section className="panel span-4">
        <header className="panel-header">
          <div><h2>Son İşlemler</h2><span>Canlı</span></div>
          <span className="live-dot" aria-hidden />
        </header>

        <div className="activity-list">
          {dashboard.recentActivity.length ? dashboard.recentActivity.slice(0, 5).map((item) => (
            <div key={item.id}>
              <span className={`activity-icon ${item.action}`}><ActivityGlyph action={item.action} /></span>
              <div>
                <b>{item.summary}</b>
                <small>{relativeTime(item.createdAt)}</small>
              </div>
            </div>
          )) : <EmptyState icon={PackageCheck} title="Henüz işlem yok" />}
        </div>
      </section>
    </div>
  );
}

function MetricItem({ icon: Icon, tone, label, value, negative }: {
  icon: typeof WalletCards; tone: string; label: string; value: string; negative?: boolean;
}) {
  return (
    <div className="metric-item">
      <span className={`metric-icon ${tone}`}><Icon size={19} /></span>
      <div>
        <small>{label}</small>
        <b className={negative ? "negative" : ""}>{value}</b>
      </div>
    </div>
  );
}

function ActivityGlyph({ action }: { action: string }) {
  if (action === "sale") return <ShoppingBag size={14} />;
  if (action === "stock_in") return <Boxes size={14} />;
  if (action === "voided") return <RotateCcw size={14} />;
  if (action === "created") return <PackageCheck size={14} />;
  return <Wrench size={14} />;
}
