from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from . import agents
from .models import User, SessionInvalid

agents_bp = Blueprint('agents', __name__, url_prefix='/api/agents')


def _current_user_id():
    uid = get_jwt_identity()
    user = User.query.get(int(uid)) if uid else None
    if user is None:
        raise SessionInvalid()
    return user.id


@agents_bp.post('/advisor')
@jwt_required()
def advisor():
    payload = request.get_json(silent=True) or {}
    question = (payload.get('message') or '').strip()
    if not question:
        return jsonify({'error': 'message is required'}), 400

    raw_history = payload.get('history') or []
    history = []
    for turn in raw_history[-20:]:  # cap length so context doesn't grow unbounded
        role = turn.get('role')
        text = turn.get('text')
        if role in ('user', 'assistant') and text:
            history.append({'role': role, 'content': text})

    if history and history[-1]['role'] == 'user':
        # A trailing unpaired user turn (e.g. from a previously failed request)
        # would give the API two consecutive user turns once the new question
        # is appended — which it rejects outright. Drop it defensively.
        history = history[:-1]

    try:
        result = agents.run_advisor(_current_user_id(), question, history=history)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except agents.APIStatusError as e:
        if e.status_code in (529, 429):
            return jsonify({'error': "Anthropic's API is briefly overloaded right now — please try again in a few seconds."}), 503
        return jsonify({'error': f'The advisor hit an unexpected error: {e}'}), 500
    except Exception as e:
        return jsonify({'error': f'The advisor hit an unexpected error: {e}'}), 500
    return jsonify(result)


@agents_bp.post('/tracker')
@jwt_required()
def tracker():
    payload = request.get_json(silent=True) or {}
    text = (payload.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'text is required'}), 400
    try:
        result = agents.run_tracker(_current_user_id(), text)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    return jsonify(result)


@agents_bp.post('/auditor')
@jwt_required()
def auditor():
    payload = request.get_json(silent=True) or {}
    question = (payload.get('message') or '').strip() or None
    try:
        reply = agents.run_auditor(_current_user_id(), question)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    return jsonify({'reply': reply})


@agents_bp.post('/salary-slip')
@jwt_required()
def salary_slip():
    payload = request.get_json(silent=True) or {}
    file_b64 = payload.get('fileBase64')
    media_type = payload.get('mediaType')
    if not file_b64 or not media_type:
        return jsonify({'error': 'fileBase64 and mediaType are required'}), 400
    allowed_types = ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')
    if media_type not in allowed_types:
        return jsonify({'error': f'mediaType must be one of {allowed_types}'}), 400
    try:
        reply = agents.run_salary_slip(_current_user_id(), file_b64, media_type)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    return jsonify({'reply': reply})
