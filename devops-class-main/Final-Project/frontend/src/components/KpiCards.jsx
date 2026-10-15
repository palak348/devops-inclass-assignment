export default function KpiCards({ stats }) {
  if (!stats) return null;
  const cards = [
    { label: "Today's appointments", value: stats.appointments_today, tone: 'teal' },
    { label: 'Waiting (checked in)', value: stats.by_status.CHECKED_IN, tone: 'amber' },
    { label: 'Completed visits', value: stats.by_status.COMPLETED, tone: 'green' },
    { label: 'Active doctors / patients', value: `${stats.doctors} / ${stats.patients}`, tone: 'blue' },
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
        Busiest doctor: <b>{stats.busiest_doctor ?? '—'}</b> · {stats.appointments_total} bookings in total ·{' '}
        {stats.by_status.CANCELLED} cancelled
      </p>
    </section>
  );
}
