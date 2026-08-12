import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';

/**
 * Himoyalangan qobiq: yuqori panel (navigatsiya ruxsatlarga qarab) + sahifa.
 */
export default function AppLayout() {
  const { user, loading, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="shell">
        <div className="state">Yuklanmoqda…</div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const showAdmin = can('users.manage') || can('roles.manage') || can('logs.view');

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <h1>EduTizim</h1>
          <span className="sub">Moliya moduli</span>
        </div>
        <nav className="nav">
          {can('reports.view') && (
            <NavLink to="/" end>
              Hisobotlar
            </NavLink>
          )}
          {can('users.manage') && <NavLink to="/admin/users">Foydalanuvchilar</NavLink>}
          {can('roles.manage') && <NavLink to="/admin/roles">Rollar</NavLink>}
          {can('logs.view') && <NavLink to="/admin/logs">Audit</NavLink>}
        </nav>
        <div className="userbox">
          <NavLink to="/profile" className="userlink" title="Profil sozlamalari">
            <span className="avatar" aria-hidden>
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span className="userinfo">
              <strong>{user.name}</strong>
              <small>{user.roleName}</small>
            </span>
          </NavLink>
          <Button
            variant="ghost"
            onClick={() => {
              void logout().then(() => navigate('/login'));
            }}
          >
            Chiqish
          </Button>
        </div>
      </div>
      <Outlet />
      <footer className="pagefoot">
        Barcha summalar so'mda · ikki tomonlama yozuv (double-entry) asosida
        {showAdmin ? ' · RBAC + audit yoqilgan' : ''}
      </footer>
    </div>
  );
}
