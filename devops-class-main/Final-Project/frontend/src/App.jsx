import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import KpiCards from './components/KpiCards.jsx';
import AppointmentTable from './components/AppointmentTable.jsx';
import BookingModal from './components/BookingModal.jsx';
import DoctorList from './components/DoctorList.jsx';
import PatientList from './components/PatientList.jsx';

const TITLES = {
  dashboard: ['Today at the clinic', 'Live overview of bookings and visits'],
  appointments: ['Appointments', 'Book, check in and close patient visits'],
  doctors: ['Doctors', 'Manage the clinic roster and availability'],
  patients: ['Patients', 'Registered patients and contact details'],
};

// Data is re-fetched in the background so several front-desk screens stay in sync.
const REFRESH_MS = 30_000;

export default function App() {
  const [view, setView] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(false);
  const [toast, setToast] = useState(null); // {text, kind: 'ok' | 'error'}
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    // Ignore responses that arrive after a newer refresh started (fast filter clicks).
    const id = ++requestId.current;
    try {
      const [s, d, p, a, u] = await Promise.all([
        api.stats(),
        api.doctors(),
        api.patients(),
        api.appointments({ status: statusFilter }),
        api.appointments({ upcoming: 'true' }),
      ]);
      if (id !== requestId.current) return;
      setStats(s);
      setDoctors(d);
      setPatients(p);
      setAppointments(a);
      setUpcoming(u);
      setError('');
    } catch (err) {
      if (id === requestId.current) setError(`Cannot reach the CareSlot API - ${err.message}`);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Wraps every mutation: run it, show feedback, refresh the data. Returns true on success.
  // The refresh runs in the background so dialogs/forms react to success immediately.
  const act = async (fn, message) => {
    try {
      await fn();
      setToast({ text: message, kind: 'ok' });
      refresh();
      return true;
    } catch (err) {
      setToast({ text: err.message, kind: 'error' });
      return false;
    }
  };

  const confirmThen = (question, fn, message) => (window.confirm(question) ? act(fn, message) : false);

  const navigate = (next) => {
    setView(next);
    setMenuOpen(false);
  };

  const activeDoctors = doctors.filter((d) => d.active);
  const bookingBlocked = !patients.length
    ? 'Register a patient first'
    : !activeDoctors.length
      ? 'No doctor is available - mark one available first'
      : '';

  const countFor = (key, id) => appointments.filter((a) => a[key] === id).length;
  const deleteWarning = (name, key, id) => {
    // The loaded list is only complete when no status filter is active.
    if (statusFilter) return `Remove ${name}? Any of their appointments will be deleted too.`;
    const n = countFor(key, id);
    return n ? `Remove ${name}? This also deletes ${n} appointment${n === 1 ? '' : 's'}.` : `Remove ${name}?`;
  };

  const tableHandlers = {
    onStatus: (a, status) => act(() => api.setStatus(a.id, status), `${a.patient_name}: ${status.replace('_', ' ').toLowerCase()}`),
    onDelete: (a) =>
      confirmThen(
        `Delete appointment #${a.id} (${a.patient_name} with ${a.doctor_name})?`,
        () => api.deleteAppointment(a.id),
        `Appointment #${a.id} deleted`,
      ),
  };

  const [title, subtitle] = TITLES[view];

  return (
    <div className="layout">
      <Sidebar view={view} onNavigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div>
            <h1>{title}</h1>
            <p className="muted">{subtitle}</p>
          </div>
          <div className="book-wrap">
            <button className="btn primary" onClick={() => setBooking(true)} disabled={Boolean(bookingBlocked)}>
              + Book appointment
            </button>
            {bookingBlocked && !loading && <small className="muted">{bookingBlocked}</small>}
          </div>
        </header>

        {error && (
          <div className="alert" role="alert">
            {error}
            <button className="btn ghost" onClick={refresh}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading">Loading clinic data…</div>
        ) : (
          <>
            {view === 'dashboard' && (
              <>
                <KpiCards stats={stats} />
                <section className="card">
                  <div className="card-head">
                    <h2>Upcoming & in the waiting room</h2>
                    <button className="btn ghost" onClick={() => navigate('appointments')}>
                      View all →
                    </button>
                  </div>
                  <AppointmentTable
                    appointments={upcoming.slice(0, 8)}
                    emptyText="Nothing scheduled. Use “Book appointment” to add a visit."
                    {...tableHandlers}
                  />
                </section>
              </>
            )}
            {view === 'appointments' && (
              <section className="card">
                <AppointmentTable
                  appointments={appointments}
                  statusFilter={statusFilter}
                  onFilter={setStatusFilter}
                  emptyText={statusFilter ? 'No appointments with this status.' : 'No appointments yet.'}
                  {...tableHandlers}
                />
              </section>
            )}
            {view === 'doctors' && (
              <DoctorList
                doctors={doctors}
                onCreate={(data) => act(() => api.createDoctor(data), `${data.name} added`)}
                onToggle={(d) =>
                  act(
                    () => api.updateDoctor(d.id, { active: !d.active }),
                    `${d.name} is now ${d.active ? 'unavailable' : 'available'}`,
                  )
                }
                onDelete={(d) =>
                  confirmThen(deleteWarning(d.name, 'doctor_id', d.id), () => api.deleteDoctor(d.id), `${d.name} removed`)
                }
              />
            )}
            {view === 'patients' && (
              <PatientList
                patients={patients}
                onCreate={(data) => act(() => api.createPatient(data), `${data.name} registered`)}
                onDelete={(p) =>
                  confirmThen(deleteWarning(p.name, 'patient_id', p.id), () => api.deletePatient(p.id), `${p.name} removed`)
                }
              />
            )}
          </>
        )}
      </main>

      {booking && (
        <BookingModal
          doctors={activeDoctors}
          patients={patients}
          onClose={() => setBooking(false)}
          onSubmit={async (data) => {
            const ok = await act(() => api.createAppointment(data), 'Appointment booked');
            if (ok) setBooking(false);
            return ok;
          }}
        />
      )}

      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.kind === 'error' ? '⚠ ' : '✓ '}
          {toast.text}
        </div>
      )}
    </div>
  );
}
