"""
Indian individual income tax calculator, FY 2026-27 (AY 2027-28).
Slabs unchanged from Budget 2025, retained in Budget 2026 (confirmed via web search
as of July 2026 — re-verify if running this in a later financial year).

Scope / assumptions (documented so the numbers aren't mistaken for full ITR-grade
precision — this covers the common salaried-individual case, not every edge case):
- Individual, non-senior-citizen resident taxpayer.
- Salary + "other" income (bank interest, etc.) taxed at slab rates. Capital gains
  (which have their own special rates under both regimes) are NOT modeled here —
  add them to a real ITR computation separately if you have any.
- Old regime deductions modeled: Section 80C, 80D, HRA exemption (entered directly,
  not derived from the full HRA formula), home loan interest (Sec 24b, capped at
  ₹2L for self-occupied), Section 80CCD(1B) additional NPS, Section 80CCD(2)
  employer NPS contribution.
- New regime: only 80CCD(2) employer NPS is deductible (up to 14% of basic salary,
  per the Budget 2024 increase from 10%), per current rules.
- Surcharge under the new regime is capped at 25% (marginal relief applies at each
  threshold); old regime is not capped (37% above ₹5Cr) — both modeled at a
  simplified level (marginal relief across all thresholds; exact income above
  ₹5Cr edge cases are rare enough not to be the focus here).
"""

CESS_RATE = 0.04


def _apply_slabs(taxable_income, slabs):
    """slabs: list of (upper_bound_or_None, rate) tuples, in ascending order."""
    tax = 0.0
    lower = 0
    for upper, rate in slabs:
        if taxable_income <= lower:
            break
        band_top = taxable_income if upper is None else min(taxable_income, upper)
        if band_top > lower:
            tax += (band_top - lower) * rate
        lower = upper if upper is not None else taxable_income
    return tax


NEW_REGIME_SLABS = [
    (400000, 0.0),
    (800000, 0.05),
    (1200000, 0.10),
    (1600000, 0.15),
    (2000000, 0.20),
    (2400000, 0.25),
    (None, 0.30),
]

OLD_REGIME_SLABS = [
    (250000, 0.0),
    (500000, 0.05),
    (1000000, 0.20),
    (None, 0.30),
]


def _surcharge_rate(taxable_income, cap_at_25):
    """Ordered thresholds: >50L, >1Cr, >2Cr, >5Cr."""
    if taxable_income > 50000000:
        return 0.25 if cap_at_25 else 0.37
    if taxable_income > 20000000:
        return 0.25
    if taxable_income > 10000000:
        return 0.15
    if taxable_income > 5000000:
        return 0.10
    return 0.0


def compute_new_regime(gross_salary, other_income=0, employer_nps=0, basic_salary=0):
    """Returns a breakdown dict. employer_nps: annual employer NPS contribution
    actually made (will be capped at 14% of basic_salary if basic_salary given)."""
    standard_deduction = 75000 if gross_salary > 0 else 0
    nps_deduction = min(employer_nps, basic_salary * 0.14) if basic_salary else employer_nps

    taxable_income = max(0, gross_salary - standard_deduction - nps_deduction + other_income)

    tax_before_rebate = _apply_slabs(taxable_income, NEW_REGIME_SLABS)

    # Section 87A rebate: full rebate (up to ₹60,000) if taxable income <= ₹12L,
    # with marginal relief just above that threshold.
    rebate = 0
    if taxable_income <= 1200000:
        rebate = min(tax_before_rebate, 60000)
    tax_after_rebate = max(0, tax_before_rebate - rebate)

    if 1200000 < taxable_income <= 1200000 + 60000 and rebate == 0:
        # Marginal relief: tax cannot exceed income over ₹12L
        excess = taxable_income - 1200000
        tax_after_rebate = min(tax_after_rebate, excess)

    surcharge_rate = _surcharge_rate(taxable_income, cap_at_25=True)
    surcharge = tax_after_rebate * surcharge_rate
    cess = (tax_after_rebate + surcharge) * CESS_RATE
    total_tax = tax_after_rebate + surcharge + cess

    return {
        'regime': 'new',
        'grossIncome': gross_salary + other_income,
        'deductions': standard_deduction + nps_deduction,
        'taxableIncome': round(taxable_income),
        'taxBeforeRebate': round(tax_before_rebate),
        'rebate': round(rebate),
        'surcharge': round(surcharge),
        'cess': round(cess),
        'totalTax': round(total_tax),
    }


def compute_old_regime(gross_salary, other_income=0, deductions=None, basic_salary=0):
    deductions = deductions or {}
    standard_deduction = 50000 if gross_salary > 0 else 0
    section_80c = min(deductions.get('section80C', 0), 150000)
    section_80d = min(deductions.get('section80D', 0), 100000)
    hra_exemption = deductions.get('hraExemption', 0)
    home_loan_interest = min(deductions.get('homeLoanInterest', 0), 200000)
    section_80ccd1b = min(deductions.get('nps80CCD1B', 0), 50000)
    employer_nps_pct = deductions.get('npsEmployerPct', 0)
    employer_nps = min(deductions.get('npsEmployer', 0), basic_salary * (employer_nps_pct or 0.10)) if basic_salary else 0

    total_deductions = (
        standard_deduction + section_80c + section_80d + hra_exemption +
        home_loan_interest + section_80ccd1b + employer_nps
    )
    taxable_income = max(0, gross_salary - total_deductions + other_income)

    tax_before_rebate = _apply_slabs(taxable_income, OLD_REGIME_SLABS)

    # Section 87A rebate: full rebate (up to ₹12,500) if taxable income <= ₹5L.
    rebate = min(tax_before_rebate, 12500) if taxable_income <= 500000 else 0
    tax_after_rebate = max(0, tax_before_rebate - rebate)

    surcharge_rate = _surcharge_rate(taxable_income, cap_at_25=False)
    surcharge = tax_after_rebate * surcharge_rate
    cess = (tax_after_rebate + surcharge) * CESS_RATE
    total_tax = tax_after_rebate + surcharge + cess

    return {
        'regime': 'old',
        'grossIncome': gross_salary + other_income,
        'deductions': round(total_deductions),
        'taxableIncome': round(taxable_income),
        'taxBeforeRebate': round(tax_before_rebate),
        'rebate': round(rebate),
        'surcharge': round(surcharge),
        'cess': round(cess),
        'totalTax': round(total_tax),
    }


def compare_regimes(gross_salary, other_income=0, old_deductions=None, employer_nps=0, basic_salary=0):
    new = compute_new_regime(gross_salary, other_income, employer_nps=employer_nps, basic_salary=basic_salary)
    old = compute_old_regime(gross_salary, other_income, deductions=old_deductions, basic_salary=basic_salary)
    recommended = 'new' if new['totalTax'] <= old['totalTax'] else 'old'
    savings = abs(new['totalTax'] - old['totalTax'])
    return {'new': new, 'old': old, 'recommended': recommended, 'savingsIfRecommended': round(savings)}
