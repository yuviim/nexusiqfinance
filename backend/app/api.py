from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from .models import db, User, Asset, Transaction, Budget, Goal, InvestmentHolding, SipLog, IncomeSource, TaxProfile, AdvanceTaxPayment, RecurringExpense, BankAccount, BANK_NAMES, SessionInvalid

api_bp = Blueprint('api', __name__, url_prefix='/api')


def current_user():
    uid = get_jwt_identity()
    user = User.query.get(int(uid)) if uid else None
    if user is None:
        raise SessionInvalid()
    return user


def month_key(dt=None):
    dt = dt or datetime.now(timezone.utc)
    return f'{dt.year}-{dt.month}'


@api_bp.get('/state')
@jwt_required()
def get_state():
    user = current_user()
    assets = Asset.query.filter_by(user_id=user.id, kind='asset').all()
    liabilities = Asset.query.filter_by(user_id=user.id, kind='liability').all()
    transactions = Transaction.query.filter_by(user_id=user.id).order_by(Transaction.date.desc()).all()
    budgets = Budget.query.filter_by(user_id=user.id).all()
    goals = Goal.query.filter_by(user_id=user.id).all()
    holdings = InvestmentHolding.query.filter_by(user_id=user.id).all()
    sip_logs = SipLog.query.filter_by(user_id=user.id).all()
    recurring = RecurringExpense.query.filter_by(user_id=user.id).all()
    bank_accounts = BankAccount.query.filter_by(user_id=user.id).all()

    return jsonify({
        'profile': {**user.to_profile_dict()},
        'assets': [a.to_dict() for a in assets],
        'liabilities': [l.to_dict() for l in liabilities],
        'transactions': [t.to_dict() for t in transactions],
        'budgets': [b.to_dict() for b in budgets],
        'goals': [g.to_dict() for g in goals],
        'investments': {
            'sipMonthly': user.sip_monthly,
            'holdings': [h.to_dict() for h in holdings],
        },
        'sipLog': {s.month_key: s.paid for s in sip_logs},
        'recurringExpenses': [r.to_dict() for r in recurring],
        'bankAccounts': [b.to_dict() for b in bank_accounts],
    })


# ---- Transactions ----

@api_bp.post('/transactions')
@jwt_required()
def add_transaction():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    ttype = payload.get('type')
    amount = payload.get('amount')
    category = payload.get('category')

    if ttype not in ('expense', 'income'):
        return jsonify({'error': 'type must be expense or income'}), 400
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({'error': 'amount must be a number'}), 400
    if amount <= 0:
        return jsonify({'error': 'amount must be positive'}), 400
    if not category:
        return jsonify({'error': 'category is required'}), 400

    tx_date = None
    date_str = payload.get('date')
    if date_str:
        try:
            tx_date = datetime.fromisoformat(date_str)
        except ValueError:
            return jsonify({'error': 'date must be an ISO date/datetime string'}), 400

    tx = Transaction(
        user_id=user.id,
        type=ttype,
        amount=amount,
        category=category,
        note=payload.get('note') or '',
        bank_name=payload.get('bankName') or '',
        **({'date': tx_date} if tx_date else {}),
    )
    db.session.add(tx)
    db.session.commit()
    return jsonify(tx.to_dict()), 201


@api_bp.delete('/transactions/<int:tx_id>')
@jwt_required()
def delete_transaction(tx_id):
    user = current_user()
    tx = Transaction.query.filter_by(id=tx_id, user_id=user.id).first()
    if not tx:
        return jsonify({'error': 'Transaction not found'}), 404
    db.session.delete(tx)
    db.session.commit()
    return jsonify({'ok': True})


# ---- Budgets ----

@api_bp.post('/budgets')
@jwt_required()
def add_budget():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    category = (payload.get('category') or '').strip()
    if not category:
        return jsonify({'error': 'category is required'}), 400
    try:
        limit = float(payload.get('limit', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'limit must be a number'}), 400

    budget = Budget(user_id=user.id, category=category, limit=limit)
    db.session.add(budget)
    db.session.commit()
    return jsonify(budget.to_dict()), 201


