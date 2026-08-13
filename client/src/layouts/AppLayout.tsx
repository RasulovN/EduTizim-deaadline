import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  ChartIcon,
  CloseIcon,
  ListIcon,
  LogoutIcon,
  MenuIcon,
  ShieldIcon,
  UsersIcon,
} from '../components/icons';

/**
 * Himoyalangan qobiq: chapda doimiy sidebar (ruxsatlarga qarab nav),
 * mobilda yon tomondan chiqadigan drawer (hamburger + scrim).
 */
export default function AppLayout() {
  const { user, loading, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Sahifa almashganda drawer yopiladi
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Escape drawer'ni yopadi; ochiqda orqa fon skroll qilinmaydi
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" aria-hidden />
        Yuklanmoqda…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const showAdmin = can('users.manage') || can('roles.manage') || can('logs.view');

  return (
    <div className="app">
      <a className="skip" href="#main">
        Asosiy qismga o'tish
      </a>

      {/* Mobil sarlavha paneli */}
      <header className="mobilebar">
        <button
          className="iconbtn"
          onClick={() => setOpen(true)}
          aria-label="Menyuni ochish"
          aria-expanded={open}
        >
          <MenuIcon />
        </button>
        <div className="brand-mini">
          <span className="logo" aria-hidden>E</span>
          <strong>EduTizim</strong>
        </div>
        <NavLink to="/profile" className="avatar avatar-link" aria-label="Profil">
          {user.name.charAt(0).toUpperCase()}
        </NavLink>
      </header>

      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}

      <aside className={open ? 'sidebar open' : 'sidebar'} aria-label="Asosiy navigatsiya">
        <div className="side-brand">
          <span className="logo" aria-hidden>E</span>
          <div className="side-brand-text">
            <strong>EduTizim</strong>
            <small>Moliya moduli</small>
          </div>
          <button
            className="iconbtn side-close"
            onClick={() => setOpen(false)}
            aria-label="Menyuni yopish"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="side-nav">
          {can('reports.view') && (
            <>
              <span className="side-sec">Asosiy</span>
              <NavLink to="/" end>
                <ChartIcon />
                Hisobotlar
              </NavLink>
            </>
          )}
          {showAdmin && <span className="side-sec">Boshqaruv</span>}
          {can('users.manage') && (
            <NavLink to="/admin/users">
              <UsersIcon />
              Foydalanuvchilar
            </NavLink>
          )}
          {can('roles.manage') && (
            <NavLink to="/admin/roles">
              <ShieldIcon />
              Rollar
            </NavLink>
          )}
          {can('logs.view') && (
            <NavLink to="/admin/logs">
              <ListIcon />
              Audit loglar
            </NavLink>
          )}
        </nav>

        <div className="side-user">
          <NavLink to="/profile" className="side-userlink" title="Profil sozlamalari">
            <span className="avatar" aria-hidden>
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span className="userinfo">
              <strong>{user.name}</strong>
              <small>{user.roleName}</small>
            </span>
          </NavLink>
          <button
            className="iconbtn"
            onClick={() => {
              void logout().then(() => navigate('/login'));
            }}
            aria-label="Chiqish"
            title="Chiqish"
          >
            <LogoutIcon />
          </button>
        </div>
      </aside>

      <div className="content">
        <main id="main" className="main">
          <Outlet />
        </main>
        <footer className="pagefoot">
          Barcha summalar so'mda · ikki tomonlama yozuv (double-entry) asosida
          {showAdmin ? ' · RBAC + audit yoqilgan' : ''}
        </footer>
      </div>
    </div>
  );
}
