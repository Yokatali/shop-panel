import { CheckCircle2, Info, TriangleAlert, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useShop } from "../data/store";

export function Toast() {
  const { toast, dismissToast } = useShop();
  const Icon = toast?.tone === "error" ? TriangleAlert : toast?.tone === "info" ? Info : CheckCircle2;

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          className={`toast ${toast.tone}`}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 460, damping: 34 }}
        >
          <span className="toast-icon"><Icon size={17} /></span>
          <p>{toast.message}</p>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => { const { run } = toast.action!; dismissToast(); void run(); }}
            >
              <Undo2 size={14} />{toast.action.label}
            </button>
          )}
          <button className="toast-close" onClick={dismissToast} aria-label="Kapat"><X size={15} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
