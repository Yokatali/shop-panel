import { ArrowLeft, ArrowRight, Check, MousePointer2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { PageId } from "../types";

type TourStep = {
  selector: string;
  title: string;
  hint: string;
  page?: PageId;
};

const STEPS: TourStep[] = [
  { selector: "[data-tour='navigation']", title: "Her bölümün tek işi var", hint: "Tezgah satar, Stok depoyu tutar, Tamir servisi izler, Kasa parayı, Raporlar kârı gösterir." },
  { selector: "[data-tour='counter']", title: "Tezgah · satış", hint: "Müşteri kulaklık aldıysa ürünün 'Sat' tuşuna basmanız yeterli. Stok, kasa ve raporlar aynı anda güncellenir.", page: "counter" },
  { selector: "[data-tour='inventory']", title: "Stok · depo", hint: "Ürün ekleme, stok girişi, müşteri iadesi ve kategoriler burada. Bu sayfadan satış yapılmaz.", page: "inventory" },
  { selector: "[data-tour='new-record']", title: "Yeni kayıt", hint: "Bulunduğunuz bölüme göre ürün, tamir veya gider ekler. Kısayol: Ctrl + N" },
  { selector: "[data-tour='search']", title: "Tek arama", hint: "Ad, marka, kategori, barkod veya IMEI ile arayın. Kısayol: F2" },
  { selector: "[data-tour='settings']", title: "Ayarlar", hint: "Tema, yazı boyutu, dükkan bilgisi ve yedekleme buradan yönetilir." },
  { selector: "[data-tour='reports']", title: "Raporlar", hint: "Hazır aralıkları seçin ya da 'Özel' ile takvimden istediğiniz iki günü işaretleyin.", page: "reports" },
];

export function GuidedTour({ open, onClose, onNavigate }: {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[index];

  useEffect(() => { if (open) setIndex(0); }, [open]);

  useEffect(() => {
    if (!open) return;
    if (step.page) onNavigate(step.page);
  }, [open, step, onNavigate]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const node = document.querySelector(step.selector);
      if (!node) { setRect(null); return; }
      setRect(node.getBoundingClientRect());
    };
    const timer = window.setTimeout(update, 140);
    const interval = window.setInterval(update, 500);
    window.addEventListener("resize", update);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("resize", update);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((value) => Math.min(STEPS.length - 1, value + 1));
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const cardStyle = useMemo(() => {
    const width = 300;
    if (!rect) return { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width };
    const left = Math.min(Math.max(20, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 20);
    const placeBelow = rect.bottom + 200 < window.innerHeight;
    return { left, top: placeBelow ? rect.bottom + 18 : Math.max(20, rect.top - 190), width };
  }, [rect]);

  const finish = () => {
    localStorage.setItem("dukkan-tour-seen", "1");
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="tour-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="tour-shade" onClick={finish} />

          {rect && (
            <motion.div
              className="tour-focus"
              animate={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
            >
              <motion.span
                animate={{ x: [0, 6, 0], y: [0, 5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <MousePointer2 size={24} fill="currentColor" />
              </motion.span>
            </motion.div>
          )}

          <motion.div className="tour-card" style={cardStyle} layout>
            <div className="tour-topline">
              <span>{index + 1} / {STEPS.length}</span>
              <button onClick={finish} aria-label="Turu kapat"><X size={16} /></button>
            </div>
            <h3>{step.title}</h3>
            <p>{step.hint}</p>
            <div className="tour-controls">
              <button
                className="icon-button"
                disabled={index === 0}
                onClick={() => setIndex((value) => value - 1)}
                aria-label="Önceki"
              >
                <ArrowLeft size={17} />
              </button>
              <div className="tour-dots" aria-hidden>
                {STEPS.map((item, dot) => <i key={item.selector} className={dot === index ? "active" : ""} />)}
              </div>
              <button
                className="icon-button primary-icon"
                onClick={() => (index === STEPS.length - 1 ? finish() : setIndex((value) => value + 1))}
                aria-label={index === STEPS.length - 1 ? "Bitir" : "Sonraki"}
              >
                {index === STEPS.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
