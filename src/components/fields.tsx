import { CalendarDays, Check, ChevronLeft, ChevronRight, Minus, Phone, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  addMonths,
  formatLongDate,
  formatPhone,
  fromIso,
  isValidPhone,
  monthGrid,
  moneyToInput,
  normalizePhone,
  numberToInput,
  parseInteger,
  parseMoney,
  sanitizeIntegerText,
  sanitizeMoneyText,
  toIso,
  todayIso,
} from "../utils";

/* ------------------------------------------------------------------ ortak -- */

type FieldShellProps = {
  label: string;
  hint?: string;
  error?: string;
  span?: boolean;
  children: ReactNode;
  htmlFor?: string;
};

export function FieldShell({ label, hint, error, span, children, htmlFor }: FieldShellProps) {
  return (
    <div className={`field ${span ? "span-2" : ""} ${error ? "has-error" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <em className="field-error">{error}</em> : hint ? <em className="field-hint">{hint}</em> : null}
    </div>
  );
}

/**
 * Modal içindeki taşmaların kırpmaması için açılır katman body'ye taşınır.
 * Yalnızca açıkken monte edilir; kapanınca dinleyiciler tamamen kaldırılır.
 */
function Popover({
  anchor,
  onClose,
  children,
  width = 300,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const height = layer.current?.offsetHeight ?? 340;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow > height + 16 || rect.top < height + 16
        ? Math.min(rect.bottom + 8, window.innerHeight - height - 12)
        : rect.top - height - 8;
      setPosition({
        left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12),
        top: Math.max(12, top),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, width]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (layer.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <motion.div
      ref={layer}
      className="popover-layer"
      style={{ left: position.left, top: position.top, width }}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.14 }}
    >
      {children}
    </motion.div>,
    document.body,
  );
}

/* ------------------------------------------------------------------- para -- */

type MoneyFieldProps = {
  label: string;
  value: number;
  onChange: (kurus: number) => void;
  hint?: string;
  error?: string;
  span?: boolean;
  autoFocus?: boolean;
  large?: boolean;
};

/**
 * Tutar alanı. Sıfır boş gösterilir ve odaklanınca içerik seçilir; böylece
 * yazmaya başlayınca ekranda takılı kalan "0" rakamı oluşmaz.
 */
export function MoneyField({ label, value, onChange, hint, error, span, autoFocus, large }: MoneyFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => moneyToInput(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(moneyToInput(value));
  }, [value, editing]);

  const handleChange = (raw: string) => {
    const clean = sanitizeMoneyText(raw);
    setText(clean);
    onChange(parseMoney(clean));
  };

  return (
    <FieldShell label={label} hint={hint} error={error} span={span} htmlFor={id}>
      <div className={`money-input ${large ? "money-large" : ""}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0"
          value={text}
          onFocus={(event) => { setEditing(true); event.target.select(); }}
          onBlur={() => { setEditing(false); setText(moneyToInput(value)); }}
          onChange={(event) => handleChange(event.target.value)}
        />
        <span aria-hidden>₺</span>
      </div>
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ adet -- */

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  hint?: string;
  error?: string;
  span?: boolean;
  icon?: ReactNode;
};

/** Tam sayı alanı; baştaki sıfırlar yazarken otomatik temizlenir. */
export function NumberField({ label, value, onChange, min = 0, max, hint, error, span, icon }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => numberToInput(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(numberToInput(value));
  }, [value, editing]);

  const handleChange = (raw: string) => {
    const clean = sanitizeIntegerText(raw);
    const parsed = parseInteger(clean);
    if (max !== undefined && parsed > max) {
      setText(String(max));
      onChange(max);
      return;
    }
    setText(clean);
    onChange(Math.max(min, parsed));
  };

  return (
    <FieldShell label={label} hint={hint} error={error} span={span} htmlFor={id}>
      <div className={`number-input ${icon ? "with-icon" : ""}`}>
        {icon}
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={text}
          onFocus={(event) => { setEditing(true); event.target.select(); }}
          onBlur={() => { setEditing(false); setText(numberToInput(value)); }}
          onChange={(event) => handleChange(event.target.value)}
        />
      </div>
    </FieldShell>
  );
}

/* --------------------------------------------------------------- telefon -- */

/** Türkiye numarası: isteğe bağlı, girilirse tam 10 hane olmak zorunda. */
export function PhoneField({
  label = "Telefon",
  value,
  onChange,
  span,
  showError = true,
}: {
  label?: string;
  value: string;
  onChange: (digits: string) => void;
  span?: boolean;
  showError?: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const digits = normalizePhone(value);
  const invalid = showError && touched && digits.length > 0 && !isValidPhone(digits);

  return (
    <FieldShell
      label={label}
      span={span}
      htmlFor={id}
      error={invalid ? "10 haneli geçerli bir numara girin" : undefined}
      hint={!invalid ? "İsteğe bağlı · 0(5XX) XXX XX XX" : undefined}
    >
      <div className="input-with-icon">
        <Phone size={16} aria-hidden />
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="0(5__) ___ __ __"
          value={formatPhone(digits)}
          onBlur={() => setTouched(true)}
          onChange={(event) => onChange(normalizePhone(event.target.value))}
        />
      </div>
    </FieldShell>
  );
}

/* ---------------------------------------------------------------- takvim -- */

function CalendarGrid({
  month,
  onMonthChange,
  selected,
  rangeStart,
  rangeEnd,
  onPick,
  min,
  max,
}: {
  month: Date;
  onMonthChange: (next: Date) => void;
  selected?: string;
  rangeStart?: string;
  rangeEnd?: string;
  onPick: (iso: string) => void;
  min?: string;
  max?: string;
}) {
  const today = todayIso();
  const cells = useMemo(() => monthGrid(month.getFullYear(), month.getMonth()), [month]);

  return (
    <div className="calendar">
      <header className="calendar-head">
        <button type="button" className="calendar-nav" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="Önceki ay">
          <ChevronLeft size={18} />
        </button>
        <div className="calendar-title">
          <b>{MONTH_NAMES[month.getMonth()]}</b>
          <span>{month.getFullYear()}</span>
        </div>
        <button type="button" className="calendar-nav" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Sonraki ay">
          <ChevronRight size={18} />
        </button>
      </header>

      <div className="calendar-weekdays">
        {WEEKDAY_NAMES.map((day) => <span key={day}>{day}</span>)}
      </div>

      <div className="calendar-days">
        {cells.map(({ date, inMonth }) => {
          const iso = toIso(date);
          const disabled = (min && iso < min) || (max && iso > max);
          const inRange = Boolean(rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd);
          const isEdge = iso === rangeStart || iso === rangeEnd || iso === selected;
          return (
            <button
              type="button"
              key={iso}
              disabled={Boolean(disabled)}
              onClick={() => onPick(iso)}
              className={[
                "calendar-day",
                inMonth ? "" : "outside",
                iso === today ? "today" : "",
                isEdge ? "selected" : "",
                inRange ? "in-range" : "",
              ].filter(Boolean).join(" ")}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Tek tarih seçici. Klavyeyle yazılmaz, tamamen fare ile kullanılır. */
export function DateField({
  label,
  value,
  onChange,
  span,
  clearable = true,
  placeholder = "Tarih seçin",
  hint,
  error,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  span?: boolean;
  clearable?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
  min?: string;
  max?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const iso = value ? value.slice(0, 10) : "";
  const [month, setMonth] = useState(() => fromIso(iso || todayIso()) ?? new Date());

  useEffect(() => {
    if (open) setMonth(fromIso(iso || todayIso()) ?? new Date());
  }, [open, iso]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <FieldShell label={label} span={span} hint={hint} error={error}>
      <div className="date-trigger-wrap">
        <button
          type="button"
          ref={setAnchor}
          className={`date-trigger ${open ? "open" : ""} ${iso ? "" : "empty"}`}
          onClick={() => setOpen((current) => !current)}
        >
          <CalendarDays size={16} aria-hidden />
          <span>{iso ? formatLongDate(iso) : placeholder}</span>
        </button>
        {clearable && iso && (
          <button type="button" className="date-clear" aria-label="Tarihi temizle" onClick={() => onChange("")}>
            <X size={14} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <Popover anchor={anchor} onClose={close}>
            <CalendarGrid
              month={month}
              onMonthChange={setMonth}
              selected={iso}
              onPick={(picked) => { onChange(picked); close(); }}
              min={min}
              max={max}
            />
            <div className="calendar-actions">
              <button type="button" className="text-button" onClick={() => { onChange(todayIso()); close(); }}>Bugün</button>
              {clearable && <button type="button" className="text-button muted" onClick={() => { onChange(""); close(); }}>Temizle</button>}
            </div>
          </Popover>
        )}
      </AnimatePresence>
    </FieldShell>
  );
}

/** Rapor sayfası için iki adımlı aralık seçici. */
export function DateRangeField({
  start,
  end,
  onChange,
  label = "Tarih aralığı",
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [month, setMonth] = useState(() => fromIso(start) ?? new Date());
  const [draftStart, setDraftStart] = useState("");

  useEffect(() => {
    if (open) { setMonth(fromIso(start) ?? new Date()); setDraftStart(""); }
  }, [open, start]);

  const pick = (iso: string) => {
    if (!draftStart) { setDraftStart(iso); return; }
    if (iso < draftStart) { onChange(iso, draftStart); } else { onChange(draftStart, iso); }
    setDraftStart("");
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        ref={setAnchor}
        className={`date-range-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
      >
        <CalendarDays size={16} aria-hidden />
        <span>{formatLongDate(start)}</span>
        <i aria-hidden>—</i>
        <span>{formatLongDate(end)}</span>
      </button>

      <AnimatePresence>
        {open && (
          <Popover anchor={anchor} onClose={() => setOpen(false)} width={318}>
            <div className="calendar-caption">
              {draftStart
                ? `Başlangıç ${formatLongDate(draftStart)} · şimdi bitiş gününü seçin`
                : "Başlangıç gününü seçin"}
            </div>
            <CalendarGrid
              month={month}
              onMonthChange={setMonth}
              rangeStart={draftStart || start}
              rangeEnd={draftStart ? "" : end}
              onPick={pick}
              max={todayIso()}
            />
            <div className="calendar-actions">
              {draftStart
                ? <button type="button" className="text-button muted" onClick={() => setDraftStart("")}>Sıfırla</button>
                : <span className="calendar-note">Geçmiş tarihleri seçebilirsiniz</span>}
              <button type="button" className="text-button" onClick={() => setOpen(false)}>Kapat</button>
            </div>
          </Popover>
        )}
      </AnimatePresence>
    </>
  );
}

/* --------------------------------------------------------------- sayaçlar -- */

export function Stepper({
  value,
  onChange,
  min = 1,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const clamp = (next: number) => Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, next));
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label="Azalt">
        <Minus size={17} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(clamp(parseInteger(event.target.value) || min))}
        aria-label="Adet"
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={max !== undefined && value >= max} aria-label="Artır">
        <Plus size={17} />
      </button>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  span,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  span?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <FieldShell label={label} span={span} hint={hint} htmlFor={id}>
      <div className="select-input">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronRight size={15} aria-hidden />
      </div>
    </FieldShell>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  span,
  hint,
  error,
  autoFocus,
  icon,
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  span?: boolean;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
  icon?: ReactNode;
  maxLength?: number;
  inputMode?: "text" | "numeric";
}) {
  const id = useId();
  return (
    <FieldShell label={label} span={span} hint={hint} error={error} htmlFor={id}>
      <div className={icon ? "input-with-icon" : ""}>
        {icon}
        <input
          id={id}
          type="text"
          autoComplete="off"
          autoFocus={autoFocus}
          inputMode={inputMode}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  span,
  placeholder,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  span?: boolean;
  placeholder?: string;
  icon?: ReactNode;
}) {
  const id = useId();
  return (
    <FieldShell label={label} span={span} htmlFor={id}>
      <div className={icon ? "input-with-icon textarea-icon" : ""}>
        {icon}
        <textarea
          id={id}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </FieldShell>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button type="button" className={`toggle-row ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <div>
        <b>{label}</b>
        {description && <small>{description}</small>}
      </div>
      <span className="toggle-track"><i>{checked && <Check size={12} strokeWidth={3.4} />}</i></span>
    </button>
  );
}
