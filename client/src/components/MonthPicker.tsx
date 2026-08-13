import { useEffect, useMemo, useRef, useState } from 'react';
import { MONTHS_SHORT, monthLabel } from '../format';
import { CalendarIcon, ChevronDownIcon } from './icons';

/**
 * Oy tanlagich — native <select> o'rniga to'liq mavzuga mos popover:
 * yil navigatsiyasi + 12 oylik grid. Ma'lumot bo'lmagan oylar o'chirilgan.
 * Tashqariga bosish yoki Escape yopadi.
 */
export function MonthPicker(props: {
  months: string[]; // mavjud oylar, o'sish tartibida: 'YYYY-MM'
  value: string;
  onChange: (m: string) => void;
}) {
  const { months, value, onChange } = props;
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => Number(value.slice(0, 4)));
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const available = useMemo(() => new Set(months), [months]);
  const years = useMemo(
    () => [...new Set(months.map((m) => Number(m.slice(0, 4))))].sort((a, b) => a - b),
    [months],
  );
  const minYear = years[0] ?? viewYear;
  const maxYear = years[years.length - 1] ?? viewYear;

  // Ochilganda joriy qiymat yiliga qaytamiz
  useEffect(() => {
    if (open) setViewYear(Number(value.slice(0, 4)));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="mp" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="mp-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarIcon />
        <span>{monthLabel(value)}</span>
        <span className={open ? 'mp-caret up' : 'mp-caret'}>
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <div className="mp-pop" role="dialog" aria-label="Oy tanlash">
          <div className="mp-head">
            <button
              type="button"
              className="mp-year-btn"
              onClick={() => setViewYear((y) => y - 1)}
              disabled={viewYear <= minYear}
              aria-label="Oldingi yil"
            >
              ‹
            </button>
            <strong className="mp-year">{viewYear}</strong>
            <button
              type="button"
              className="mp-year-btn"
              onClick={() => setViewYear((y) => y + 1)}
              disabled={viewYear >= maxYear}
              aria-label="Keyingi yil"
            >
              ›
            </button>
          </div>
          <div className="mp-grid">
            {MONTHS_SHORT.map((name, i) => {
              const key = `${viewYear}-${String(i + 1).padStart(2, '0')}`;
              const enabled = available.has(key);
              const selected = key === value;
              return (
                <button
                  key={key}
                  type="button"
                  className={selected ? 'mp-cell selected' : 'mp-cell'}
                  disabled={!enabled}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="mp-foot">
            {months.length > 0 && (
              <button
                type="button"
                className="mp-last"
                onClick={() => {
                  onChange(months[months.length - 1]!);
                  setOpen(false);
                }}
              >
                Oxirgi oyga o'tish
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
