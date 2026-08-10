"""add_satellite_telemetry_table

Revision ID: f9b8c7d6e5a4
Revises: fc7f37f92b40
Create Date: 2026-08-10 00:00:00.000000

"""

from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "f9b8c7d6e5a4"
down_revision: Union[str, None] = "fc7f37f92b40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "satellite_telemetry",
        sa.Column("id", sa.CHAR(36), primary_key=True, nullable=False),
        sa.Column("satellite_id", sa.String(64), nullable=False, index=True),
        sa.Column("timestamp", sa.DateTime(timezone=False), nullable=False, index=True),
        sa.Column("metric_key", sa.String(128), nullable=False, index=True),
        sa.Column("numeric_value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(32), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
    )
    op.create_index("idx_telemetry_sat_time", "satellite_telemetry", ["satellite_id", "timestamp"])
    op.create_index("idx_telemetry_sat_metric_time", "satellite_telemetry", ["satellite_id", "metric_key", "timestamp"])


def downgrade() -> None:
    op.drop_index("idx_telemetry_sat_metric_time", table_name="satellite_telemetry")
    op.drop_index("idx_telemetry_sat_time", table_name="satellite_telemetry")
    op.drop_table("satellite_telemetry")