@api_bp.put('/budgets/<int:budget_id>')
@jwt_required()
def update_budget(budget_id):
    user = current_user()
    budget = Budget.query.filter_by(id=budget_id, user_id=user.id).first()
    if not budget:
        return jsonify({'error': 'Budget not found'}), 404
    payload = request.get_json(silent=True) or {}
    if 'limit' in payload:
        try:
            budget.limit = float(payload['limit'])
        except (TypeError, ValueError):
            return jsonify({'error': 'limit must be a number'}), 400
    if 'category' in payload:
        budget.category = payload['category']
    db.session.commit()
    return jsonify(budget.to_dict())


@api_bp.delete('/budgets/<int:budget_id>')
@jwt_required()
def delete_budget(budget_id):
    user = current_user()
    budget = Budget.query.filter_by(id=budget_id, user_id=user.id).first()
    if not budget:
        return jsonify({'error': 'Budget not found'}), 404
    db.session.delete(budget)
    db.session.commit()
    return jsonify({'ok': True})


# ---- Goals ----

@api_bp.post('/goals')
@jwt_required()
def add_goal():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()
    try:
        target = float(payload.get('target'))
    except (TypeError, ValueError):
        return jsonify({'error': 'target must be a number'}), 400
    if not name or target <= 0:
        return jsonify({'error': 'name and a positive target are required'}), 400

    goal = Goal(
        user_id=user.id,
        name=name,
        target=target,
        current=float(payload.get('current') or 0),
        color=payload.get('color') or 'teal',
    )
    db.session.add(goal)
    db.session.commit()
    return jsonify(goal.to_dict()), 201


@api_bp.put('/goals/<int:goal_id>')
@jwt_required()
def update_goal(goal_id):
    user = current_user()
    goal = Goal.query.filter_by(id=goal_id, user_id=user.id).first()
    if not goal:
        return jsonify({'error': 'Goal not found'}), 404
    payload = request.get_json(silent=True) or {}
    for field in ('name', 'color'):
        if field in payload:
            setattr(goal, field, payload[field])
    for field in ('target', 'current'):
        if field in payload:
            try:
                setattr(goal, field, float(payload[field]))
            except (TypeError, ValueError):
                return jsonify({'error': f'{field} must be a number'}), 400
    db.session.commit()
    return jsonify(goal.to_dict())


# ---- Assets / Liabilities ----

@api_bp.post('/assets')
@jwt_required()
def add_asset():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    kind = payload.get('kind')
    name = (payload.get('name') or '').strip()
    if kind not in ('asset', 'liability'):
        return jsonify({'error': 'kind must be asset or liability'}), 400
    if not name:
        return jsonify({'error': 'name is required'}), 400
    try:
        value = float(payload.get('value', 0))
        interest_rate = float(payload.get('interestRate', 0) or 0)
    except (TypeError, ValueError):
        return jsonify({'error': 'value and interestRate must be numbers'}), 400

    item = Asset(user_id=user.id, kind=kind, category=payload.get('category') or 'Other', name=name, value=value, interest_rate=interest_rate)
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@api_bp.put('/assets/<int:asset_id>')
@jwt_required()
def update_asset(asset_id):
    user = current_user()
    item = Asset.query.filter_by(id=asset_id, user_id=user.id).first()
    if not item:
        return jsonify({'error': 'Not found'}), 404
    payload = request.get_json(silent=True) or {}
    if 'name' in payload:
        item.name = payload['name']
    if 'category' in payload:
        item.category = payload['category']
    if 'value' in payload:
        try:
            item.value = float(payload['value'])
        except (TypeError, ValueError):
            return jsonify({'error': 'value must be a number'}), 400
    if 'interestRate' in payload:
        try:
            item.interest_rate = float(payload['interestRate'] or 0)
        except (TypeError, ValueError):
            return jsonify({'error': 'interestRate must be a number'}), 400
    db.session.commit()
    return jsonify(item.to_dict())


