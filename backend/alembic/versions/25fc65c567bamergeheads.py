"""merge_heads

Revision ID: 25fc65c567ba
Revises: e6c1b4d2a9f3, f9b8c7d6e5a4
Create Date: 2026-08-21 18:09:46.016247

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '25fc65c567ba'
down_revision: Union[str, None] = ('e6c1b4d2a9f3', 'f9b8c7d6e5a4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
