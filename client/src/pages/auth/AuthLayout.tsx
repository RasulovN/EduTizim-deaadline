import type { ReactNode } from 'react';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <h1>EduTizim</h1>
          <span>Moliya moduli</span>
        </div>
        <h2 className="auth-title">{title}</h2>
        {children}
      </div>
      <p className="auth-foot">O'quv markaz CRM · Balans / Pul oqimi / Foyda va zarar</p>
    </div>
  );
}
