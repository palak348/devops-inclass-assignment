const FILTERS = ['', 'SCHEDULED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED'];

// Buttons each status offers - mirrors the backend's allowed transitions.
const NEXT = {
  SCHEDULED: [
    ['CHECKED_IN', 'Check in'],
    ['CANCELLED', 'Cancel'],
  ],
  CHECKED_IN: [
    ['COMPLETED', 'Complete'],
    ['CANCELLED', 'Cancel'],
  ],
};

const label = (s) => s.replace('_', ' ').toLowerCase();

// The API returns UTC; values without an offset (SQLite) are UTC too.
const parse = (iso) => new Date(/Z|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);

function formatWhen(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AppointmentTable({ appointments, statusFilter, onFilter, onStatus, onDelete, emptyText }) {
  const now = new Date();

  return (
    <>
      {onFilter && (
        <div className="filters" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f || 'all'}
              className={`chip ${statusFilter === f ? 'active' : ''}`}
              aria-pressed={statusFilter === f}
              onClick={() => onFilter(f)}
            >
              {f ? label(f) : 'all'}
            </button>
          ))}
        </div>
      )}

      {appointments.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>When</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Reason</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => {
                const start = parse(a.scheduled_at);
                // Start time has passed but the patient never checked in.
                const late = a.status === 'SCHEDULED' && start < now;
                return (
                  <tr key={a.id} className={late ? 'late' : ''}>
                    <td data-label="#">{a.id}</td>
                    <td data-label="When">
                      {formatWhen(start)}
                      <small className="muted"> · {a.duration_min} min</small>
                    </td>
                    <td data-label="Patient">{a.patient_name}</td>
                    <td data-label="Doctor">{a.doctor_name}</td>
                    <td data-label="Reason">{a.reason || '—'}</td>
                    <td data-label="Status">
                      <span className={`badge ${a.status.toLowerCase()}`}>{label(a.status)}</span>
                      {late && <span className="badge late-badge">late</span>}
                    </td>
                    <td className="actions">
                      {(NEXT[a.status] ?? []).map(([status, text]) => (
                        <button
                          key={status}
                          className={`btn small ${status === 'CANCELLED' ? 'danger' : ''}`}
                          onClick={() => onStatus(a, status)}
                        >
                          {text}
                        </button>
                      ))}
                      <button className="btn small danger" onClick={() => onDelete(a)} aria-label={`Delete appointment ${a.id}`}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
