// All requests are same-origin: Nginx (docker compose) or the Ingress (Kubernetes)
// routes /api to the FastAPI backend, so the browser never needs its hostname.

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (response.status === 204) return null;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map((d) => `${d.loc.at(-1)}: ${d.msg}`).join(', ')
      : detail || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

const json = (method, data) => ({ method, body: JSON.stringify(data) });

export const api = {
  stats: () => request('/stats'),

  doctors: () => request('/doctors'),
  createDoctor: (data) => request('/doctors', json('POST', data)),
  updateDoctor: (id, data) => request(`/doctors/${id}`, json('PUT', data)),
  deleteDoctor: (id) => request(`/doctors/${id}`, { method: 'DELETE' }),

  patients: (search) => request(`/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createPatient: (data) => request('/patients', json('POST', data)),
  deletePatient: (id) => request(`/patients/${id}`, { method: 'DELETE' }),

  appointments: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return request(`/appointments${query.size ? `?${query}` : ''}`);
  },
  createAppointment: (data) => request('/appointments', json('POST', data)),
  setStatus: (id, status) => request(`/appointments/${id}/status`, json('PATCH', { status })),
  deleteAppointment: (id) => request(`/appointments/${id}`, { method: 'DELETE' }),
};
