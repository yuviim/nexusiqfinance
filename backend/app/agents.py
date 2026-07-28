"""
Three agents, each a genuine tool-use loop against Claude (not just a stuffed
prompt): the model decides when to call its tool, we execute it against the
real database, hand the result back, and let the model produce the final
answer. Math that matters (tax liability, totals) is always computed
deterministically in Python — the model narrates and reasons over numbers it
is given, it never does the arithmetic itself.
"""
import os
import json
import calendar
from datetime import datetime, timezone

from anthropic import Anthropic

from .models import db, User, Transaction, Budget, Goal, InvestmentHolding, SipLog, IncomeSource, TaxProfile, AdvanceTaxPayment, RecurringExpense, BankAccount
from .tax_engine import compare_regimes

MODEL = os.environ.get('ANTHROPIC_MODEL', 'claude-sonnet-5')

_client = None


def get_client():
    global _client
    if _client is None:
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not api_key:
            raise RuntimeError(
                'ANTHROPIC_API_KEY is not set. Add it to your environment (or a .env file) '
                'before using the agent endpoints — see wealthos-backend/README.md.'
            )
        _client = Anthropic(api_key=api_key)
    return _client


def _month_key(dt=None):
    dt = dt or datetime.now(timezone.utc)
    return f'{dt.year}-{dt.month}'


def _run_tool_loop(system_prompt, tools, tool_executors, user_content, max_turns=4):
    client = get_client()
    messages = [{'role': 'user', 'content': user_content}]

    for _ in range(max_turns):
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=system_prompt,
            tools=tools,
            messages=messages,
        )

        tool_use_blocks = [b for b in response.content if b.type == 'tool_use']
        text_blocks = [b.text for b in response.content if b.type == 'text']

        if not tool_use_blocks:
            return '\n'.join(text_blocks).strip() or "I wasn't able to generate a response."

        messages.append({'role': 'assistant', 'content': response.content})

        tool_results = []
        for block in tool_use_blocks:
            executor = tool_executors.get(block.name)
            if executor is None:
                result = {'error': f'Unknown tool {block.name}'}
            else:
                try:
                    result = executor(block.input or {})
                except Exception as e:  # keep the loop alive, surface the error to the model
                    result = {'error': str(e)}
            tool_results.append({
                'type': 'tool_result',
                'tool_use_id': block.id,
                'content': json.dumps(result, default=str),
            })
        messages.append({'role': 'user', 'content': tool_results})

    return "The agent needed more steps than expected — try rephrasing your question."


# ---------------------------------------------------------------------------
# Advisor agent
# ---------------------------------------------------------------------------

ADVISOR_SYSTEM_PROMPT = """You are a careful, plain-spoken personal financial advisor for an \
individual managing their finances in INR (Indian Rupees). You have two tools:

1. get_financial_snapshot — the person's budget, spend, savings rate, recurring bills \
(including any loan EMIs with their interest rate and outstanding balance), investment \
holdings, goals, and risk profile (conservative / moderate / aggressive).
2. get_surplus_projection — a run-rate projection of this month's likely surplus, based \
on spend-to-date and days remaining in the month. Call this specifically when asked \
about surplus, how much is safe to invest right now, or mid-month "how am I doing".

Always call the relevant tool before answering — never guess or assume numbers.

When asked where to invest a surplus, reason using their risk profile and current \
allocation from the snapshot: a conservative profile should be weighted toward debt \
funds/FDs/PPF, moderate toward a hybrid mix, aggressive toward equity — and reference \
their actual current mix (e.g. "you're already 70% equity, so..."), not a generic \
template. Suggest a concrete split across goals, SIP top-up, and (if relevant) loan \
prepayment, reasoned from their real numbers.

When asked about paying off a loan faster, compare it against realistic investment \
returns: prepaying is a guaranteed return equal to the loan's interest rate (from the \
recurring bill entry), so it's usually the better move when that rate is higher than \
what their investments are realistically earning, and usually worse when it's lower \
(e.g. a 7-8% home loan vs. equity SIPs historically averaging more) — reason explicitly \
using the actual interest rate and outstanding balance, never a generic rule of thumb.

Give specific, actionable advice grounded in what the tools return. Keep answers concise \
(a few short paragraphs or a short list, not an essay). If the question is outside \
personal finance, say so briefly and redirect."""