@api_bp.delete('/assets/<int:asset_id>')
@jwt_required()
def delete_asset(asset_id):
    user = current_user()
    item = Asset.query.filter_by(id=asset_id, user_id=user.id).first()
    if not item:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({'ok': True})


# ---- Investment holdings ----

@api_bp.post('/holdings')
@jwt_required()
def add_holding():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    try:
        value = float(payload.get('value', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'value must be a number'}), 400

    holding = InvestmentHolding(user_id=user.id, category=payload.get('category') or 'Other', name=name, value=value)
    db.session.add(holding)
    db.session.commit()
    return jsonify(holding.to_dict()), 201


@api_bp.put('/holdings/<int:holding_id>')
@jwt_required()
def update_holding(holding_id):
    user = current_user()
    holding = InvestmentHolding.query.filter_by(id=holding_id, user_id=user.id).first()
    if not holding:
        return jsonify({'error': 'Not found'}), 404
    payload = request.get_json(silent=True) or {}
    if 'name' in payload:
        holding.name = payload['name']
    if 'category' in payload:
        holding.category = payload['category']
    if 'value' in payload:
        try:
            holding.value = float(payload['value'])
        except (TypeError, ValueError):
            return jsonify({'error': 'value must be a number'}), 400
    db.session.commit()
    return jsonify(holding.to_dict())


@api_bp.delete('/holdings/<int:holding_id>')
@jwt_required()
def delete_holding(holding_id):
    user = current_user()
    holding = InvestmentHolding.query.filter_by(id=holding_id, user_id=user.id).first()
    if not holding:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(holding)
    db.session.commit()
    return jsonify({'ok': True})


# ---- Bank accounts ----

@api_bp.get('/bank-accounts')
@jwt_required()
def list_bank_accounts():
    user = current_user()
    accounts = BankAccount.query.filter_by(user_id=user.id).all()
    return jsonify([a.to_dict() for a in accounts])


@api_bp.post('/bank-accounts')
@jwt_required()
def upsert_bank_account():
    """Create or update the balance for a given bank name (one row per bank
    per user — selecting a bank that already has a row just updates it)."""
    user = current_user()
    payload = request.get_json(silent=True) or {}
    bank_name = payload.get('bankName')
    if bank_name not in BANK_NAMES:
        return jsonify({'error': f'bankName must be one of {BANK_NAMES}'}), 400
    try:
        balance = float(payload.get('balance', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'balance must be a number'}), 400

    account = BankAccount.query.filter_by(user_id=user.id, bank_name=bank_name).first()
    if account:
        account.balance = balance
    else:
        account = BankAccount(user_id=user.id, bank_name=bank_name, balance=balance)
        db.session.add(account)
    db.session.commit()
    return jsonify(account.to_dict())


@api_bp.delete('/bank-accounts/<int:account_id>')
@jwt_required()
def delete_bank_account(account_id):
    user = current_user()
    account = BankAccount.query.filter_by(id=account_id, user_id=user.id).first()
    if not account:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(account)
    db.session.commit()
    return jsonify({'ok': True})


# ---- Recurring expenses ----

