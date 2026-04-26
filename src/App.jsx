import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useAuth } from './lib/auth.jsx';
import { api } from './lib/api.js';
import { useToast } from './components/Toast.jsx';
import { on as onRealtime } from './lib/realtime.js';
import ThemeToggle from './components/ThemeToggle.jsx';
import TabBar from './components/TabBar.jsx';

const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const OrderCreate = lazy(() => import('./pages/OrderCreate.jsx'));
const OrderDetail = lazy(() => import('./pages/OrderDetail.jsx'));
const Inventory = lazy(() => import('./pages/Inventory.jsx'));
const Pricelist = lazy(() => import('./pages/Pricelist.jsx'));
const HR = lazy(() => import('./pages/HR.jsx'));
const Payroll = lazy(() => import('./pages/Payroll.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Fines = lazy(() => import('./pages/Fines.jsx'));
const Announcements = lazy(() => import('./pages/Announcements.jsx'));
const ShiftChecklist = lazy(() => import('./pages/ShiftChecklist.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const More = lazy(() => import('./pages/More.jsx'));
const Calculator = lazy(() => import('./pages/Calculator.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const Training = lazy(() => import('./pages/Training.jsx'));
const WorkJournal = lazy(() => import('./pages/WorkJournal.jsx'));
const LeaveRequests = lazy(() => import('./pages/LeaveRequests.jsx'));

function PrivateRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

// Раньше было поллингом каждые 30с; теперь сервер пушит SSE-событие announcement:new.
function AnnouncementsToast() {
  const { token } = useAuth();
  const showToast = useToast();
  useEffect(() => {
    if (!token) return;
    const off = onRealtime('announcement:new', async (data) => {
      showToast(data?.message || 'Новое объявление', 'success');
      try {
        api.clearCache('/api/announcements');
        if (data?.id) await api.post(`/api/announcements/${data.id}/read`, {});
      } catch {}
    });
    return off;
  }, [token, showToast]);
  return null;
}

function PageFallback() {
  return <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-tertiary)' }}>Загрузка…</div>;
}

export default function App() {
  return (
    <>
      <ThemeToggle />
      <div id="app" className="max-w-screen-xl mx-auto pb-20 page-enter">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/orders" element={<PrivateRoute><Orders /></PrivateRoute>} />
            <Route path="/orders/new" element={<PrivateRoute><OrderCreate /></PrivateRoute>} />
            <Route path="/orders/:id" element={<PrivateRoute><OrderDetail /></PrivateRoute>} />
            <Route path="/inventory" element={<PrivateRoute><Inventory /></PrivateRoute>} />
            <Route path="/pricelist" element={<PrivateRoute><Pricelist /></PrivateRoute>} />
            <Route path="/hr" element={<PrivateRoute><HR /></PrivateRoute>} />
            <Route path="/payroll" element={<PrivateRoute><Payroll /></PrivateRoute>} />
            <Route path="/users" element={<PrivateRoute><Users /></PrivateRoute>} />
            <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
            <Route path="/fines" element={<PrivateRoute><Fines /></PrivateRoute>} />
            <Route path="/announcements" element={<PrivateRoute><Announcements /></PrivateRoute>} />
            <Route path="/shift-checklist" element={<PrivateRoute><ShiftChecklist /></PrivateRoute>} />
            <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
            <Route path="/more" element={<PrivateRoute><More /></PrivateRoute>} />
            <Route path="/calculator" element={<PrivateRoute><Calculator /></PrivateRoute>} />
            <Route path="/tasks" element={<PrivateRoute><Tasks /></PrivateRoute>} />
            <Route path="/training" element={<PrivateRoute><Training /></PrivateRoute>} />
            <Route path="/work-journal" element={<PrivateRoute><WorkJournal /></PrivateRoute>} />
            <Route path="/leave-requests" element={<PrivateRoute><LeaveRequests /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </div>
      <TabBar />
      <AnnouncementsToast />
    </>
  );
}