def _advisor_tools():
    return [
        {
            'name': 'get_financial_snapshot',
            'description': "Fetch the user's budget, spend, savings rate, recurring bills (incl. loan EMIs with rates), investments, goals, and risk profile.",
            'input_schema': {'type': 'object', 'properties': {}},
        },
        {
            'name': 'get_surplus_projection',
            'description': "Project this month's likely surplus based on spend-to-date and days remaining.",
            'input_schema': {'type': 'object', 'properties': {}},
        },
    ]


def _build_snapshot_executor(user_id):
    def executor(_input):
        user = User.query.get(user_id)
        goals = Goal.query.filter_by(user_id=user_id).all()
        holdings = InvestmentHolding.query.filter_by(user_id=user_id).all()
        recurring = RecurringExpense.query.filter_by(user_id=user_id).all()
        bank_accounts = BankAccount.query.filter_by(user_id=user_id).all()

        now = datetime.now(timezone.utc)
        this_month_tx = Transaction.query.filter_by(user_id=user_id).filter(
            db.extract('year', Transaction.date) == now.year,
            db.extract('month', Transaction.date) == now.month,
        ).all()
        spent = sum(t.amount for t in this_month_tx if t.type == 'expense')
        income_this_month = sum(t.amount for t in this_month_tx if t.type == 'income')

        total_bank_balance = sum(b.balance for b in bank_accounts)
        sip_log = SipLog.query.filter_by(user_id=user_id, month_key=_month_key()).first()
        total_recurring = sum(r.amount for r in recurring)

        holdings_by_category = {}
        for h in holdings:
            holdings_by_category[h.category] = holdings_by_category.get(h.category, 0) + h.value
        total_investments = sum(h.value for h in holdings)

        return {
            'riskProfile': user.risk_profile or 'moderate',
            'bankBalance': total_bank_balance,
            'monthlyIncome': user.monthly_income,
            'monthlyBudget': user.monthly_budget,
            'spentThisMonth': spent,
            'incomeThisMonth': income_this_month,
            'recurringBills': [
                {
                    'name': r.name, 'category': r.category, 'amount': r.amount,
                    'interestRatePct': r.interest_rate or 0, 'outstandingBalance': r.outstanding_balance or 0,
                }
                for r in recurring
            ],
            'totalRecurringBills': total_recurring,
            'sipMonthly': user.sip_monthly,
            'sipPaidThisMonth': bool(sip_log and sip_log.paid),
            'totalInvestments': total_investments,
            'investmentAllocationByCategory': holdings_by_category,
            'estimatedMonthlySurplus': user.monthly_income - user.monthly_budget - total_recurring - user.sip_monthly,
            'goals': [{'name': g.name, 'target': g.target, 'current': g.current} for g in goals],
        }
    return executor


