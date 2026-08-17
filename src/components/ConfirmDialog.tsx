import { AlertTriangle, Check, Trash2, type LucideIcon } from "lucide-react";
import { Modal } from "./Modal";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "primary";
  icon?: LucideIcon;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
};

export function ConfirmDialog({
  open, title, detail, confirmLabel = "Onayla", cancelLabel = "Vazgeç",
  tone = "primary", icon, onConfirm, onCancel, busy,
}: ConfirmDialogProps) {
  const Icon = icon ?? (tone === "danger" ? Trash2 : tone === "warning" ? AlertTriangle : Check);
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => undefined : onCancel}
      compact
      footer={<>
        <button className="button secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
        <button
          className={`button ${tone === "danger" ? "danger" : "primary"}`}
          onClick={onConfirm}
          disabled={busy}
          autoFocus
        >
          {busy ? <span className="spinner" aria-hidden /> : <Icon size={17} />}{confirmLabel}
        </button>
      </>}
    >
      <div className={`confirm-visual ${tone}`}><Icon size={26} /></div>
      {detail && <p className="confirm-detail">{detail}</p>}
    </Modal>
  );
}
