from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Appointment
from ..schemas import AppointmentCreate, AppointmentOut, AppointmentStatus, AppointmentUpdate, StatusChange
from .doctors import get_doctor_or_404
from .patients import get_patient_or_404

router = APIRouter(prefix="/api/appointments", tags=["appointments"])

# Longest allowed appointment (see schemas.AppointmentBase.duration_min).
MAX_DURATION = timedelta(minutes=240)


def to_utc(value: datetime) -> datetime:
    """Store every timestamp in UTC; a naive value is treated as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def get_appointment_or_404(db: Session, appointment_id: int) -> Appointment:
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment


def ensure_slot_free(
    db: Session, doctor_id: int, start: datetime, duration_min: int, exclude_id: int | None = None
) -> None:
    """Reject a booking that overlaps another active appointment of the same doctor."""
    end = start + timedelta(minutes=duration_min)
    query = select(Appointment).where(
        Appointment.doctor_id == doctor_id,
        Appointment.status != "CANCELLED",
        Appointment.scheduled_at < end,
        Appointment.scheduled_at > start - MAX_DURATION,
    )
    if exclude_id is not None:
        query = query.where(Appointment.id != exclude_id)
    for other in db.scalars(query):
        other_start = to_utc(other.scheduled_at)
        other_end = other_start + timedelta(minutes=other.duration_min)
        if other_start < end and start < other_end:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Doctor already has appointment #{other.id} at {other_start.isoformat()}",
            )


@router.get("", response_model=list[AppointmentOut])
def list_appointments(
    doctor_id: int | None = None,
    patient_id: int | None = None,
    status_filter: AppointmentStatus | None = Query(default=None, alias="status"),
    on_date: date | None = None,
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
        day_start = datetime.combine(on_date, time.min, tzinfo=UTC)
        query = query.where(
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at < day_start + timedelta(days=1),
        )
    return list(db.scalars(query))


@router.get("/{appointment_id}", response_model=AppointmentOut)
def get_appointment(appointment_id: int, db: Session = Depends(get_db)):
    return get_appointment_or_404(db, appointment_id)


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(payload: AppointmentCreate, db: Session = Depends(get_db)):
    doctor = get_doctor_or_404(db, payload.doctor_id)
    if not doctor.active:
        raise HTTPException(status_code=400, detail="Doctor is not taking appointments")
    get_patient_or_404(db, payload.patient_id)

    start = to_utc(payload.scheduled_at)
    ensure_slot_free(db, payload.doctor_id, start, payload.duration_min)

    appointment = Appointment(**payload.model_dump(exclude={"scheduled_at"}), scheduled_at=start)
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@router.put("/{appointment_id}", response_model=AppointmentOut)
def update_appointment(appointment_id: int, payload: AppointmentUpdate, db: Session = Depends(get_db)):
    appointment = get_appointment_or_404(db, appointment_id)
    changes = payload.model_dump(exclude_unset=True)

    if "doctor_id" in changes:
        get_doctor_or_404(db, changes["doctor_id"])
    if "patient_id" in changes:
        get_patient_or_404(db, changes["patient_id"])
    if "scheduled_at" in changes:
        changes["scheduled_at"] = to_utc(changes["scheduled_at"])

    # Re-check the slot whenever the time window or doctor moves.
    if {"doctor_id", "scheduled_at", "duration_min"} & changes.keys():
        ensure_slot_free(
            db,
            changes.get("doctor_id", appointment.doctor_id),
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
    if appointment.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(status_code=409, detail=f"Appointment is already {appointment.status}")
    appointment.status = payload.status
    db.commit()
    db.refresh(appointment)
    return appointment


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(appointment_id: int, db: Session = Depends(get_db)):
    appointment = get_appointment_or_404(db, appointment_id)
    db.delete(appointment)
    db.commit()
