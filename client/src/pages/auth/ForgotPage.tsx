import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { errText } from '../../auth/AuthContext';
import { Alert, Button, Field, TextInput } from '../../components/ui';
import { AuthLayout } from './AuthLayout';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [devToken, setDevToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.forgot(email);
      setMessage(res.message);
      if (res.devToken) setDevToken(res.devToken);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Parolni tiklash">
      <form onSubmit={onSubmit} className="form">
        {error && <Alert kind="error">{error}</Alert>}
        {message && <Alert kind="success">{message}</Alert>}
        {devToken && (
          <Alert kind="info">
            Dev rejim (SMTP yo'q):{' '}
            <Link to={`/reset-password?token=${devToken}`}>tiklash havolasini ochish</Link>
          </Alert>
        )}
        {!message && (
          <>
            <Field label="Email" hint="Ro'yxatdan o'tgan email manzilingiz">
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Yuborilmoqda…' : 'Tiklash havolasini olish'}
            </Button>
          </>
        )}
        <div className="form-links">
          <Link to="/login">← Kirish sahifasiga qaytish</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
