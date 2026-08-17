import { CalendarClock, CheckCircle2, Clock3, Phone, SearchX, Smartphone, TriangleAlert, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useShop } from "../data/store";
import type { Repair } from "../types";
import { formatDate, formatMoney, formatPhone, isActiveRepair, isOverdue, matches, repairStatus } from "../utils";

type Filter = "active" | "ready" | "overdue" | "done";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "active", label: "Aktif" },
  { id: "ready", label: "Hazır" },
  { id: "overdue", label: "Geciken" },
  { id: "done", label: "Geçmiş" },
];

export function RepairsPage({ search, onEdit, onNew }: {
  search: string;
  onEdit: (repair: Repair) => void;
  onNew: () => void;
}) {
  const { repairs, ready } = useShop();
  const [filter, setFilter] = useState<Filter>("active");

  const counts = useMemo(() => ({
    active: repairs.filter((item) => isActiveRepair(item.status)).length,
    ready: repairs.filter((item) => item.status === "ready").length,
    overdue: repairs.filter((item) => isOverdue(item.plannedDeliveryAt, item.status)).length,
    done: repairs.filter((item) => !isActiveRepair(item.status)).length,
  }), [repairs]);

  const filtered = useMemo(() => repairs.filter((repair) => {
    if (search.trim() && !matches(
      `${repair.ticketNo} ${repair.customerName} ${repair.customerPhone} ${repair.brand} ${repair.model} ${repair.imei} ${repair.problem}`,
      search,
    )) return false;
    if (filter === "ready") return repair.status === "ready";
    if (filter === "overdue") return isOverdue(repair.plannedDeliveryAt, repair.status);
    if (filter === "done") return !isActiveRepair(repair.status);
    return isActiveRepair(repair.status);
  }), [repairs, filter, search]);

  return (
    <div className="repairs-page">
      <section className="summary-row">
        <Summary icon={Wrench} label="Aktif" value={counts.active} tone="blue" note="Serviste bekliyor" />
        <Summary icon={CheckCircle2} label="Hazır" value={counts.ready} tone="green" note="Teslim bekliyor" />
        <Summary icon={TriangleAlert} label="Geciken" value={counts.overdue} tone="amber" note="Söz verilen gün geçti" />
        <Summary icon={CalendarClock} label="Tamamlanan" value={counts.done} tone="violet" note="Teslim veya iptal" />
      </section>

      <section className="panel repairs-panel">
        <div className="repair-tabs">
          {FILTERS.map((item) => (
            <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
              {item.label}<span>{counts[item.id]}</span>
            </button>
          ))}
        </div>

        {!ready ? <Skeleton rows={5} /> : filtered.length ? (
          <div className="repair-card-grid">
            <AnimatePresence mode="popLayout">
              {filtered.map((repair, index) => {
                const status = repairStatus[repair.status];
                const overdue = isOverdue(repair.plannedDeliveryAt, repair.status);
                return (
                  <motion.button
                    className="repair-card"
                    key={repair.id}
                    layout
                    onClick={() => onEdit(repair)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.24) }}
                    whileHover={{ y: -3 }}
                  >
                    <i className={`card-accent ${status.tone}`} aria-hidden />
                    <header>
                      <span className={`repair-device ${status.tone}`}><Smartphone size={19} /></span>
                      <div className="grow">
                        <b>{repair.brand} {repair.model}</b>
                        <small>{repair.ticketNo}</small>
                      </div>
                      <em className={`status ${status.tone}`}>{status.label}</em>
                    </header>

                    <p>{repair.problem}</p>

                    <div className="repair-customer">
                      <span>{repair.customerName || "Müşteri belirtilmedi"}</span>
                      {repair.customerPhone && <small><Phone size={12} />{formatPhone(repair.customerPhone)}</small>}
                    </div>

                    <footer>
                      <span className={overdue ? "overdue" : ""}>
                        <Clock3 size={14} />
                        {repair.plannedDeliveryAt ? formatDate(repair.plannedDeliveryAt) : "Plansız"}
                      </span>
                      <b>{formatMoney(repair.chargedAmount || repair.estimatedCost, true)}</b>
                    </footer>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <EmptyState
            icon={search ? SearchX : Wrench}
            title={search ? "Sonuç bulunamadı" : filter === "active" ? "Serviste cihaz yok" : "Bu listede kayıt yok"}
            detail={search ? "Farklı bir kelime deneyin." : "Yeni butonuyla tamir kaydı açabilirsiniz."}
            action={!search && filter === "active"
              ? <button className="button primary" onClick={onNew}><Wrench size={16} />Tamir kaydı aç</button>
              : undefined}
          />
        )}
      </section>
    </div>
  );
}

function Summary({ icon: Icon, label, value, tone, note }: {
  icon: typeof Wrench; label: string; value: number; tone: string; note: string;
}) {
  return (
    <motion.div className="summary-card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
      <span className={`summary-icon ${tone}`}><Icon size={19} /></span>
      <div><small>{label}</small><b>{value}</b><em>{note}</em></div>
    </motion.div>
  );
}
