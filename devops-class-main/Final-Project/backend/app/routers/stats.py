from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

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

    day_start = datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)
    today = db.scalar(
        select(func.count(Appointment.id)).where(
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at < day_start + timedelta(days=1),
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
        patients=db.scalar(select(func.count(Patient.id))) or 0,
        appointments_total=sum(by_status.values()),
        appointments_today=today or 0,
        by_status=by_status,
        busiest_doctor=busiest.name if busiest else None,
    )
