import { useState } from 'react';

const EMPTY = { name: '', phone: '', email: '', date_of_birth: '' };
const todayIso = () => new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd in local time

export default function PatientList({ patients, onCreate, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  // Keep only digits and stop at 10 while typing.
  const setPhone = (e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) });
  // A pasted number may carry the country code or a trunk 0: "+91 98765-43210", "098765 43210".
  const pastePhone = (e) => {
    e.preventDefault();
    let digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    setForm({ ...form, phone: digits.slice(0, 10) });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    // Optional fields are sent as null rather than empty strings.
    const payload = {
      name: form.name.trim(),
      phone: form.phone,
      email: form.email.trim() || null,
      date_of_birth: form.date_of_birth || null,
    };
    if (await onCreate(payload)) setForm(EMPTY);
    setBusy(false);
  };

  const term = search.trim().toLowerCase();
  const shown = patients.filter((p) => p.name.toLowerCase().includes(term) || p.phone.includes(term));

  return (
    <>
      <form className="card inline-form" onSubmit={submit}>
        <label>
          Full name
          <input placeholder="Riya Sharma" value={form.name} onChange={set('name')} required minLength={2} maxLength={120} />
        </label>
        <label>
          Mobile number
          <span className="field">
          <input
            placeholder="9876543210"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={form.phone}
            onChange={setPhone}
            onPaste={pastePhone}
            required
            minLength={10}
            maxLength={10}
            pattern="[0-9]{10}"
            title="Enter exactly 10 digits"
          />
          <small className={`counter ${form.phone.length === 10 ? 'ok' : ''}`}>{form.phone.length}/10</small>
          </span>
        </label>
        <label>
          <span>
            Email <span className="optional">(optional)</span>
          </span>
          <input placeholder="riya@example.com" type="email" value={form.email} onChange={set('email')} maxLength={160} />
        </label>
        <label>
          <span>
            Date of birth <span className="optional">(optional)</span>
          </span>
          <input type="date" value={form.date_of_birth} max={todayIso()} onChange={set('date_of_birth')} />
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Registering…' : 'Register patient'}
        </button>
      </form>

      <section className="card">
        <div className="card-head">
          <h2>{patients.length} registered patients</h2>
          <input
            className="search"
            type="search"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {shown.length === 0 ? (
          <p className="empty">{patients.length ? 'No patient matches your search.' : 'No patients registered yet.'}</p>
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
                    <td data-label="Born">
                      {p.date_of_birth ? new Date(`${p.date_of_birth}T00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
                    </td>
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
