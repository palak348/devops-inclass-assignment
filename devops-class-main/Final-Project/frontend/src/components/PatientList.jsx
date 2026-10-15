import { useState } from 'react';

const EMPTY = { name: '', phone: '', email: '', date_of_birth: '' };

export default function PatientList({ patients, onCreate, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    // Optional fields are sent as null rather than empty strings.
    const payload = { ...form, email: form.email || null, date_of_birth: form.date_of_birth || null };
    if (await onCreate(payload)) setForm(EMPTY);
  };

  const shown = patients.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <form className="card inline-form" onSubmit={submit}>
        <input placeholder="Full name" value={form.name} onChange={set('name')} required minLength={2} />
        <input placeholder="Phone" value={form.phone} onChange={set('phone')} required pattern="\+?[0-9 \-]{7,20}" />
        <input placeholder="Email (optional)" type="email" value={form.email} onChange={set('email')} />
        <input type="date" aria-label="Date of birth" value={form.date_of_birth} onChange={set('date_of_birth')} />
        <button className="btn primary">Register patient</button>
      </form>

      <section className="card">
        <div className="card-head">
          <h2>{patients.length} registered patients</h2>
          <input className="search" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {shown.length === 0 ? (
          <p className="empty">No patients found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Date of birth</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Name">{p.name}</td>
                    <td data-label="Phone">{p.phone}</td>
                    <td data-label="Email">{p.email || '—'}</td>
                    <td data-label="Born">{p.date_of_birth || '—'}</td>
                    <td className="actions">
                      <button className="btn small danger" onClick={() => onDelete(p)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
