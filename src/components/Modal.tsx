import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  compact?: boolean;
  footer?: ReactNode;
};

/**
 * Üst üste açılan pencerelerde (form + onay) kilidin erken açılmaması için
 * sayaçlı kilit kullanılır; son pencere kapanınca sayfa yeniden kaydırılabilir.
 */
let scrollLocks = 0;

function lockScroll(): () => void {
  if (scrollLocks === 0) document.body.style.overflow = "hidden";
  scrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.body.style.overflow = "";
  };
}

export function Modal({ open, title, eyebrow, children, onClose, wide, compact, footer }: ModalProps) {
  const titleId = useId();
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const releaseScroll = lockScroll();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      releaseScroll();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const focusable = card.current?.querySelector<HTMLElement>(
        "input:not([type=hidden]), textarea, select, button.primary",
      );
      focusable?.focus();
    }, 90);
    return () => window.clearTimeout(timer);
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          <button className="modal-backdrop" aria-label="Kapat" onClick={onClose} tabIndex={-1} />
          <motion.section
            ref={card}
            className={`modal-card ${wide ? "modal-wide" : ""} ${compact ? "modal-compact" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 460, damping: 36 }}
          >
            <header className="modal-header">
              <div>
                {eyebrow && <span className="eyebrow">{eyebrow}</span>}
                <h2 id={titleId}>{title}</h2>
              </div>
              <button className="icon-button" onClick={onClose} aria-label="Kapat"><X size={19} /></button>
            </header>
            <div className="modal-content">{children}</div>
            {footer && <footer className="modal-footer">{footer}</footer>}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
