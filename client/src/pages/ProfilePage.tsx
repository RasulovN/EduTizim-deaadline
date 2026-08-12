import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { errText, useAuth } from '../auth/AuthContext';
import { Alert, Button, Field, TextInput } from '../components/ui';
import { fmtDateTime } from '../format';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [nameMsg, setNameMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passMsg, setPassMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameMsg(null);
    setBusy(true);
    try {
      const { user: updated } = await api.updateProfile(name);
      setUser(updated);
      setNameMsg({ kind: 'success', text: 'Ism yangilandi' });
    } catch (err) {
      setNameMsg({ kind: 'error', text: errText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPassMsg(null);
    if (next !== confirm) {
      setPassMsg({ kind: 'error', text: 'Yangi parollar mos kelmadi' });
      return;
    }
    setBusy(true);
    try {
      const res = await api.changePassword(current, next);
      setPassMsg({ kind: 'success', text: res.message });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setPassMsg({ kind: 'error', text: errText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h2 className="page-title">Profil</h2>

      <section className="card panel">
        <header>
          <h2>Hisob ma'lumotlari</h2>
        </header>
        <div className="panel-body">
          <dl className="meta">
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>{user.roleName}</dd>
            </div>
            <div>
              <dt>Oxirgi kirish</dt>
              <dd>{user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : '—'}</dd>
            </div>
          </dl>
          <form onSubmit={saveName} className="form">
            {nameMsg && <Alert kind={nameMsg.kind}>{nameMsg.text}</Alert>}
            <Field label="Ism familiya">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
            </Field>
            <Button type="submit" disabled={busy || name === user.name}>
              Saqlash
            </Button>
          </form>
        </div>
      </section>

      <section className="card panel">
        <header>
          <h2>Parolni o'zgartirish</h2>
          <span className="hint">Boshqa qurilmalardagi sessiyalar bekor qilinadi</span>
        </header>
        <div className="panel-body">
          <form onSubmit={savePassword} className="form">
            {passMsg && <Alert kind={passMsg.kind}>{passMsg.text}</Alert>}
            <Field label="Joriy parol">
              <TextInput
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Yangi parol" hint="Kamida 8 belgi">
              <TextInput
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Field label="Yangi parolni tasdiqlang">
              <TextInput
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Button type="submit" disabled={busy}>
              Parolni yangilash
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
