from .models import db, TaxProfile


def seed_new_user(user):
    """New accounts start completely blank — no demo data. Just set sane
    zero defaults so derived calculations (which divide by budget/income)
    don't error on a fresh account."""
    user.name = user.name or 'there'
    user.monthly_income = 0
    user.monthly_budget = 0
    user.sip_monthly = 0

    db.session.add(TaxProfile(user_id=user.id, regime='new'))
    db.session.commit()
