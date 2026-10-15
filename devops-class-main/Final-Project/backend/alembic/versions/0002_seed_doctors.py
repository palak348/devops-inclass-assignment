"""seed the clinic's starting doctor roster

Revision ID: 0002_seed_doctors
Revises: 0001_initial_schema
Create Date: 2026-10-15
"""

import sqlalchemy as sa

from alembic import op

revision = "0002_seed_doctors"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None

SEED_DOCTORS = [
    {"name": "Dr. Ananya Rao", "specialty": "General Medicine", "room": "101", "active": True},
    {"name": "Dr. Vikram Mehta", "specialty": "Cardiology", "room": "204", "active": True},
    {"name": "Dr. Sara Khan", "specialty": "Pediatrics", "room": "110", "active": True},
    {"name": "Dr. Rohan Iyer", "specialty": "Dermatology", "room": "305", "active": True},
]

doctors = sa.table(
    "doctors",
    sa.column("name", sa.String),
    sa.column("specialty", sa.String),
    sa.column("room", sa.String),
    sa.column("active", sa.Boolean),
)


def upgrade() -> None:
    op.bulk_insert(doctors, SEED_DOCTORS)


def downgrade() -> None:
    names = [d["name"] for d in SEED_DOCTORS]
    op.execute(doctors.delete().where(doctors.c.name.in_(names)))
