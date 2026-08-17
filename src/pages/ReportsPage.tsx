import {
  Boxes, ChartNoAxesCombined, Medal, PackageSearch, ReceiptText, TrendingDown, TrendingUp, WalletCards, Wrench,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Chart } from "./Chart";
import { DateRangeField } from "../components/fields";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useReport, useShop } from "../data/store";
import { formatDate, formatMoney, formatNumber, isoDaysAgo, isoMonthStart, todayIso } from "../utils";
import { useChartTheme } from "./chartTheme";

type Preset = "7" | "30" | "month" | "custom";

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "7", label: "7 Gün" },
  { id: "30", label: "30 Gün" },
  { id: "month", label: "Bu Ay" },
  { id: "custom", label: "Özel" },
];

export function ReportsPage() {
  const { ready } = useShop();
  const [preset, setPreset] = useState<Preset>("30");
  const [start, setStart] = useState(isoDaysAgo(29));
  const [end, setEnd] = useState(todayIso());
  const { data, error } = useReport(start, end);
  const chart = useChartTheme();

  const applyPreset = (value: Preset) => {
    setPreset(value);
    if (value === "custom") return; // Aralık takvimden seçilir.
    if (value === "7") setStart(isoDaysAgo(6));
    if (value === "30") setStart(isoDaysAgo(29));
    if (value === "month") setStart(isoMonthStart());
    setEnd(todayIso());
  };

  const chartOption = useMemo(() => ({
    animationDuration: 620,
    color: [chart.cyan, chart.violet, chart.red],
    grid: { top: 34, right: 14, bottom: 30, left: 12, containLabel: true },
    legend: { right: 4, top: 0, icon: "circle", itemWidth: 9, itemGap: 14, textStyle: { color: chart.muted, fontSize: 12 } },
    tooltip: {
      trigger: "axis",
      backgroundColor: chart.tooltipBg,
      borderColor: chart.border,
      textStyle: { color: chart.text, fontSize: 12 },
      valueFormatter: (value: number) => formatMoney(value),
    },
    xAxis: {
      type: "category",
      data: data?.series.map((item) => formatDate(item.date)) ?? [],
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: chart.muted,
        fontSize: 12,
        interval: Math.max(0, Math.floor((data?.series.length ?? 1) / 9) - 1),
      },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: chart.muted,
        fontSize: 12,
        formatter: (value: number) => formatMoney(value, true),
      },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    series: [
      {
        name: "Ciro", type: "line", smooth: 0.35, showSymbol: false, lineStyle: { width: 2.6 },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: chart.cyanFade }, { offset: 1, color: "rgba(0,0,0,0)" }],
          },
        },
        data: data?.series.map((item) => item.revenue) ?? [],
      },
      {
        name: "Net", type: "line", smooth: 0.35, showSymbol: false, lineStyle: { width: 2.2 },
        data: data?.series.map((item) => item.profit) ?? [],
      },
      {
        name: "Gider", type: "bar", barWidth: 6, itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: data?.series.map((item) => item.expenses) ?? [],
      },
    ],
  }), [data, chart]);

  return (
    <div className="reports-page">
      <section className="report-toolbar panel">
        <div className="report-presets">
          {PRESETS.map((item) => (
            <button key={item.id} className={preset === item.id ? "active" : ""} onClick={() => applyPreset(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <DateRangeField
          start={start}
          end={end}
          onChange={(nextStart, nextEnd) => { setPreset("custom"); setStart(nextStart); setEnd(nextEnd); }}
        />
      </section>

      {error && <section className="panel error-panel">{error}</section>}

      {!ready || (!data && !error) ? <section className="panel"><Skeleton rows={7} /></section> : data ? (
        <>
          <section className="summary-row">
            <Metric icon={WalletCards} label="Ciro" value={formatMoney(data.revenue, true)} tone="cyan" note={`${formatNumber(data.saleCount)} satış işlemi`} />
            <Metric icon={ChartNoAxesCombined} label="Brüt Kâr" value={formatMoney(data.grossProfit, true)} tone="violet" note="Ciro − ürün maliyeti" trend={data.grossProfit >= 0 ? "up" : "down"} />
            <Metric icon={ReceiptText} label="Gider" value={formatMoney(data.expenses, true)} tone="red" note="Dönem içi giderler" />
            <Metric icon={Boxes} label="Stok Değeri" value={formatMoney(data.stockValue, true)} tone="amber" note="Şu anki depo değeri" />
          </section>

          <div className="report-grid">
            <section className="panel report-chart-panel">
              <header className="panel-header">
                <div><h2>Finansal Akış</h2><span>{formatDate(start)} — {formatDate(end)}</span></div>
                <strong className={data.netProfit >= 0 ? "positive" : "negative"}>
                  {formatMoney(data.netProfit, true)}<small>Net sonuç</small>
                </strong>
              </header>
              <Chart option={chartOption} height={300} />
            </section>

            <section className="panel">
              <header className="panel-header">
                <div><h2>Çok Satanlar</h2><span>İlk 5 ürün</span></div>
                <span className="round-icon amber"><Medal size={16} /></span>
              </header>

              {data.topProducts.length ? (
                <div className="ranking-list">
                  {data.topProducts.map((product, index) => (
                    <motion.div
                      key={product.name}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.22 }}
                    >
                      <span className={`rank rank-${index + 1}`}>{index + 1}</span>
                      <div className="grow">
                        <b>{product.name}</b>
                        <small>{formatMoney(product.revenue, true)}</small>
                      </div>
                      <strong>{product.quantity}<small>adet</small></strong>
                    </motion.div>
                  ))}
                </div>
              ) : <EmptyState icon={PackageSearch} title="Bu aralıkta satış yok" detail="Farklı bir tarih aralığı seçin." />}
            </section>
          </div>

          <div className="report-grid">
            <section className="panel">
              <header className="panel-header">
                <div><h2>Kategori Dağılımı</h2><span>Ciroya katkı</span></div>
                <span className="round-icon violet"><Boxes size={16} /></span>
              </header>

              {data.categoryTotals.length ? (
                <div className="breakdown-list">
                  {data.categoryTotals.slice(0, 8).map((item, index) => {
                    const total = data.categoryTotals.reduce((sum, entry) => sum + Math.max(entry.revenue, 0), 0);
                    const share = Math.round((Math.max(item.revenue, 0) / Math.max(total, 1)) * 100);
                    return (
                      <div className="breakdown-row" key={item.name}>
                        <div className="breakdown-top">
                          <span>{item.name}</span>
                          <b>{formatMoney(item.revenue)}</b>
                        </div>
                        <div className="breakdown-track">
                          <motion.i
                            className={`tone-${["cyan", "violet", "amber", "green", "rose"][index % 5]}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${share}%` }}
                            transition={{ duration: 0.5, delay: index * 0.04 }}
                          />
                        </div>
                        <small>{item.quantity} adet</small>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState icon={PackageSearch} title="Veri yok" detail="Bu aralıkta ürün satışı bulunmuyor." />}
            </section>

            <section className="panel">
              <header className="panel-header">
                <div><h2>Gelir Kaynakları</h2><span>Dönem özeti</span></div>
                <span className="round-icon green"><Wrench size={16} /></span>
              </header>
              <div className="source-list">
                <SourceRow label="Ürün satışı" value={data.revenue - data.repairIncome} total={data.revenue} tone="cyan" />
                <SourceRow label="Tamir geliri" value={data.repairIncome} total={data.revenue} tone="violet" />
                <SourceRow label="Ürün maliyeti" value={-data.costOfGoods} total={data.revenue} tone="amber" />
                <SourceRow label="Giderler" value={-data.expenses} total={data.revenue} tone="rose" />
                <div className="source-total">
                  <span>Net sonuç</span>
                  <strong className={data.netProfit >= 0 ? "positive" : "negative"}>{formatMoney(data.netProfit)}</strong>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone, note, trend }: {
  icon: typeof WalletCards; label: string; value: string; tone: string; note: string; trend?: "up" | "down";
}) {
  return (
    <motion.div className="summary-card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
      <span className={`summary-icon ${tone}`}><Icon size={19} /></span>
      <div><small>{label}</small><b>{value}</b><em>{note}</em></div>
      {trend && (
        <span className={`trend-badge ${trend}`}>
          {trend === "up" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        </span>
      )}
    </motion.div>
  );
}

function SourceRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const share = Math.min(100, Math.round((Math.abs(value) / Math.max(Math.abs(total), 1)) * 100));
  return (
    <div className="source-row">
      <div className="breakdown-top">
        <span>{label}</span>
        <b className={value < 0 ? "negative" : ""}>{formatMoney(value)}</b>
      </div>
      <div className="breakdown-track">
        <motion.i className={`tone-${tone}`} initial={{ width: 0 }} animate={{ width: `${share}%` }} transition={{ duration: 0.45 }} />
      </div>
    </div>
  );
}
