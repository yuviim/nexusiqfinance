from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.exceptions import HTTPException
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class SessionInvalid(HTTPException):
    """Raised when a JWT is well-formed but doesn't match any real user —
    e.g. the database was reset/recreated after the token was issued.
    Returns a clean 401 instead of an unhandled crash."""
    code = 401
    description = 'Your session is no longer valid — please log in again.'


def now_utc():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), default='')
    monthly_income = db.Column(db.Float, default=0)
    monthly_budget = db.Column(db.Float, default=0)
    sip_monthly = db.Column(db.Float, default=0)
    risk_profile = db.Column(db.String(20), default='moderate')  # conservative | moderate | aggressive
    salary_day = db.Column(db.Integer, default=1)  # day of month the pay cycle starts (1 = calendar month)
    created_at = db.Column(db.DateTime, default=now_utc)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_profile_dict(self):
        return {
            'name': self.name,
            'monthlyIncome': self.monthly_income,
            'monthlyBudget': self.monthly_budget,
            'riskProfile': self.risk_profile or 'moderate',
            'salaryDay': self.salary_day or 1,
        }


class Asset(db.Model):
    __tablename__ = 'assets'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    kind = db.Column(db.String(20), nullable=False)  # 'asset' or 'liability'
    category = db.Column(db.String(80), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    value = db.Column(db.Float, nullable=False, default=0)
    interest_rate = db.Column(db.Float, default=0)  # annual %, meaningful for liabilities (loans)

    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'name': self.name,
            'value': self.value,
            'interestRate': self.interest_rate or 0,
        }


class RecurringExpense(db.Model):
    __tablename__ = 'recurring_expenses'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(40), default='Bill')  # 'Loan EMI', 'Insurance', 'Subscription', 'Utility', 'Other'
    amount = db.Column(db.Float, nullable=False, default=0)
    note = db.Column(db.String(255), default='')
    interest_rate = db.Column(db.Float, default=0)  # annual %, meaningful for 'Loan EMI' only
    outstanding_balance = db.Column(db.Float, default=0)  # meaningful for 'Loan EMI' only

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'amount': self.amount,
            'note': self.note,
            'interestRate': self.interest_rate or 0,
            'outstandingBalance': self.outstanding_balance or 0,
        }


def apply_loan_payment(user_id, category, note, amount):
    """If a logged transaction matches a Loan EMI recurring bill by name, reduce
    that bill's outstanding balance by the actual principal portion of the
    payment (payment minus that month's accrued interest) — so paying more
    than the scheduled EMI (e.g. via ECS) correctly shows up as extra progress
    against the loan, not just as "spent this month" with no lasting effect.
    Only applied when a transaction is first created — editing or deleting a
    transaction does not currently reverse this adjustment."""
    if category != 'Loan EMI' or not note:
        return
    bill = RecurringExpense.query.filter_by(user_id=user_id, category='Loan EMI').filter(
        db.func.lower(RecurringExpense.name) == note.strip().lower()
    ).first()
    if not bill or not bill.outstanding_balance:
        return
    monthly_interest = bill.outstanding_balance * (bill.interest_rate or 0) / 100 / 12
    principal_paid = max(0, amount - monthly_interest)
    bill.outstanding_balance = max(0, bill.outstanding_balance - principal_paid)


class Transaction(db.Model):
    __tablename__ = 'transactions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    type = db.Column(db.String(10), nullable=False)  # 'expense' or 'income'
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(80), nullable=False)
    note = db.Column(db.String(255), default='')
    bank_name = db.Column(db.String(40), default='')
    date = db.Column(db.DateTime, default=now_utc)  # user-editable — the date the expense actually happened

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'amount': self.amount,
            'category': self.category,
            'note': self.note,
            'bankName': self.bank_name or '',
            'date': self.date.isoformat(),
        }


BANK_NAMES = ['HDFC', 'IDFC', 'SBI', 'KOTAK', 'Other']


class BankAccount(db.Model):
    __tablename__ = 'bank_accounts'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    bank_name = db.Column(db.String(40), nullable=False)
    balance = db.Column(db.Float, nullable=False, default=0)

    __table_args__ = (db.UniqueConstraint('user_id', 'bank_name', name='uq_user_bank'),)

    def to_dict(self):
        return {'id': self.id, 'bankName': self.bank_name, 'balance': self.balance}


