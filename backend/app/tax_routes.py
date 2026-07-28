from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from .models import db, User, IncomeSource, TaxProfile, AdvanceTaxPayment, SessionInvalid
from .agents import _build_tax_computation_executor

tax_bp = Blueprint('tax', __name__, url_prefix='/api/tax')


def current_user():
    uid = get_jwt_identity()
    user = User.query.get(int(uid)) if uid else None
    if user is None:
        raise SessionInvalid()
    return user


@tax_bp.get('/compute')
@jwt_required()
def compute_tax():
    """Deterministic tax comparison — no LLM call, instant numbers for the UI.
    The /api/agents/auditor endpoint calls this same computation internally and
    adds a narrative on top."""
    user = current_user()
    executor = _build_tax_computation_executor(user.id)
    return jsonify(executor({}))


@tax_bp.get('/state')
@jwt_required()
def get_tax_state():
    user = current_user()
    sources = IncomeSource.query.filter_by(user_id=user.id).all()
    profile = TaxProfile.query.filter_by(user_id=user.id).first()
    payments = AdvanceTaxPayment.query.filter_by(user_id=user.id).order_by(AdvanceTaxPayment.paid_on).all()

    if not profile:
        profile = TaxProfile(user_id=user.id, regime='new')
        db.session.add(profile)
        db.session.commit()

    return jsonify({
        'incomeSources': [s.to_dict() for s in sources],
        'profile': profile.to_dict(),
        'advancePayments': [p.to_dict() for p in payments],
    })


@tax_bp.post('/income-sources')
@jwt_required()
def add_income_source():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    try:
        annual = float(payload.get('annualAmount', 0))
        tds = float(payload.get('tdsDeducted', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'annualAmount and tdsDeducted must be numbers'}), 400

    src = IncomeSource(
        user_id=user.id,
        name=name,
        category=payload.get('category') or 'Salary',
        annual_amount=annual,
        tds_deducted=tds,
    )
    db.session.add(src)
    db.session.commit()
    return jsonify(src.to_dict()), 201


@tax_bp.put('/income-sources/<int:source_id>')
@jwt_required()
def update_income_source(source_id):
    user = current_user()
    src = IncomeSource.query.filter_by(id=source_id, user_id=user.id).first()
    if not src:
        return jsonify({'error': 'Income source not found'}), 404
    payload = request.get_json(silent=True) or {}
    if 'name' in payload:
        src.name = payload['name']
    if 'category' in payload:
        src.category = payload['category']
    for field, attr in (('annualAmount', 'annual_amount'), ('tdsDeducted', 'tds_deducted')):
        if field in payload:
            try:
                setattr(src, attr, float(payload[field]))
            except (TypeError, ValueError):
                return jsonify({'error': f'{field} must be a number'}), 400
    db.session.commit()
    return jsonify(src.to_dict())


@tax_bp.delete('/income-sources/<int:source_id>')
@jwt_required()
def delete_income_source(source_id):
    user = current_user()
    src = IncomeSource.query.filter_by(id=source_id, user_id=user.id).first()
    if not src:
        return jsonify({'error': 'Income source not found'}), 404
    db.session.delete(src)
    db.session.commit()
    return jsonify({'ok': True})


@tax_bp.put('/profile')
@jwt_required()
def update_tax_profile():
    user = current_user()
    profile = TaxProfile.query.filter_by(user_id=user.id).first()
    if not profile:
        profile = TaxProfile(user_id=user.id)
        db.session.add(profile)

    payload = request.get_json(silent=True) or {}
    if 'regime' in payload and payload['regime'] in ('old', 'new'):
        profile.regime = payload['regime']
    if 'basicSalary' in payload:
        try:
            profile.basic_salary = float(payload['basicSalary'])
        except (TypeError, ValueError):
            return jsonify({'error': 'basicSalary must be a number'}), 400

    deductions = payload.get('deductions') or {}
    field_map = {
        'section80C': 'section_80c',
        'section80D': 'section_80d',
        'hraExemption': 'hra_exemption',
        'homeLoanInterest': 'home_loan_interest',
        'nps80CCD1B': 'nps_80ccd1b',
        'npsEmployer': 'employer_nps',
        'npsEmployerPct': 'employer_nps_pct',
    }
    for field, attr in field_map.items():
        if field in deductions:
            try:
                setattr(profile, attr, float(deductions[field]))
            except (TypeError, ValueError):
                return jsonify({'error': f'{field} must be a number'}), 400

    db.session.commit()
    return jsonify(profile.to_dict())


@tax_bp.post('/advance-payments')
@jwt_required()
def add_advance_payment():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    quarter = (payload.get('quarter') or '').strip()
    if not quarter:
        return jsonify({'error': 'quarter is required'}), 400
    try:
        amount = float(payload.get('amount', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'amount must be a number'}), 400

    payment = AdvanceTaxPayment(user_id=user.id, quarter=quarter, amount=amount)
    db.session.add(payment)
    db.session.commit()
    return jsonify(payment.to_dict()), 201


@tax_bp.delete('/advance-payments/<int:payment_id>')
@jwt_required()
def delete_advance_payment(payment_id):
    user = current_user()
    payment = AdvanceTaxPayment.query.filter_by(id=payment_id, user_id=user.id).first()
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    db.session.delete(payment)
    db.session.commit()
    return jsonify({'ok': True})
