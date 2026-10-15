import { useState } from 'react';

const EMPTY = { name: '', specialty: '', room: '' };

export default function DoctorList({ doctors, onCreate, onToggle, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const payload = { name: form.name.trim(), specialty: form.specialty.trim(), room: form.room.trim() };
    if (await onCreate(payload)) setForm(EMPTY);
    setBusy(false);
  };

  return (
    <>
      <form className="card inline-form" onSubmit={submit}>
        <label>
          Doctor name
          <input placeholder="Dr. Meera Iyer" value={form.name} onChange={set('name')} required minLength={2} maxLength={120} />
        </label>
        <label>
          Specialty
          <input placeholder="Orthopedics" value={form.specialty} onChange={set('specialty')} required minLength={2} maxLength={80} />
        </label>
        <label>
          <span>
            Room <span className="optional">(optional)</span>
          </span>
          <input placeholder="102" value={form.room} onChange={set('room')} maxLength={20} />
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add doctor'}
        </button>
      </form>

      {doctors.length === 0 ? (
        <p className="empty">No doctors yet - add the first one above.</p>
      ) : (
        <section className="grid">
          {doctors.map((d) => (
            <article key={d.id} className="card person">
              <div className="avatar">{d.name.replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase()}</div>
              <div className="grow">
                <strong>{d.name}</strong>
                <p className="muted">
                  {d.specialty} · Room {d.room || '—'}
                </p>
                <span className={`badge ${d.active ? 'completed' : 'cancelled'}`}>
                  {d.active ? 'available' : 'unavailable'}
                </span>
              </div>
              <div className="stack">
                <button className="btn small" onClick={() => onToggle(d)}>
                  {d.active ? 'Mark away' : 'Mark available'}
                </button>
                <button className="btn small danger" onClick={() => onDelete(d)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