def _build_surplus_projection_executor(user_id):
    def executor(_input):
        user = User.query.get(user_id)
        now = datetime.now(timezone.utc)
        days_in_month = calendar.monthrange(now.year, now.month)[1]
        days_elapsed = now.day
        days_remaining = days_in_month - days_elapsed

        this_month_tx = Transaction.query.filter_by(user_id=user_id).filter(
            db.extract('year', Transaction.date) == now.year,
            db.extract('month', Transaction.date) == now.month,
        ).all()
        spent_so_far = sum(t.amount for t in this_month_tx if t.type == 'expense')

        recurring_total = sum(r.amount for r in RecurringExpense.query.filter_by(user_id=user_id).all())
        budget_total = sum(b.limit for b in Budget.query.filter_by(user_id=user_id).all())

        daily_run_rate = spent_so_far / days_elapsed if days_elapsed else 0
        projected_month_end_spend = round(daily_run_rate * days_in_month)
        projected_surplus = round(user.monthly_income - projected_month_end_spend - user.sip_monthly)

        return {
            'daysInMonth': days_in_month,
            'daysElapsed': days_elapsed,
            'daysRemaining': days_remaining,
            'spentSoFar': spent_so_far,
            'dailyRunRate': round(daily_run_rate),
            'projectedMonthEndSpend': projected_month_end_spend,
            'monthlyIncome': user.monthly_income,
            'sipMonthly': user.sip_monthly,
            'committedBudgetAndBills': recurring_total + budget_total,
            'projectedSurplus': projected_surplus,
            'note': 'projectedMonthEndSpend is a simple run-rate estimate (spend-so-far ÷ days elapsed × days in month) — treat it as a rough projection, not a guarantee, especially early in the month when few data points exist.',
        }
    return executor


def run_advisor(user_id, question):
    tools = _advisor_tools()
    executors = {
        'get_financial_snapshot': _build_snapshot_executor(user_id),
        'get_surplus_projection': _build_surplus_projection_executor(user_id),
    }
    return _run_tool_loop(ADVISOR_SYSTEM_PROMPT, tools, executors, question)


# ---------------------------------------------------------------------------
# Tracker agent
# ---------------------------------------------------------------------------

TRACKER_SYSTEM_PROMPT_TEMPLATE = """You are an expense-tracking agent. The user will describe a \
transaction in plain language, e.g. "swiggy 450 for lunch" or "salary credited 150000" \
or "paid 2000 electricity bill" — or sometimes just the name of a known recurring bill \
with NO amount, e.g. "homeloan" or "term insurance", because the amount is always the \
same every month. Extract: type ("expense" or "income"), amount (a positive number, in \
INR), the best-fit category from exactly this list (these are the user's own budget \
categories — use one of them, do not invent new ones): {categories}, and a short note \
(the merchant/description).

Known recurring bills with fixed amounts (use these amounts automatically when the \
message names one of these, or something clearly matching one, even without an amount): \
{recurring_bills}

Use category "Income" only for type "income" (or the closest matching category if \
"Income" isn't in the list). Call create_transaction with these fields. If the message \
isn't a describable transaction, or is too ambiguous to extract an amount and category \
confidently (and doesn't match a known recurring bill), do NOT call the tool — instead \
ask a short clarifying question."""


def _tracker_tools(categories):
    return [{
        'name': 'create_transaction',
        'description': 'Record a transaction in the ledger.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'type': {'type': 'string', 'enum': ['expense', 'income']},
                'amount': {'type': 'number'},
                'category': {'type': 'string', 'enum': categories},
                'note': {'type': 'string'},
            },
            'required': ['type', 'amount', 'category'],
        },
    }]


def _build_create_transaction_executor(user_id):
    def executor(input_data):
        ttype = input_data.get('type')
        amount = input_data.get('amount')
        category = input_data.get('category') or 'Other'
        note = input_data.get('note') or ''

        if ttype not in ('expense', 'income'):
            return {'error': 'type must be expense or income'}
        try:
            amount = float(amount)
        except (TypeError, ValueError):
            return {'error': 'amount must be a number'}
        if amount <= 0:
            return {'error': 'amount must be positive'}

        tx = Transaction(user_id=user_id, type=ttype, amount=amount, category=category, note=note)
        db.session.add(tx)
        db.session.commit()
        return {'created': True, 'transaction': tx.to_dict()}
    return executor


