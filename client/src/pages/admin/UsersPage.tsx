import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type AdminUser, type Paginated, type Role } from '../../api';
import { errText, useAuth } from '../../auth/AuthContext';
import { Alert, Button, Field, Pager, Select, StatusPill, TextInput } from '../../components/ui';
import { fmtDateTime } from '../../format';

/**
 * Foydalanuvchilar boshqaruvi: qidiruv, rol filtri, paginatsiya,
 * yaratish/tahrirlash paneli, bloklash va o'chirish.
 */
export default function UsersPage() {
  const { user: me } = useAuth();
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);

  const load = useCallback(() => {
    api
      .users({ page, limit: 10, search: search || undefined, role: roleFilter || undefined })
      .then(setData)
      .catch((e) => setError(errText(e)));
  }, [page, search, roleFilter]);

  useEffect(load, [load]);
  useEffect(() => {
    api.roles().then((r) => setRoles(r.items)).catch(() => {});
  }, []);

  async function toggleActive(u: AdminUser) {
    setError('');
    try {
      await api.updateUser(u.id, { active: !u.active });
      load();
    } catch (e) {
      setError(errText(e));
    }
  }

  async function remove(u: AdminUser) {
    if (!window.confirm(`${u.email} hisobini butunlay o'chirasizmi?`)) return;
    setError('');
    try {
      await api.deleteUser(u.id);
      load();
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <div>
      <div className="pagebar">
        <h2 className="page-title">Foydalanuvchilar</h2>
        <Button onClick={() => setEditing('new')}>+ Yangi foydalanuvchi</Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="filterbar">
        <TextInput
          placeholder="Qidiruv: ism yoki email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Barcha rollar</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>

      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          roles={roles}
          onDone={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <section className="card">
        <table className="report list">
          <thead>
            <tr>
              <th>Foydalanuvchi</th>
              <th>Rol</th>
              <th>Holat</th>
              <th>Oxirgi kirish</th>
              <th className="num">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr className="row" key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <br />
                  <small className="dim">{u.email}</small>
                </td>
                <td>{u.roleName}</td>
                <td>
                  <StatusPill on={u.active} onText="Faol" offText="Bloklangan" />
                </td>
                <td>{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : '—'}</td>
                <td className="num actions">
                  <Button variant="ghost" onClick={() => setEditing(u)}>
                    Tahrirlash
                  </Button>
                  {u.id !== me?.id && (
                    <>
                      <Button variant="ghost" onClick={() => void toggleActive(u)}>
                        {u.active ? 'Bloklash' : 'Faollashtirish'}
                      </Button>
                      <Button variant="danger" onClick={() => void remove(u)}>
                        O'chirish
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="state">
                  Hech narsa topilmadi
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

function UserForm(props: {
  user: AdminUser | null;
  roles: Role[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user, roles } = props;
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [roleKey, setRoleKey] = useState(user?.roleKey ?? 'director');
  const [active, setActive] = useState(user?.active ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (user) {
        await api.updateUser(user.id, {
          name,
          roleKey,
          active,
          ...(password ? { password } : {}),
        });
      } else {
        await api.createUser({ name, email, password, roleKey, active });
      }
      props.onDone();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card panel">
      <header>
        <h2>{user ? `Tahrirlash: ${user.email}` : 'Yangi foydalanuvchi'}</h2>
      </header>
      <div className="panel-body">
        <form onSubmit={onSubmit} className="form form-grid">
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Ism familiya">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
          </Field>
          {!user && (
            <Field label="Email">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
          )}
          <Field
            label={user ? 'Yangi parol (bo\'sh qoldirsangiz o\'zgarmaydi)' : 'Parol'}
            hint="Kamida 8 belgi"
          >
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required={!user}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Rol">
            <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name} ({r.key})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Holat">
            <Select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
              <option value="1">Faol</option>
              <option value="0">Bloklangan</option>
            </Select>
          </Field>
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saqlanmoqda…' : 'Saqlash'}
            </Button>
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              Bekor qilish
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
