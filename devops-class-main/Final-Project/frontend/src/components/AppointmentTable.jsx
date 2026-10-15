const FILTERS = ['', 'SCHEDULED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED'];

// Which buttons each status offers; COMPLETED / CANCELLED are final.
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
const formatTime = (iso) =>
  new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export default function AppointmentTable({ appointments, statusFilter, onFilter, onStatus, onDelete, compact }) {
  const rows = compact ? appointments.slice(0, 6) : appointments;

  return (
    <>
      <div className="filters" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f || 'all'} className={`chip ${statusFilter === f ? 'active' : ''}`} onClick={() => onFilter(f)}>
            {f ? label(f) : 'all'}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="empty">No appointments yet. Register a patient, then use “Book appointment”.</p>
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
              {rows.map((a) => (
                <tr key={a.id}>
                  <td data-label="#">{a.id}</td>
                  <td data-label="When">
                    {formatTime(a.scheduled_at)}
                    <small className="muted"> · {a.duration_min} min</small>
                  </td>
                  <td data-label="Patient">{a.patient_name}</td>
                  <td data-label="Doctor">{a.doctor_name}</td>
                  <td data-label="Reason">{a.reason || '—'}</td>
                  <td data-label="Status">
                    <span className={`badge ${a.status.toLowerCase()}`}>{label(a.status)}</span>
                  </td>
                  <td className="actions">
                    {(NEXT[a.status] ?? []).map(([status, text]) => (
                      <button key={status} className="btn small" onClick={() => onStatus(a.id, status)}>
                        {text}
                      </button>
                    ))}
                    <button className="btn small danger" onClick={() => onDelete(a.id)} aria-label={`Delete #${a.id}`}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
