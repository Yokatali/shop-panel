import {
  Banknote, CalendarDays, CircleDollarSign, CreditCard, Landmark, Plus, Receipt, ReceiptText,
  ShoppingBag, Undo2, Wallet, Wrench,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useShop } from "../data/store";
import type { Expense, Sale } from "../types";
import { formatDate, formatMoney, paymentLabel, todayIso } from "../utils";

const TONES = ["cyan", "violet", "amber", "rose", "green"];

export function CashPage({ onNewExpense, onEditExpense }: {
  onNewExpense: () => void;
  onEditExpense: (expense: Expense) => void;
}) {
  const { expenses, sales, repairs, dashboard, ready, voidSale, notify } = useShop();
  const [undoTarget, setUndoTarget] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);

  const monthPrefix = todayIso().slice(0, 7);
  const monthExpenses = useMemo(
    () => expenses.filter((item) => item.expenseDate.startsWith(monthPrefix)),
    [expenses, monthPrefix],
  );
  const expenseTotal = monthExpenses.reduce((sum, item) => sum + item.amount, 0);

  const categories = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of monthExpenses) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  const monthSales = useMemo(
    () => sales.filter((sale) => sale.saleDate.slice(0, 7) === monthPrefix),
    [sales, monthPrefix],
  );

  const repairIncome = useMemo(
    () => repairs
      .filter((repair) => repair.status === "delivered")
      .reduce((sum, repair) => sum + repair.chargedAmount, 0),
    [repairs],
  );

  const undo = async () => {
    if (!undoTarget) return;
    setBusy(true);
    try {
      await voidSale(undoTarget.id);
      setUndoTarget(null);
      notify("İşlem geri alındı, stok ve ciro güncellendi");
    } catch (error) {
      notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cash-page">
      <section className="cash-overview">
        <motion.div className="cash-main-card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
          <span className="cash-label"><Wallet size={15} />Bu ay net sonuç</span>
          <strong>{dashboard ? formatMoney(dashboard.monthProfit, true) : "—"}</strong>
          <small>Ciro − maliyet − gider</small>
          <div className="cash-lines" aria-hidden><i /><i /><i /></div>
        </motion.div>

        <CashStat icon={CircleDollarSign} tone="cyan" label="Ciro" value={dashboard ? formatMoney(dashboard.monthRevenue, true) : "—"} note="Satış + tamir" />
        <CashStat icon={ReceiptText} tone="red" label="Gider" value={formatMoney(expenseTotal, true)} note={`${monthExpenses.length} kayıt`} />
        <CashStat icon={Wrench} tone="violet" label="Tamir Geliri" value={formatMoney(repairIncome, true)} note="Teslim edilenler" />
      </section>

      <div className="cash-grid">
        <section className="panel expense-list-panel">
          <header className="panel-header">
            <div><h2>Giderler</h2><span>Bu ay · {formatMoney(expenseTotal)}</span></div>
            <button className="button compact primary" onClick={onNewExpense}><Plus size={15} />Gider</button>
          </header>

          {!ready ? <Skeleton rows={5} /> : monthExpenses.length ? (
            <div className="expense-list">
              <AnimatePresence mode="popLayout">
                {monthExpenses.map((expense) => (
                  <motion.button
                    key={expense.id}
                    layout
                    className="expense-row"
                    onClick={() => onEditExpense(expense)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <span className="expense-icon"><ExpenseIcon method={expense.paymentMethod} /></span>
                    <div className="grow">
                      <b>{expense.description}</b>
                      <small>{expense.category} · {formatDate(expense.expenseDate)} · {paymentLabel(expense.paymentMethod)}</small>
                    </div>
                    <strong>−{formatMoney(expense.amount)}</strong>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="Bu ay gider yok"
              detail="Kira, elektrik, sarf malzemesi gibi giderleri ekleyin."
              action={<button className="button primary" onClick={onNewExpense}><Plus size={16} />Gider ekle</button>}
            />
          )}
        </section>

        <section className="panel">
          <header className="panel-header">
            <div><h2>Gider Dağılımı</h2><span>Kategoriye göre</span></div>
            <span className="round-icon amber"><Banknote size={16} /></span>
          </header>

          {categories.length ? (
            <div className="breakdown-list">
              {categories.slice(0, 6).map(([name, total], index) => {
                const share = Math.round((total / Math.max(expenseTotal, 1)) * 100);
                return (
                  <div className="breakdown-row" key={name}>
                    <div className="breakdown-top">
                      <span>{name}</span>
                      <b>{formatMoney(total)}</b>
                    </div>
                    <div className="breakdown-track">
                      <motion.i
                        className={`tone-${TONES[index % TONES.length]}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${share}%` }}
                        transition={{ duration: 0.5, delay: index * 0.05 }}
                      />
                    </div>
                    <small>%{share}</small>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState icon={Landmark} title="Veri yok" detail="Gider eklenince dağılım burada görünür." />}
        </section>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div><h2>Satış Hareketleri</h2><span>Bu ay · {monthSales.length} işlem</span></div>
          <span className="round-icon"><Receipt size={16} /></span>
        </header>

        {!ready ? <Skeleton rows={4} /> : monthSales.length ? (
          <div className="sale-history">
            {monthSales.slice(0, 25).map((sale) => (
              <div className={`sale-history-row ${sale.status === "voided" ? "voided" : ""}`} key={sale.id}>
                <span className={`history-icon ${sale.total < 0 ? "return" : ""}`}><ShoppingBag size={14} /></span>
                <div className="grow">
                  <b>{sale.summary || "İşlem"}</b>
                  <small>
                    {formatDate(sale.saleDate, true)} · {paymentLabel(sale.paymentMethod)}
                    {sale.status === "voided" ? " · geri alındı" : ""}
                  </small>
                </div>
                <strong className={sale.total < 0 ? "negative" : ""}>{formatMoney(sale.total)}</strong>
                {sale.status === "completed" ? (
                  <button className="text-button" onClick={() => setUndoTarget(sale)}>
                    <Undo2 size={13} />Geri al
                  </button>
                ) : <span className="voided-tag">Geri alındı</span>}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarDays} title="Bu ay satış yok" detail="Tezgah sayfasından tek dokunuşla satış yapabilirsiniz." />
        )}
      </section>

      <ConfirmDialog
        open={Boolean(undoTarget)}
        title="Satış geri alınsın mı?"
        detail={undoTarget ? `${undoTarget.summary} · ${formatMoney(undoTarget.total)} ciradan düşülecek, stok iade edilecek.` : ""}
        tone="warning"
        confirmLabel="Geri Al"
        icon={Undo2}
        onConfirm={undo}
        onCancel={() => setUndoTarget(null)}
        busy={busy}
      />
    </div>
  );
}

function CashStat({ icon: Icon, tone, label, value, note }: {
  icon: typeof Wallet; tone: string; label: string; value: string; note: string;
}) {
  return (
    <motion.div className="summary-card cash-stat" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
      <span className={`summary-icon ${tone}`}><Icon size={19} /></span>
      <div><small>{label}</small><b>{value}</b><em>{note}</em></div>
    </motion.div>
  );
}

function ExpenseIcon({ method }: { method: string }) {
  if (method === "card") return <CreditCard size={16} />;
  if (method === "transfer") return <Landmark size={16} />;
  return <Banknote size={16} />;
}
