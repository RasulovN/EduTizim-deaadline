import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/** Kichik, qayta ishlatiladigan UI bo'laklari */

export function Field(props: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />;
}

export function Button({
  variant = 'primary',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return <button className={`btn btn-${variant}`} {...rest} />;
}

export function Alert({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  const icon = kind === 'error' ? '✕' : kind === 'success' ? '✓' : 'ℹ';
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span aria-hidden>{icon}</span> {children}
    </div>
  );
}

export function Pager(props: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const { page, totalPages, total, onPage } = props;
  if (totalPages <= 1) {
    return <div className="pager">Jami: {total}</div>;
  }
  return (
    <div className="pager">
      <span>
        Jami: {total} · {page}/{totalPages}-sahifa
      </span>
      <span className="pager-controls">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Oldingi
        </Button>
        <Button variant="ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Keyingi ›
        </Button>
      </span>
    </div>
  );
}

export function StatusPill({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return <span className={`pill ${on ? 'pill-on' : 'pill-off'}`}>{on ? '✓ ' : '✕ '}{on ? onText : offText}</span>;
}
