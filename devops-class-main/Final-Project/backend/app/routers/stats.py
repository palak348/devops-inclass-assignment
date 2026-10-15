from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..clock import clinic_day_bounds, clinic_today, now_utc
from ..db import get_db
from ..models import Appointment, Doctor, Patient
from ..schemas import StatsOut

router = APIRouter(prefix="/api/stats", tags=["stats"])

STATUSES = ("SCHEDULED", "CHECKED_IN", "COMPLETED", "CANCELLED")


@router.get("", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    by_status = dict.fromkeys(STATUSES, 0)
    for status, count in db.execute(
        select(Appointment.status, func.count(Appointment.id)).group_by(Appointment.status)
    ):
        by_status[status] = count

    # "Today" is the clinic's local day, not the UTC day.
    day_start, day_end = clinic_day_bounds(clinic_today())
    today = db.scalar(
        select(func.count(Appointment.id)).where(
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at < day_end,
            Appointment.status != "CANCELLED",
        )
    )
    upcoming = db.scalar(
        select(func.count(Appointment.id)).where(
            Appointment.scheduled_at >= now_utc(),
            Appointment.status == "SCHEDULED",
        )
    )

    busiest = db.execute(
        select(Doctor.name, func.count(Appointment.id).label("n"))
        .join(Appointment, Appointment.doctor_id == Doctor.id)
        .where(Appointment.status != "CANCELLED")
        .group_by(Doctor.id, Doctor.name)
        .order_by(func.count(Appointment.id).desc(), Doctor.name)
        .limit(1)
    ).first()

    return StatsOut(
        doctors=db.scalar(select(func.count(Doctor.id))) or 0,
        active_doctors=db.scalar(select(func.count(Doctor.id)).where(Doctor.active.is_(True))) or 0,
        patients=db.scalar(select(func.count(Patient.id))) or 0,
        appointments_total=sum(by_status.values()),
        appointments_today=today or 0,
        appointments_upcoming=upcoming or 0,
        by_status=by_status,
        busiest_doctor=busiest.name if busiest else None,
    )
