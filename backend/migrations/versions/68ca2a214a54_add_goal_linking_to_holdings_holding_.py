"""add goal linking to holdings, holding linking and paid tracking to sip plans

Revision ID: 68ca2a214a54
Revises: 400998e5fb0c
Create Date: 2026-07-31 03:39:55.070925

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '68ca2a214a54'
down_revision = '400998e5fb0c'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('investment_holdings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('goal_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_investment_holdings_goal_id', 'goals', ['goal_id'], ['id'])

    with op.batch_alter_table('sip_plans', schema=None) as batch_op:
        batch_op.add_column(sa.Column('linked_holding_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('last_paid_month', sa.String(length=7), nullable=True))
        batch_op.create_foreign_key('fk_sip_plans_linked_holding_id', 'investment_holdings', ['linked_holding_id'], ['id'])


def downgrade():
    with op.batch_alter_table('sip_plans', schema=None) as batch_op:
        batch_op.drop_constraint('fk_sip_plans_linked_holding_id', type_='foreignkey')
        batch_op.drop_column('last_paid_month')
        batch_op.drop_column('linked_holding_id')

    with op.batch_alter_table('investment_holdings', schema=None) as batch_op:
        batch_op.drop_constraint('fk_investment_holdings_goal_id', type_='foreignkey')
        batch_op.drop_column('goal_id')