@api_bp.post('/recurring')
@jwt_required()
def add_recurring():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    try:
        amount = float(payload.get('amount', 0))
        interest_rate = float(payload.get('interestRate', 0) or 0)
        outstanding_balance = float(payload.get('outstandingBalance', 0) or 0)
    except (TypeError, ValueError):
        return jsonify({'error': 'amount, interestRate and outstandingBalance must be numbers'}), 400

    item = RecurringExpense(
        user_id=user.id,
        name=name,
        category=payload.get('category') or 'Bill',
        amount=amount,
        note=payload.get('note') or '',
        interest_rate=interest_rate,
        outstanding_balance=outstanding_balance,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@api_bp.put('/recurring/<int:item_id>')
@jwt_required()
def update_recurring(item_id):
    user = current_user()
    item = RecurringExpense.query.filter_by(id=item_id, user_id=user.id).first()
    if not item:
        return jsonify({'error': 'Not found'}), 404
    payload = request.get_json(silent=True) or {}
    if 'name' in payload:
        item.name = payload['name']
    if 'category' in payload:
        item.category = payload['category']
    if 'note' in payload:
        item.note = payload['note']
    for field, attr in (('amount', 'amount'), ('interestRate', 'interest_rate'), ('outstandingBalance', 'outstanding_balance')):
        if field in payload:
            try:
                setattr(item, attr, float(payload[field] or 0))
            except (TypeError, ValueError):
                return jsonify({'error': f'{field} must be a number'}), 400
    db.session.commit()
    return jsonify(item.to_dict())


@api_bp.delete('/recurring/<int:item_id>')
@jwt_required()
def delete_recurring(item_id):
    user = current_user()
    item = RecurringExpense.query.filter_by(id=item_id, user_id=user.id).first()
    if not item:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({'ok': True})


# ---- Reset ----

@api_bp.post('/reset-data')
@jwt_required()
def reset_data():
    """Wipe all financial data for this account back to a blank slate — keeps
    the login (email/password/name) but clears every seeded/demo number so the
    person can start entering their own."""
    user = current_user()

    Asset.query.filter_by(user_id=user.id).delete()
    InvestmentHolding.query.filter_by(user_id=user.id).delete()
    Transaction.query.filter_by(user_id=user.id).delete()
    Goal.query.filter_by(user_id=user.id).delete()
    Budget.query.filter_by(user_id=user.id).delete()
    SipLog.query.filter_by(user_id=user.id).delete()
    IncomeSource.query.filter_by(user_id=user.id).delete()
    AdvanceTaxPayment.query.filter_by(user_id=user.id).delete()
    RecurringExpense.query.filter_by(user_id=user.id).delete()
    BankAccount.query.filter_by(user_id=user.id).delete()
    profile = TaxProfile.query.filter_by(user_id=user.id).first()
    if profile:
        profile.regime = 'new'
        profile.basic_salary = 0
        profile.section_80c = 0
        profile.section_80d = 0
        profile.hra_exemption = 0
        profile.home_loan_interest = 0
        profile.nps_80ccd1b = 0
        profile.employer_nps = 0
        profile.employer_nps_pct = 0.10

    user.monthly_income = 0
    user.monthly_budget = 0
    user.sip_monthly = 0

    db.session.commit()
    return jsonify({'ok': True})

@api_bp.put('/profile')
@jwt_required()
def update_profile():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    if 'name' in payload:
        user.name = payload['name']
    for field, attr in (('monthlyIncome', 'monthly_income'), ('monthlyBudget', 'monthly_budget')):
        if field in payload:
            try:
                setattr(user, attr, float(payload[field]))
            except (TypeError, ValueError):
                return jsonify({'error': f'{field} must be a number'}), 400
    if 'riskProfile' in payload and payload['riskProfile'] in ('conservative', 'moderate', 'aggressive'):
        user.risk_profile = payload['riskProfile']
    if 'sipMonthly' in payload:
        try:
            user.sip_monthly = float(payload['sipMonthly'])
        except (TypeError, ValueError):
            return jsonify({'error': 'sipMonthly must be a number'}), 400
    if 'salaryDay' in payload:
        try:
            day = int(payload['salaryDay'])
        except (TypeError, ValueError):
            return jsonify({'error': 'salaryDay must be a number'}), 400
        if not (1 <= day <= 31):
            return jsonify({'error': 'salaryDay must be between 1 and 31'}), 400
        user.salary_day = day
    db.session.commit()
    return jsonify({**user.to_profile_dict(), 'sipMonthly': user.sip_monthly})


# ---- SIP ----

@api_bp.post('/sip')
@jwt_required()
def set_sip():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    key = payload.get('monthKey') or month_key()
    paid = bool(payload.get('paid'))

    entry = SipLog.query.filter_by(user_id=user.id, month_key=key).first()
    if entry:
        entry.paid = paid
    else:
        entry = SipLog(user_id=user.id, month_key=key, paid=paid)
        db.session.add(entry)
    db.session.commit()
    return jsonify({'monthKey': key, 'paid': paid})