class Budget(db.Model):
    __tablename__ = 'budgets'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    category = db.Column(db.String(80), nullable=False)
    limit = db.Column(db.Float, nullable=False, default=0)

    def to_dict(self):
        return {'id': self.id, 'category': self.category, 'limit': self.limit}


class Goal(db.Model):
    __tablename__ = 'goals'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    target = db.Column(db.Float, nullable=False, default=0)
    current = db.Column(db.Float, nullable=False, default=0)
    color = db.Column(db.String(20), default='teal')
    target_date = db.Column(db.Date, nullable=True)  # optional — enables on-track/behind pace tracking

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'target': self.target,
            'current': self.current,
            'color': self.color,
            'targetDate': self.target_date.isoformat() if self.target_date else None,
        }


class InvestmentHolding(db.Model):
    __tablename__ = 'investment_holdings'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    category = db.Column(db.String(80), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    value = db.Column(db.Float, nullable=False, default=0)
    goal_id = db.Column(db.Integer, db.ForeignKey('goals.id'), nullable=True)  # optional — which goal this holding counts toward

    def to_dict(self):
        return {'id': self.id, 'category': self.category, 'name': self.name, 'value': self.value, 'goalId': self.goal_id}


class SipPlan(db.Model):
    __tablename__ = 'sip_plans'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    amount = db.Column(db.Float, nullable=False, default=0)
    goal_id = db.Column(db.Integer, db.ForeignKey('goals.id'), nullable=True)
    linked_holding_id = db.Column(db.Integer, db.ForeignKey('investment_holdings.id'), nullable=True)
    last_paid_month = db.Column(db.String(7), nullable=True)  # 'YYYY-MM' — last month this SIP was marked paid

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'amount': self.amount,
            'goalId': self.goal_id, 'linkedHoldingId': self.linked_holding_id,
            'lastPaidMonth': self.last_paid_month,
        }


class RecurringDeposit(db.Model):
    __tablename__ = 'recurring_deposits'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    bank_name = db.Column(db.String(40), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    amount = db.Column(db.Float, nullable=False, default=0)

    def to_dict(self):
        return {'id': self.id, 'bankName': self.bank_name, 'name': self.name, 'amount': self.amount}


class SipLog(db.Model):
    __tablename__ = 'sip_log'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    month_key = db.Column(db.String(10), nullable=False)  # 'YYYY-M'
    paid = db.Column(db.Boolean, default=False)

    __table_args__ = (db.UniqueConstraint('user_id', 'month_key', name='uq_user_month'),)


class IncomeSource(db.Model):
    __tablename__ = 'income_sources'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(40), default='Salary')  # Salary, Interest, Other
    annual_amount = db.Column(db.Float, nullable=False, default=0)
    tds_deducted = db.Column(db.Float, nullable=False, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'annualAmount': self.annual_amount,
            'tdsDeducted': self.tds_deducted,
        }


class TaxProfile(db.Model):
    __tablename__ = 'tax_profile'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True, index=True)
    regime = db.Column(db.String(10), default='new')  # 'old' or 'new'
    basic_salary = db.Column(db.Float, default=0)
    section_80c = db.Column(db.Float, default=0)
    section_80d = db.Column(db.Float, default=0)
    hra_exemption = db.Column(db.Float, default=0)
    home_loan_interest = db.Column(db.Float, default=0)
    nps_80ccd1b = db.Column(db.Float, default=0)
    employer_nps = db.Column(db.Float, default=0)
    employer_nps_pct = db.Column(db.Float, default=0.10)

    def to_dict(self):
        return {
            'regime': self.regime,
            'basicSalary': self.basic_salary,
            'deductions': {
                'section80C': self.section_80c,
                'section80D': self.section_80d,
                'hraExemption': self.hra_exemption,
                'homeLoanInterest': self.home_loan_interest,
                'nps80CCD1B': self.nps_80ccd1b,
                'npsEmployer': self.employer_nps,
                'npsEmployerPct': self.employer_nps_pct,
            },
        }


class AdvanceTaxPayment(db.Model):
    __tablename__ = 'advance_tax_payments'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    quarter = db.Column(db.String(20), nullable=False)  # e.g. 'Q1 FY2026-27'
    amount = db.Column(db.Float, nullable=False, default=0)
    paid_on = db.Column(db.DateTime, default=now_utc)

    def to_dict(self):
        return {
            'id': self.id,
            'quarter': self.quarter,
            'amount': self.amount,
            'paidOn': self.paid_on.isoformat(),
        }
