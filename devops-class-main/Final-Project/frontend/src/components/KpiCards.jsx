export default function KpiCards({ stats }) {
  if (!stats) return null;
  const cards = [
    { label: "Today's appointments", value: stats.appointments_today, tone: 'teal' },
    { label: 'In the waiting room', value: stats.by_status.CHECKED_IN, tone: 'amber' },
    { label: 'Upcoming (scheduled)', value: stats.appointments_upcoming, tone: 'blue' },
    { label: 'Completed visits', value: stats.by_status.COMPLETED, tone: 'green' },
  ];

  return (
    <section className="kpis">
      {cards.map((card) => (
        <article key={card.label} className={`kpi ${card.tone}`}>
          <span className="muted">{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
      <p className="kpi-note muted">
        Doctors available: <b>{stats.active_doctors}</b> of {stats.doctors} · Patients: <b>{stats.patients}</b> ·
        Busiest doctor: <b>{stats.busiest_doctor ?? '—'}</b> · {stats.by_status.CANCELLED} cancelled
      </p>
    </section>
  );
}
