const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'appointments', label: 'Appointments', icon: '🗓' },
  { id: 'doctors', label: 'Doctors', icon: '🩺' },
  { id: 'patients', label: 'Patients', icon: '👥' },
];

export default function Sidebar({ view, onNavigate, open, onClose }) {
  return (
    <>
      <div className={`backdrop ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="logo">✚</span>
          <div>
            <strong>CareSlot</strong>
            <small>Clinic appointments</small>
          </div>
        </div>

        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="pipeline">
          <small>Delivery pipeline</small>
          <ol>
            {['pytest', 'Docker build', 'Trivy scan', 'GHCR', 'Helm → K8s'].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </aside>
    </>
  );
}
