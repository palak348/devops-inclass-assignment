"""Time helpers: everything is stored in UTC, but a "day" is the clinic's local day."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .config import settings

CLINIC_TZ = ZoneInfo(settings.clinic_timezone)


def now_utc() -> datetime:
    return datetime.now(UTC)


def to_utc(value: datetime) -> datetime:
    """Normalise to UTC; a naive value is treated as UTC (SQLite returns naive values)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def clinic_today() -> date:
    return now_utc().astimezone(CLINIC_TZ).date()


def clinic_day_bounds(day: date) -> tuple[datetime, datetime]:
    """[start, end) of a clinic-local calendar day, expressed in UTC."""
    start = datetime.combine(day, time.min, tzinfo=CLINIC_TZ)
    return start.astimezone(UTC), (start + timedelta(days=1)).astimezone(UTC)
