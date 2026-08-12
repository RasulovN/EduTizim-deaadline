import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type PermissionDef, type Role } from '../../api';
import { errText } from '../../auth/AuthContext';
import { Alert, Button, Field, TextInput } from '../../components/ui';

/**
 * Rollar boshqaruvi: tizim rollari (o'chirilmaydi) va maxsus rollar,
 * ruxsatlar checkbox'lar bilan tahrirlanadi.
 */
export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<PermissionDef[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Role | 'new' | null>(null);

  const load = useCallback(() => {
    api.roles().then((r) => setRoles(r.items)).catch((e) => setError(errText(e)));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    api.permissions().then((r) => setPerms(r.permissions)).catch(() => {});
  }, []);

  async function remove(role: Role) {
    if (!window.confirm(`'${role.name}' rolini o'chirasizmi?`)) return;
    setError('');
    try {
      await api.deleteRole(role.key);
      load();
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <div>
      <div className="pagebar">
        <h2 className="page-title">Rollar va ruxsatlar</h2>
        <Button onClick={() => setEditing('new')}>+ Yangi rol</Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {editing && (
        <RoleForm
          role={editing === 'new' ? null : editing}
          perms={perms}
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
              <th>Rol</th>
              <th>Ruxsatlar</th>
              <th className="num">Foydalanuvchilar</th>
              <th className="num">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr className="row" key={r.key}>
                <td>
                  <strong>{r.name}</strong> <small className="dim">({r.key})</small>
                  {r.system && <span className="pill pill-sys">tizim</span>}
                  <br />
                  <small className="dim">{r.description}</small>
                </td>
                <td>
                  {r.permissions.length === 0 ? (
                    <small className="dim">Ruxsat yo'q</small>
                  ) : (
                    r.permissions.map((p) => (
                      <span key={p} className="pill pill-perm">
                        {perms.find((x) => x.key === p)?.label ?? p}
                      </span>
                    ))
                  )}
                </td>
                <td className="num">{r.users}</td>
                <td className="num actions">
                  <Button variant="ghost" onClick={() => setEditing(r)}>
                    Tahrirlash
                  </Button>
                  {!r.system && (
                    <Button variant="danger" onClick={() => void remove(r)}>
                      O'chirish
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function RoleForm(props: {
  role: Role | null;
  perms: PermissionDef[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { role, perms } = props;
  const [key, setKey] = useState(role?.key ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lockPerms = role?.key === 'owner';

  function toggle(p: string) {
    setSelected((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (role) {
        await api.updateRole(role.key, {
          name,
          description,
          ...(lockPerms ? {} : { permissions: selected }),
        });
      } else {
        await api.createRole({ key, name, description, permissions: selected });
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
        <h2>{role ? `Tahrirlash: ${role.name}` : 'Yangi rol'}</h2>
        {lockPerms && <span className="hint">"Egasi" ruxsatlari qulflangan</span>}
      </header>
      <div className="panel-body">
        <form onSubmit={onSubmit} className="form form-grid">
          {error && <Alert kind="error">{error}</Alert>}
          {!role && (
            <Field label="Kalit" hint="Kichik lotin harflar: masalan, accountant">
              <TextInput
                value={key}
                onChange={(e) => setKey(e.target.value)}
                pattern="[a-z][a-z0-9_-]{1,31}"
                required
              />
            </Field>
          )}
          <Field label="Nomi">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
          </Field>
          <Field label="Tavsif">
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </Field>
          <fieldset className="checks" disabled={lockPerms}>
            <legend>Ruxsatlar</legend>
            {perms.map((p) => (
              <label key={p.key} className="check">
                <input
                  type="checkbox"
                  checked={selected.includes(p.key)}
                  onChange={() => toggle(p.key)}
                />
                {p.label} <small className="dim">({p.key})</small>
              </label>
            ))}
          </fieldset>
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