def run_tracker(user_id, text):
    categories = [b.category for b in Budget.query.filter_by(user_id=user_id).all()] or ['Other']
    if 'Income' not in categories:
        categories = categories + ['Income']

    bills = RecurringExpense.query.filter_by(user_id=user_id).all()
    if bills:
        recurring_bills_desc = '; '.join(f'"{b.name}" ({b.category}) = ₹{b.amount:g}' for b in bills)
    else:
        recurring_bills_desc = '(none set up yet)'

    system_prompt = TRACKER_SYSTEM_PROMPT_TEMPLATE.format(
        categories=', '.join(f'"{c}"' for c in categories),
        recurring_bills=recurring_bills_desc,
    )
    tools = _tracker_tools(categories)
    executors = {'create_transaction': _build_create_transaction_executor(user_id)}
    return _run_tool_loop(system_prompt, tools, executors, text)


# ---------------------------------------------------------------------------
# Auditor agent
# ---------------------------------------------------------------------------

AUDITOR_SYSTEM_PROMPT = """You are a meticulous Indian income-tax auditor for FY 2026-27. \
You have a tool that computes exact tax liability under both the old and new regimes, \
and compares it against TDS already deducted and advance tax already paid. Always call \
the tool first. Then explain, using ONLY the numbers it returns (never recompute or \
estimate numbers yourself): which regime is cheaper and by how much, whether the tax \
already paid (TDS + advance tax) covers the computed liability or falls short, and if \
there's a shortfall, note that advance tax due dates are 15 Jun, 15 Sep, 15 Dec, and \
15 Mar. Be direct and specific with rupee figures. Keep it to a few short paragraphs."""


def _auditor_tools():
    return [{
        'name': 'get_tax_computation',
        'description': "Compute the user's tax liability under both regimes and compare to tax already paid (TDS + advance tax).",
        'input_schema': {'type': 'object', 'properties': {}},
    }]


def _build_tax_computation_executor(user_id):
    def executor(_input):
        sources = IncomeSource.query.filter_by(user_id=user_id).all()
        profile = TaxProfile.query.filter_by(user_id=user_id).first()
        payments = AdvanceTaxPayment.query.filter_by(user_id=user_id).all()

        salary_income = sum(s.annual_amount for s in sources if s.category == 'Salary')
        other_income = sum(s.annual_amount for s in sources if s.category != 'Salary')
        total_tds = sum(s.tds_deducted for s in sources)
        total_advance_tax = sum(p.amount for p in payments)

        old_deductions = {}
        basic_salary = 0
        employer_nps = 0
        if profile:
            basic_salary = profile.basic_salary or 0
            employer_nps = profile.employer_nps or 0
            old_deductions = {
                'section80C': profile.section_80c or 0,
                'section80D': profile.section_80d or 0,
                'hraExemption': profile.hra_exemption or 0,
                'homeLoanInterest': profile.home_loan_interest or 0,
                'nps80CCD1B': profile.nps_80ccd1b or 0,
                'npsEmployer': employer_nps,
                'npsEmployerPct': profile.employer_nps_pct or 0.10,
            }

        comparison = compare_regimes(
            gross_salary=salary_income,
            other_income=other_income,
            old_deductions=old_deductions,
            employer_nps=employer_nps,
            basic_salary=basic_salary,
        )

        chosen_regime = (profile.regime if profile else 'new')
        liability = comparison['new']['totalTax'] if chosen_regime == 'new' else comparison['old']['totalTax']
        total_paid = total_tds + total_advance_tax
        shortfall = liability - total_paid  # positive = still owed, negative = refund due

        return {
            **comparison,
            'currentRegimeSelected': chosen_regime,
            'totalTDS': total_tds,
            'totalAdvanceTaxPaid': total_advance_tax,
            'totalAlreadyPaid': total_paid,
            'currentRegimeLiability': liability,
            'shortfallOrRefund': round(shortfall),
        }
    return executor


def run_auditor(user_id, question=None):
    tools = _auditor_tools()
    executors = {'get_tax_computation': _build_tax_computation_executor(user_id)}
    prompt = question or 'Run the full tax audit for this financial year and give me your findings.'
    return _run_tool_loop(AUDITOR_SYSTEM_PROMPT, tools, executors, prompt)


