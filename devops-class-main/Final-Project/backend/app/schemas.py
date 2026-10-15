from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .clock import clinic_today

AppointmentStatus = Literal["SCHEDULED", "CHECKED_IN", "COMPLETED", "CANCELLED"]


class Input(BaseModel):
    """Base for request bodies: trims surrounding spaces (so "   " is not a valid name)
    and rejects unknown fields instead of silently ignoring them."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


# ---------- Doctors ----------
class DoctorBase(Input):
    name: str = Field(min_length=2, max_length=120)
    specialty: str = Field(min_length=2, max_length=80)
    room: str = Field(default="", max_length=20)
    active: bool = True


class DoctorCreate(DoctorBase):
    pass


class DoctorUpdate(Input):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    specialty: str | None = Field(default=None, min_length=2, max_length=80)
    room: str | None = Field(default=None, max_length=20)
    active: bool | None = None


class DoctorOut(DoctorBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# ---------- Patients ----------
# Mobile number: exactly 10 digits, nothing else (no spaces, dashes or +91).
PHONE_PATTERN = r"^[0-9]{10}$"


def _not_in_future(value: date | None) -> date | None:
    if value is not None and value > clinic_today():
        raise ValueError("date of birth cannot be in the future")
    return value


class PatientBase(Input):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=PHONE_PATTERN, examples=["9876543210"])
    email: EmailStr | None = None
    date_of_birth: date | None = None


class PatientCreate(PatientBase):
    _dob = field_validator("date_of_birth")(_not_in_future)


class PatientUpdate(Input):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, pattern=PHONE_PATTERN)
    email: EmailStr | None = None
    date_of_birth: date | None = None

    _dob = field_validator("date_of_birth")(_not_in_future)


class PatientOut(PatientBase):
    id: int
    # Output is not re-validated against PHONE_PATTERN, so rows saved before the
    # 10-digit rule still load instead of breaking the patient list.
    phone: str
    model_config = ConfigDict(from_attributes=True)


# ---------- Appointments ----------
class AppointmentBase(Input):
    doctor_id: int
    patient_id: int
    scheduled_at: datetime
    duration_min: int = Field(default=15, ge=5, le=240)
    reason: str = Field(default="", max_length=500)


class AppointmentCreate(AppointmentBase):
    pass


class AppointmentUpdate(Input):
    """Reschedule / edit details. Status changes go through PATCH .../status only,
    so the check-in -> complete workflow cannot be bypassed."""

    doctor_id: int | None = None
    patient_id: int | None = None
    scheduled_at: datetime | None = None
    duration_min: int | None = Field(default=None, ge=5, le=240)
    reason: str | None = Field(default=None, max_length=500)


class StatusChange(BaseModel):
    status: AppointmentStatus


class AppointmentOut(AppointmentBase):
    id: int
    status: AppointmentStatus
    created_at: datetime
    doctor_name: str
    patient_name: str
    model_config = ConfigDict(from_attributes=True)


# ---------- Stats ----------
class StatsOut(BaseModel):
    doctors: int
    active_doctors: int
    patients: int
    appointments_total: int
    appointments_today: int
    appointments_upcoming: int
    by_status: dict[str, int]
    busiest_doctor: str | None
