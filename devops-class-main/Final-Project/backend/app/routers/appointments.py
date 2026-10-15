from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..clock import clinic_day_bounds, now_utc, to_utc
from ..db import get_db
from ..models import Appointment
from ..schemas import AppointmentCreate, AppointmentOut, AppointmentStatus, AppointmentUpdate, StatusChange
from .doctors import get_doctor_or_404
from .patients import get_patient_or_404

router = APIRouter(prefix="/api/appointments", tags=["appointments"])

# Longest allowed appointment (see schemas.AppointmentBase.duration_min).
MAX_DURATION = timedelta(minutes=240)
# A booking a few minutes in the past is still fine (form filled in slowly).
PAST_GRACE = timedelta(minutes=5)

ACTIVE = ("SCHEDULED", "CHECKED_IN")
FINAL = ("COMPLETED", "CANCELLED")
# Allowed status moves. COMPLETED and CANCELLED are final.
TRANSITIONS: dict[str, set[str]] = {
    "SCHEDULED": {"CHECKED_IN", "CANCELLED"},
    "CHECKED_IN": {"COMPLETED", "CANCELLED"},
    "COMPLETED": set(),
    "CANCELLED": set(),
}


def get_appointment_or_404(db: Session, appointment_id: int) -> Appointment:
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment


def ensure_not_in_past(start: datetime) -> None:
    if start < now_utc() - PAST_GRACE:
        raise HTTPException(status_code=400, detail="Appointments cannot be booked in the past")


def find_overlap(
    db: Session, column, value: int, start: datetime, duration_min: int, exclude_id: int | None
) -> Appointment | None:
    """First active appointment on `column == value` that overlaps [start, start + duration)."""
    end = start + timedelta(minutes=duration_min)
    query = select(Appointment).where(
        column == value,
        Appointment.status.in_(ACTIVE),
        Appointment.scheduled_at < end,
        Appointment.scheduled_at > start - MAX_DURATION,
    )
    if exclude_id is not None:
        query = query.where(Appointment.id != exclude_id)
    for other in db.scalars(query):
        other_start = to_utc(other.scheduled_at)
        if other_start < end and start < other_start + timedelta(minutes=other.duration_min):
            return other
    return None


def ensure_slot_free(
    db: Session, doctor_id: int, patient_id: int, start: datetime, duration_min: int, exclude_id: int | None = None
) -> None:
    """Neither the doctor nor the patient may be in two places at once."""
    clash = find_overlap(db, Appointment.doctor_id, doctor_id, start, duration_min, exclude_id)
    if clash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{clash.doctor_name} is already booked at that time (appointment #{clash.id})",
        )
    clash = find_overlap(db, Appointment.patient_id, patient_id, start, duration_min, exclude_id)
    if clash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{clash.patient_name} already has an appointment at that time (#{clash.id})",
        )


@router.get("", response_model=list[AppointmentOut])
def list_appointments(
    doctor_id: int | None = None,
    patient_id: int | None = None,
    status_filter: AppointmentStatus | None = Query(default=None, alias="status"),
    on_date: date | None = Query(default=None, description="Clinic-local calendar day"),
    upcoming: bool = Query(default=False, description="Only active appointments that have not ended yet"),
    db: Session = Depends(get_db),
):
    query = select(Appointment).order_by(Appointment.scheduled_at)
    if doctor_id is not None:
        query = query.where(Appointment.doctor_id == doctor_id)
    if patient_id is not None:
        query = query.where(Appointment.patient_id == patient_id)
    if status_filter is not None:
        query = query.where(Appointment.status == status_filter)
    if on_date is not None:
        start, end = clinic_day_bounds(on_date)
        query = query.where(Appointment.scheduled_at >= start, Appointment.scheduled_at < end)
    if upcoming:
        # Coarse filter in SQL (could still be running), exact "not ended" check below.
        query = query.where(Appointment.status.in_(ACTIVE), Appointment.scheduled_at > now_utc() - MAX_DURATION)
        now = now_utc()
        return [
            a
            for a in db.scalars(query)
            if to_utc(a.scheduled_at) + timedelta(minutes=a.duration_min) > now or a.status == "CHECKED_IN"
        ]
    return list(db.scalars(query))


@router.get("/{appointment_id}", response_model=AppointmentOut)
def get_appointment(appointment_id: int, db: Session = Depends(get_db)):
    return get_appointment_or_404(db, appointment_id)


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(payload: AppointmentCreate, db: Session = Depends(get_db)):
    doctor = get_doctor_or_404(db, payload.doctor_id)
    if not doctor.active:
        raise HTTPException(status_code=400, detail=f"{doctor.name} is not taking appointments")
    get_patient_or_404(db, payload.patient_id)

    start = to_utc(payload.scheduled_at)
    ensure_not_in_past(start)
    ensure_slot_free(db, payload.doctor_id, payload.patient_id, start, payload.duration_min)

    appointment = Appointment(**payload.model_dump(exclude={"scheduled_at"}), scheduled_at=start)
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@router.put("/{appointment_id}", response_model=AppointmentOut)
def update_appointment(appointment_id: int, payload: AppointmentUpdate, db: Session = Depends(get_db)):
    appointment = get_appointment_or_404(db, appointment_id)
    if appointment.status in FINAL:
        raise HTTPException(status_code=409, detail=f"A {appointment.status.lower()} appointment cannot be changed")
    changes = payload.model_dump(exclude_unset=True)

    if "doctor_id" in changes:
        doctor = get_doctor_or_404(db, changes["doctor_id"])
        if not doctor.active and doctor.id != appointment.doctor_id:
            raise HTTPException(status_code=400, detail=f"{doctor.name} is not taking appointments")
    if "patient_id" in changes:
        get_patient_or_404(db, changes["patient_id"])
    if "scheduled_at" in changes:
        changes["scheduled_at"] = to_utc(changes["scheduled_at"])
        ensure_not_in_past(changes["scheduled_at"])

    # Re-check both calendars whenever who / when / how long changes.
    if {"doctor_id", "patient_id", "scheduled_at", "duration_min"} & changes.keys():
        ensure_slot_free(
            db,
            changes.get("doctor_id", appointment.doctor_id),
            changes.get("patient_id", appointment.patient_id),
            changes.get("scheduled_at", to_utc(appointment.scheduled_at)),
            changes.get("duration_min", appointment.duration_min),
            exclude_id=appointment.id,
        )

    for key, value in changes.items():
        setattr(appointment, key, value)
    db.commit()
    db.refresh(appointment)
    return appointment


@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
def change_status(appointment_id: int, payload: StatusChange, db: Session = Depends(get_db)):
    appointment = get_appointment_or_404(db, appointment_id)
    if payload.status not in TRANSITIONS[appointment.status]:
        allowed = ", ".join(sorted(TRANSITIONS[appointment.status])) or "none - it is final"
        raise HTTPException(
            status_code=409,
            detail=f"Cannot change {appointment.status} to {payload.status} (allowed: {allowed})",
        )
    appointment.status = payload.status
    db.commit()
    db.refresh(appointment)
    return appointment


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(appointment_id: int, db: Session = Depends(get_db)):
    appointment = get_appointment_or_404(db, appointment_id)
    db.delete(appointment)
    db.commit()
