import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { errText } from '../../auth/AuthContext';
import { Alert, Button, Field, TextInput } from '../../components/ui';
import { AuthLayout } from './AuthLayout';

export default function ResetPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Parollar mos kelmadi');
      return;
    }
    setBusy(true);
    try {
      await api.reset(token, password);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Parolni tiklash">
        <Alert kind="error">Havola noto'g'ri — token topilmadi.</Alert>
        <div className="form-links">
          <Link to="/forgot-password">Yangi havola olish</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Yangi parol o'rnatish">
      <form onSubmit={onSubmit} className="form">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Yangi parol" hint="Kamida 8 belgi">
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
          />
        </Field>
        <Field label="Parolni tasdiqlang">
          <TextInput
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saqlanmoqda…' : 'Parolni yangilash'}
        </Button>
      </form>
    </AuthLayout>
  );
}
