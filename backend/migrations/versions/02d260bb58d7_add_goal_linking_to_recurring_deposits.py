"""add goal linking to recurring deposits

Revision ID: 02d260bb58d7
Revises: 116cc35107cf
Create Date: 2026-08-02 15:33:51.634605

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '02d260bb58d7'
down_revision = '116cc35107cf'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('recurring_deposits', schema=None) as batch_op:
        batch_op.add_column(sa.Column('goal_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('last_deposited_month', sa.String(length=7), nullable=True))
        batch_op.create_foreign_key('fk_recurring_deposits_goal_id', 'goals', ['goal_id'], ['id'])


def downgrade():
    with op.batch_alter_table('recurring_deposits', schema=None) as batch_op:
        batch_op.drop_constraint('fk_recurring_deposits_goal_id', type_='foreignkey')
        batch_op.drop_column('last_deposited_month')
        batch_op.drop_column('goal_id')
