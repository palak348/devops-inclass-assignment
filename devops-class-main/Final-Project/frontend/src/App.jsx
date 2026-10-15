import { useCallback, useEffect, useState } from 'react';
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

export default function App() {
  const [view, setView] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(false);
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [s, d, p, a] = await Promise.all([
        api.stats(),
        api.doctors(),
        api.patients(),
        api.appointments({ status: statusFilter }),
      ]);
      setStats(s);
      setDoctors(d);
      setPatients(p);
      setAppointments(a);
      setError('');
    } catch (err) {
      setError(`Cannot reach the CareSlot API - ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Wraps every mutation: run it, refresh the data, show feedback.
  const act = async (fn, message) => {
    try {
      await fn();
      setToast(message);
      await refresh();
      return true;
    } catch (err) {
      setToast(`⚠ ${err.message}`);
      return false;
    }
  };

  const navigate = (next) => {
    setView(next);
    setMenuOpen(false);
  };

  const [title, subtitle] = TITLES[view];
  const table = (
    <AppointmentTable
      appointments={appointments}
      statusFilter={statusFilter}
      onFilter={setStatusFilter}
      onStatus={(id, status) => act(() => api.setStatus(id, status), `Appointment #${id} → ${status}`)}
      onDelete={(id) => act(() => api.deleteAppointment(id), `Appointment #${id} deleted`)}
      compact={view === 'dashboard'}
    />
  );

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
          <button className="btn primary" onClick={() => setBooking(true)} disabled={!doctors.length || !patients.length}>
            + Book appointment
          </button>
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
                    <h2>Upcoming appointments</h2>
                    <button className="btn ghost" onClick={() => navigate('appointments')}>
                      View all →
                    </button>
                  </div>
                  {table}
                </section>
              </>
            )}
            {view === 'appointments' && <section className="card">{table}</section>}
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
                onDelete={(d) => act(() => api.deleteDoctor(d.id), `${d.name} removed`)}
              />
            )}
            {view === 'patients' && (
              <PatientList
                patients={patients}
                onCreate={(data) => act(() => api.createPatient(data), `${data.name} registered`)}
                onDelete={(p) => act(() => api.deletePatient(p.id), `${p.name} removed`)}
              />
            )}
          </>
        )}
      </main>

      {booking && (
        <BookingModal
          doctors={doctors.filter((d) => d.active)}
          patients={patients}
          onClose={() => setBooking(false)}
          onSubmit={async (data) => {
            const ok = await act(() => api.createAppointment(data), 'Appointment booked');
            if (ok) setBooking(false);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
