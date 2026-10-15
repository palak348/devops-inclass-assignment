from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

AppointmentStatus = Literal["SCHEDULED", "CHECKED_IN", "COMPLETED", "CANCELLED"]


# ---------- Doctors ----------
class DoctorBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    specialty: str = Field(min_length=2, max_length=80)
    room: str = Field(default="", max_length=20)
    active: bool = True


class DoctorCreate(DoctorBase):
    pass


class DoctorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    specialty: str | None = Field(default=None, min_length=2, max_length=80)
    room: str | None = Field(default=None, max_length=20)
    active: bool | None = None


class DoctorOut(DoctorBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# ---------- Patients ----------
class PatientBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=r"^\+?[0-9 \-]{7,20}$")
    email: EmailStr | None = None
    date_of_birth: date | None = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9 \-]{7,20}$")
    email: EmailStr | None = None
    date_of_birth: date | None = None


class PatientOut(PatientBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# ---------- Appointments ----------
class AppointmentBase(BaseModel):
    doctor_id: int
    patient_id: int
    scheduled_at: datetime
    duration_min: int = Field(default=15, ge=5, le=240)
    reason: str = Field(default="", max_length=500)


class AppointmentCreate(AppointmentBase):
    pass


class AppointmentUpdate(BaseModel):
    doctor_id: int | None = None
    patient_id: int | None = None
    scheduled_at: datetime | None = None
    duration_min: int | None = Field(default=None, ge=5, le=240)
    reason: str | None = Field(default=None, max_length=500)
    status: AppointmentStatus | None = None


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
    patients: int
    appointments_total: int
    appointments_today: int
    by_status: dict[str, int]
    busiest_doctor: str | None
