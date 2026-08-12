import { useEffect, useMemo, useState } from 'react';
import { api, type MonthlyReports, type PnlReport, type ReconcileResult } from '../api';
import { fmtCompact, monthLabel } from '../format';
import { BalanceCard, CashFlowCard, PnlCard } from '../components/ReportCards';

/**
 * Direktor paneli: oy tanlanadi — uchala hisobot ko'rsatiladi.
 */
export default function DashboardPage() {
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>('');
  const [data, setData] = useState<MonthlyReports | null>(null);
  const [pnlAll, setPnlAll] = useState<PnlReport[]>([]);
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .months()
      .then(({ months }) => {
        setMonths(months);
        if (months.length > 0) setMonth(months[months.length - 1]!);
      })
      .catch((e) => setError(String(e)));
    api.pnlAll().then(({ reports }) => setPnlAll(reports)).catch(() => {});
    api.reconcile().then(setReconcile).catch(() => {});
  }, []);

  useEffect(() => {
    if (!month) return;
    let alive = true;
    setLoading(true);
    api
      .monthly(month)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [month]);

  const idx = months.indexOf(month);
  const prevPnl = useMemo(
    () => pnlAll.find((r) => r.month === months[idx - 1]),
    [pnlAll, months, idx],
  );

  if (error) {
    return (
      <div className="state error">
        Hisobotlarni olib bo'lmadi. Backend ishlayaptimi? (npm run dev)
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <div className="state">
        Bazada ma'lumot yo'q — avval <code>npm run seed</code> ishga tushiring.
      </div>
    );
  }

  const pnl = data?.pnl ?? null;
  const cf = data?.cashflow ?? null;
  const bs = data?.balance ?? null;
  const profitDelta = pnl && prevPnl ? pnl.netProfit - prevPnl.netProfit : null;

  return (
    <>
      <div className="pagebar">
        <ReconcileBadge r={reconcile} />
        <div className="month-nav" role="group" aria-label="Oy tanlash">
          <button
            onClick={() => setMonth(months[idx - 1]!)}
            disabled={idx <= 0}
            aria-label="Oldingi oy"
          >
            ‹
          </button>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setMonth(months[idx + 1]!)}
            disabled={idx >= months.length - 1}
            aria-label="Keyingi oy"
          >
            ›
          </button>
        </div>
      </div>

      <div className="kpis">
        <Tile
          hero
          label="Sof foyda (shu oy)"
          value={pnl ? fmtCompact(pnl.netProfit) : '—'}
          delta={
            profitDelta !== null
              ? { amount: profitDelta, vs: `o'tgan oyga nisbatan` }
              : undefined
          }
        />
        <Tile label="Pul o'zgarishi (shu oy)" value={cf ? fmtCompact(cf.netChange) : '—'} />
        <Tile label="Oy oxiridagi pul" value={cf ? fmtCompact(cf.closing) : '—'} />
        <Tile label="Jami aktivlar" value={bs ? fmtCompact(bs.totalAssets) : '—'} />
      </div>

      <div className="reports">
        <PnlCard report={pnl} loading={loading} />
        <CashFlowCard report={cf} loading={loading} />
        <BalanceCard report={bs} loading={loading} month={month} />
      </div>
    </>
  );
}

function Tile(props: {
  label: string;
  value: string;
  hero?: boolean;
  delta?: { amount: number; vs: string };
}) {
  const { label, value, hero, delta } = props;
  return (
    <div className={hero ? 'tile hero' : 'tile'}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta && (
        <div className={`delta ${delta.amount >= 0 ? 'up' : 'down'}`}>
          {delta.amount >= 0 ? '▲' : '▼'} {fmtCompact(delta.amount)}{' '}
          <span className="vs">{delta.vs}</span>
        </div>
      )}
    </div>
  );
}

function ReconcileBadge({ r }: { r: ReconcileResult | null }) {
  if (!r) return <span className="badge wait">⏳ Tengliklar tekshirilmoqda…</span>;
  return r.ok ? (
    <span className="badge good" title={`${r.months} oy, uchala tenglik farqsiz`}>
      ✓ Uchala tenglik mos ({r.months} oy)
    </span>
  ) : (
    <span className="badge bad">✕ Tengliklarda farq bor!</span>
  );
}
