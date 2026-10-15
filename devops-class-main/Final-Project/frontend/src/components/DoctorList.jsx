import { useState } from 'react';

const EMPTY = { name: '', specialty: '', room: '' };

export default function DoctorList({ doctors, onCreate, onToggle, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (await onCreate(form)) setForm(EMPTY);
  };

  return (
    <>
      <form className="card inline-form" onSubmit={submit}>
        <input placeholder="Doctor name" value={form.name} onChange={set('name')} required minLength={2} />
        <input placeholder="Specialty" value={form.specialty} onChange={set('specialty')} required minLength={2} />
        <input placeholder="Room" value={form.room} onChange={set('room')} maxLength={20} />
        <button className="btn primary">Add doctor</button>
      </form>

      <section className="grid">
        {doctors.map((d) => (
          <article key={d.id} className="card person">
            <div className="avatar">{d.name.replace('Dr. ', '').charAt(0)}</div>
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
    </>
  );
}