# ---------------------------------------------------------------------------
# Salary slip agent — reads an uploaded payslip and extracts structured data
# ---------------------------------------------------------------------------

SALARY_SLIP_SYSTEM_PROMPT = """You are reading an uploaded salary slip / payslip document \
for an Indian salaried employee. Extract these fields as best you can tell from the \
document: grossMonthlySalary (the gross/total salary for this one pay period, before \
deductions, in INR), basicSalary (the "Basic" pay line item for this period, in INR), \
tdsThisMonth (income tax / TDS deducted this period, in INR — look for "Income Tax", \
"TDS", or similar), employerNpsThisMonth (employer's NPS or PF contribution this period, \
if shown separately from the employee's own contribution, in INR; 0 if not present). \
Call record_salary_details with your best extraction. If a field genuinely isn't on the \
document, pass 0 for it rather than guessing wildly, and mention in your reply which \
fields you couldn't find. After calling the tool, briefly summarize what you recorded \
and annualized (×12) for the user in plain language."""


def _salary_slip_tools():
    return [{
        'name': 'record_salary_details',
        'description': "Record this pay period's salary details extracted from the payslip.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'grossMonthlySalary': {'type': 'number'},
                'basicSalary': {'type': 'number'},
                'tdsThisMonth': {'type': 'number'},
                'employerNpsThisMonth': {'type': 'number'},
            },
            'required': ['grossMonthlySalary', 'basicSalary', 'tdsThisMonth'],
        },
    }]


def _build_record_salary_executor(user_id):
    def executor(input_data):
        gross_monthly = float(input_data.get('grossMonthlySalary') or 0)
        basic_monthly = float(input_data.get('basicSalary') or 0)
        tds_monthly = float(input_data.get('tdsThisMonth') or 0)
        employer_nps_monthly = float(input_data.get('employerNpsThisMonth') or 0)

        annual_gross = round(gross_monthly * 12)
        annual_tds = round(tds_monthly * 12)
        annual_basic = round(basic_monthly * 12)
        annual_employer_nps = round(employer_nps_monthly * 12)

        # Upsert a single "Primary salary" income source (rather than creating
        # a duplicate every month) — this reflects "current annualized salary",
        # not a running ledger of every payslip.
        source = IncomeSource.query.filter_by(user_id=user_id, category='Salary').first()
        if source:
            source.annual_amount = annual_gross
            source.tds_deducted = annual_tds
        else:
            source = IncomeSource(
                user_id=user_id, name='Primary salary', category='Salary',
                annual_amount=annual_gross, tds_deducted=annual_tds,
            )
            db.session.add(source)

        profile = TaxProfile.query.filter_by(user_id=user_id).first()
        if not profile:
            profile = TaxProfile(user_id=user_id)
            db.session.add(profile)
        profile.basic_salary = annual_basic
        if annual_employer_nps:
            profile.employer_nps = annual_employer_nps

        db.session.commit()

        return {
            'recorded': True,
            'annualGrossSalary': annual_gross,
            'annualTDS': annual_tds,
            'annualBasicSalary': annual_basic,
            'annualEmployerNPS': annual_employer_nps,
        }
    return executor


def run_salary_slip(user_id, file_b64, media_type):
    is_pdf = media_type == 'application/pdf'
    doc_block = {
        'type': 'document' if is_pdf else 'image',
        'source': {'type': 'base64', 'media_type': media_type, 'data': file_b64},
    }
    user_content = [
        doc_block,
        {'type': 'text', 'text': 'Extract the salary details from this payslip and call record_salary_details.'},
    ]
    tools = _salary_slip_tools()
    executors = {'record_salary_details': _build_record_salary_executor(user_id)}
    return _run_tool_loop(SALARY_SLIP_SYSTEM_PROMPT, tools, executors, user_content)
