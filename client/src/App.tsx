import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPage from './pages/auth/ForgotPage';
import ResetPage from './pages/auth/ResetPage';
import UsersPage from './pages/admin/UsersPage';
import RolesPage from './pages/admin/RolesPage';
import LogsPage from './pages/admin/LogsPage';

/** Ruxsat talab qiladigan sahifa — bo'lmasa bosh sahifaga */
function RequirePerm({ perm, children }: { perm: string; children: JSX.Element }) {
  const { can } = useAuth();
  return can(perm) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      {/* Ochiq sahifalar — kirgan foydalanuvchi dashboardga yo'naltiriladi */}
      <Route
        path="/login"
        element={!loading && user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={!loading && user ? <Navigate to="/" replace /> : <RegisterPage />}
      />
      <Route path="/forgot-password" element={<ForgotPage />} />
      <Route path="/reset-password" element={<ResetPage />} />

      {/* Himoyalangan qobiq */}
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/admin/users"
          element={
            <RequirePerm perm="users.manage">
              <UsersPage />
            </RequirePerm>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <RequirePerm perm="roles.manage">
              <RolesPage />
            </RequirePerm>
          }
        />
        <Route
          path="/admin/logs"
          element={
            <RequirePerm perm="logs.view">
              <LogsPage />
            </RequirePerm>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
