import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errText, useAuth } from '../../auth/AuthContext';
import { Alert, Button, Field, TextInput } from '../../components/ui';
import { AuthLayout } from './AuthLayout';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Tizimga kirish">
      <form onSubmit={onSubmit} className="form">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Email">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="director@edutizim.uz"
            autoComplete="email"
            required
            autoFocus
          />
        </Field>
        <Field label="Parol">
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Kirilmoqda…' : 'Kirish'}
        </Button>
        <div className="form-links">
          <Link to="/forgot-password">Parolni unutdingizmi?</Link>
          <span>
            Hisobingiz yo'qmi? <Link to="/register">Ro'yxatdan o'tish</Link>
          </span>
        </div>
        <p className="form-note">
          Demo hisob (seed'dan keyin): <code>director@edutizim.uz</code> / <code>demo1234</code>
        </p>
      </form>
    </AuthLayout>
  );
}
