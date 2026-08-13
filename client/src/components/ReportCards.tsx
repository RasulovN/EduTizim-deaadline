import type { BalanceSheet, CashFlowReport, CfCategory, PnlReport, ProfitCashBridge } from '../api';
import { fmtSom, monthLabel } from '../format';

/** Uchala hisobot kartasi — oddiy, o'qiladigan jadvallar */

function Amount({ n }: { n: number }) {
  return <td className={n < 0 ? 'num neg' : 'num'}>{fmtSom(n)}</td>;
}

function Skeleton() {
  return (
    <div aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div className="skeleton" key={i} style={{ width: `${88 - i * 9}%` }} />
      ))}
    </div>
  );
}

// ──────────────────── "Nega foyda ≠ pul?" ko'prigi ────────────────────

/**
 * Direktor uchun eng muhim tushuntirish: sof foyda bilan pul o'zgarishi
 * orasidagi farq qayerdan kelgani, qatorma-qator. Ikkala yakuniy raqam
 * mustaqil hisoblanadi — mosligi modelning jonli isboti.
 */
export function BridgeCard({
  bridge,
  loading,
}: {
  bridge: ProfitCashBridge | null;
  loading: boolean;
}) {
  if (!loading && !bridge) return null;
  const b = bridge!;
  return (
    <section className="card bridge" aria-label="Foyda va pul farqi">
      <header>
        <h2>Nega foyda ≠ pul?</h2>
        {!loading && (
          <span className={b.matches ? 'badge good' : 'badge bad'}>
            {b.matches ? '✓ aynan mos' : '✕ farq bor'}
          </span>
        )}
      </header>
      {loading ? (
        <Skeleton />
      ) : (
        <>
          <table className="report">
            <tbody>
              <tr className="row">
                <td>Sof foyda ({monthLabel(b.month)})</td>
                <Amount n={b.netProfit} />
              </tr>
              {b.lines.map((l) => (
                <tr className="row" key={l.code}>
                  <td>
                    {l.amount >= 0 ? '+' : '−'} {l.label}
                  </td>
                  <Amount n={l.amount} />
                </tr>
              ))}
              <tr className="subtotal">
                <td>= Hisoblangan pul o'zgarishi</td>
                <Amount n={b.total} />
              </tr>
              <tr className={b.matches ? 'total ok' : 'total'}>
                <td>Amaldagi pul o'zgarishi (kassa + bank)</td>
                <Amount n={b.cashChange} />
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  Ikkala yakuniy raqam mustaqil hisoblanadi: yuqoridagisi P&L va balans
                  o'zgarishlaridan, pastdagisi pul hisoblari harakatidan. Mosligi — model
                  to'g'riligining isboti (texnik topshiriq, 2.3-bo'lim).
                </td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </section>
  );
}

// ─────────────────────────── Foyda va zarar ───────────────────────────

export function PnlCard({ report, loading }: { report: PnlReport | null; loading: boolean }) {
  return (
    <section className="card" aria-label="Foyda va zarar">
      <header>
        <h2>Foyda va zarar</h2>
        <span className="hint">{report ? monthLabel(report.month) : ''}</span>
      </header>
      {loading || !report ? (
        <Skeleton />
      ) : (
        <table className="report">
          <tbody>
            <tr className="section">
              <td colSpan={2}>Daromad</td>
            </tr>
            {report.revenue.length === 0 && (
              <tr className="row">
                <td>Daromad yo'q</td>
                <Amount n={0} />
              </tr>
            )}
            {report.revenue.map((l) => (
              <tr className="row" key={l.code}>
                <td>
                  <span className="code">{l.code}</span>
                  {l.name}
                </td>
                <Amount n={l.amount} />
              </tr>
            ))}
            <tr className="subtotal">
              <td>Jami daromad</td>
              <Amount n={report.totalRevenue} />
            </tr>

            <tr className="section">
              <td colSpan={2}>Xarajatlar</td>
            </tr>
            {report.expenses.map((l) => (
              <tr className="row" key={l.code}>
                <td>
                  <span className="code">{l.code}</span>
                  {l.name}
                </td>
                <Amount n={-l.amount} />
              </tr>
            ))}
            <tr className="subtotal">
              <td>Jami xarajat</td>
              <Amount n={-report.totalExpenses} />
            </tr>

            <tr className={report.netProfit >= 0 ? 'total ok' : 'total'}>
              <td>Sof foyda</td>
              <Amount n={report.netProfit} />
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

// ───────────────────────────── Pul oqimi ─────────────────────────────

const CF_LABELS: Record<CfCategory, string> = {
  operating: 'Operatsion faoliyat',
  investing: 'Investitsion faoliyat',
  financing: 'Moliyaviy faoliyat',
};

export function CashFlowCard({
  report,
  loading,
}: {
  report: CashFlowReport | null;
  loading: boolean;
}) {
  return (
    <section className="card" aria-label="Pul oqimi">
      <header>
        <h2>Pul oqimi</h2>
        <span className="hint">{report ? monthLabel(report.month) : ''}</span>
      </header>
      {loading || !report ? (
        <Skeleton />
      ) : (
        <table className="report">
          <tbody>
            <tr className="subtotal">
              <td>Oy boshidagi pul</td>
              <Amount n={report.opening} />
            </tr>

            {(['operating', 'investing', 'financing'] as const).map((cat) => {
              const lines = report.detail.filter((d) => d.category === cat);
              return (
                <FlowSection
                  key={cat}
                  title={CF_LABELS[cat]}
                  total={report[cat]}
                  lines={lines}
                />
              );
            })}

            <tr className="subtotal">
              <td>Sof o'zgarish</td>
              <Amount n={report.netChange} />
            </tr>
            <tr className="total">
              <td>Oy oxiridagi pul</td>
              <Amount n={report.closing} />
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

function FlowSection({
  title,
  total,
  lines,
}: {
  title: string;
  total: number;
  lines: { code: string; name: string; amount: number }[];
}) {
  return (
    <>
      <tr className="section">
        <td colSpan={2}>{title}</td>
      </tr>
      {lines.length === 0 && (
        <tr className="row">
          <td>Harakat yo'q</td>
          <Amount n={0} />
        </tr>
      )}
      {lines.map((l) => (
        <tr className="row" key={l.code}>
          <td>
            <span className="code">{l.code}</span>
            {l.name}
          </td>
          <Amount n={l.amount} />
        </tr>
      ))}
      <tr className="subtotal">
        <td>Jami</td>
        <Amount n={total} />
      </tr>
    </>
  );
}

// ─────────────────────────────── Balans ───────────────────────────────

export function BalanceCard({
  report,
  loading,
  month,
}: {
  report: BalanceSheet | null;
  loading: boolean;
  month: string;
}) {
  return (
    <section className="card" aria-label="Balans">
      <header>
        <h2>Balans</h2>
        <span className="hint">{month ? `${monthLabel(month)} oxiriga` : ''}</span>
      </header>
      {loading || !report ? (
        <Skeleton />
      ) : (
        <table className="report">
          <tbody>
            <tr className="section">
              <td colSpan={2}>Aktivlar</td>
            </tr>
            {report.assets.map((l) => (
              <tr className="row" key={l.code}>
                <td>
                  <span className="code">{l.code}</span>
                  {l.name}
                </td>
                <Amount n={l.amount} />
              </tr>
            ))}
            <tr className="subtotal">
              <td>Jami aktivlar</td>
              <Amount n={report.totalAssets} />
            </tr>

            <tr className="section">
              <td colSpan={2}>Majburiyatlar</td>
            </tr>
            {report.liabilities.map((l) => (
              <tr className="row" key={l.code}>
                <td>
                  <span className="code">{l.code}</span>
                  {l.name}
                </td>
                <Amount n={l.amount} />
              </tr>
            ))}
            <tr className="subtotal">
              <td>Jami majburiyatlar</td>
              <Amount n={report.totalLiabilities} />
            </tr>

            <tr className="section">
              <td colSpan={2}>Kapital</td>
            </tr>
            {report.equity.map((l) => (
              <tr className="row" key={l.code}>
                <td>
                  <span className="code">{l.code}</span>
                  {l.name}
                </td>
                <Amount n={l.amount} />
              </tr>
            ))}
            <tr className="subtotal">
              <td>Jami kapital</td>
              <Amount n={report.totalEquity} />
            </tr>

            <tr className={report.imbalance === 0 ? 'total ok' : 'total'}>
              <td>Aktiv − (Majburiyat + Kapital)</td>
              <Amount n={report.imbalance} />
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
