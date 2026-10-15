import { useEffect, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');
// Local time formatted for <input type="datetime-local"> (yyyy-mm-ddThh:mm).
const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function nextHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toLocalInput(d);
}

export default function BookingModal({ doctors, patients, onClose, onSubmit }) {
  const [form, setForm] = useState({
    doctor_id: doctors[0]?.id ?? '',
    patient_id: patients[0]?.id ?? '',
    scheduled_at: nextHour(),
    duration_min: 15,
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // Esc closes the dialog.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return; // no double booking from a double click
    const when = new Date(form.scheduled_at);
    if (Number.isNaN(when.getTime())) return setProblem('Pick a valid date and time.');
    if (when < new Date()) return setProblem('That time is in the past - pick a future slot.');

    setProblem('');
    setBusy(true);
    await onSubmit({
      doctor_id: Number(form.doctor_id),
      patient_id: Number(form.patient_id),
      // datetime-local is in the user's timezone; send an explicit UTC instant.
      scheduled_at: when.toISOString(),
      duration_min: Number(form.duration_min),
      reason: form.reason.trim(),
    });
    setBusy(false); // the modal stays open on errors (e.g. slot taken) so the time can be changed
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <form
        className="modal"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
      >
        <h2 id="booking-title">Book appointment</h2>

        <label>
          Patient
          <select value={form.patient_id} onChange={set('patient_id')} required autoFocus>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.phone}
              </option>
            ))}
          </select>
        </label>

        <label>
          Doctor
          <select value={form.doctor_id} onChange={set('doctor_id')} required>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.specialty}
              </option>
            ))}
          </select>
        </label>

        <div className="row">
          <label>
            Date & time
            <input
              type="datetime-local"
              value={form.scheduled_at}
              // No `step`: the browser counts steps from `min` (e.g. 20:47), which made
              // round times like 11:00 "invalid" and silently blocked the booking.
              min={toLocalInput(new Date())}
              onChange={set('scheduled_at')}
              required
            />
          </label>
          <label>
            Duration
            <select value={form.duration_min} onChange={set('duration_min')}>
              {[15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Reason for visit
          <textarea value={form.reason} onChange={set('reason')} maxLength={500} rows={3} placeholder="e.g. fever, follow-up" />
        </label>

        {problem && <p className="form-error">{problem}</p>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Booking…' : 'Confirm booking'}
          </button>
        </div>
      </form>
    </div>
  );
}
