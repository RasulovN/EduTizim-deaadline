import { useCallback, useEffect, useState } from 'react';
import { api, type AuditLog, type Paginated } from '../../api';
import { errText } from '../../auth/AuthContext';
import { Alert, Pager, Select, StatusPill, TextInput } from '../../components/ui';
import { fmtDateTime } from '../../format';

/**
 * Audit loglar: kim, qachon, nima qildi — filtr va paginatsiya bilan.
 */
export default function LogsPage() {
  const [data, setData] = useState<Paginated<AuditLog> | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [email, setEmail] = useState('');
  const [ok, setOk] = useState<'' | 'true' | 'false'>('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .logs({
        page,
        limit: 20,
        action: action || undefined,
        email: email || undefined,
        ok: ok || undefined,
      })
      .then(setData)
      .catch((e) => setError(errText(e)));
  }, [page, action, email, ok]);

  useEffect(load, [load]);

  return (
    <div>
      <div className="pagebar">
        <h2 className="page-title">Audit loglar</h2>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="filterbar">
        <TextInput
          placeholder="Amal: auth.login, user.create…"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
        <TextInput
          placeholder="Bajaruvchi email…"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={ok}
          onChange={(e) => {
            setOk(e.target.value as typeof ok);
            setPage(1);
          }}
        >
          <option value="">Hammasi</option>
          <option value="true">Muvaffaqiyatli</option>
          <option value="false">Muvaffaqiyatsiz</option>
        </Select>
      </div>

      <section className="card">
        <table className="report list">
          <thead>
            <tr>
              <th>Vaqt</th>
              <th>Amal</th>
              <th>Bajaruvchi</th>
              <th>Obyekt</th>
              <th>Natija</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((l) => (
              <tr className="row" key={l.id}>
                <td className="nowrap">{fmtDateTime(l.ts)}</td>
                <td>
                  <code>{l.action}</code>
                </td>
                <td>{l.actorEmail ?? '—'}</td>
                <td>
                  {l.target ?? '—'}
                  {l.details && (
                    <>
                      <br />
                      <small className="dim">{JSON.stringify(l.details)}</small>
                    </>
                  )}
                </td>
                <td>
                  <StatusPill on={l.ok} onText="OK" offText="Xato" />
                </td>
                <td className="dim">{l.ip ?? '—'}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="state">
                  Log topilmadi
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {data && <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </div>
  );
}
