import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errText, useAuth } from '../../auth/AuthContext';
import { Alert, Button, Field, TextInput } from '../../components/ui';
import { AuthLayout } from './AuthLayout';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
      await register(name, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Ro'yxatdan o'tish">
      <form onSubmit={onSubmit} className="form">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Ism familiya">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Aziza Karimova"
            autoComplete="name"
            required
            autoFocus
          />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="siz@markaz.uz"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Parol" hint="Kamida 8 belgi">
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
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
          {busy ? 'Yaratilmoqda…' : "Ro'yxatdan o'tish"}
        </Button>
        <div className="form-links">
          <span>
            Hisobingiz bormi? <Link to="/login">Kirish</Link>
          </span>
        </div>
        <p className="form-note">
          Birinchi ro'yxatdan o'tgan foydalanuvchi tizim egasi bo'ladi; keyingilar
          "Kuzatuvchi" rolini oladi (administrator rolni o'zgartira oladi).
        </p>
      </form>
    </AuthLayout>
  );
}
