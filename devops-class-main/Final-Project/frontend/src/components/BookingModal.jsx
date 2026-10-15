import { useState } from 'react';

// Default slot: the next full hour, formatted for <input type="datetime-local">.
function nextHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

export default function BookingModal({ doctors, patients, onClose, onSubmit }) {
  const [form, setForm] = useState({
    doctor_id: doctors[0]?.id ?? '',
    patient_id: patients[0]?.id ?? '',
    scheduled_at: nextHour(),
    duration_min: 15,
    reason: '',
  });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      doctor_id: Number(form.doctor_id),
      patient_id: Number(form.patient_id),
      // datetime-local is in the user's timezone; send an explicit UTC instant.
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_min: Number(form.duration_min),
      reason: form.reason,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>Book appointment</h2>

        <label>
          Patient
          <select value={form.patient_id} onChange={set('patient_id')} required>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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
            <input type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} required />
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

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Confirm booking
          </button>
        </div>
      </form>
    </div>
  );
}
