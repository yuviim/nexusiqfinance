import os
from datetime import timedelta

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate

from .models import db, SessionInvalid

migrate = Migrate()


def create_app():
    app = Flask(__name__)

    db_path = os.environ.get('DATABASE_URL', 'sqlite:///' + os.path.join(os.path.dirname(os.path.dirname(__file__)), 'wealthos.db'))
    # Some providers hand out "postgres://" URLs, but SQLAlchemy 2.x requires "postgresql://"
    if db_path.startswith('postgres://'):
        db_path = db_path.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = db_path
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'dev-secret-change-me')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=30)

    CORS(app)
    db.init_app(app)
    migrate.init_app(app, db)
    JWTManager(app)

    from .auth import auth_bp
    from .api import api_bp
    from .tax_routes import tax_bp
    from .agent_routes import agents_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(tax_bp)
    app.register_blueprint(agents_bp)

    @app.get('/api/health')
    def health():
        return jsonify({'status': 'ok'})

    @app.errorhandler(SessionInvalid)
    def handle_session_invalid(e):
        return jsonify({'error': e.description}), 401

    return app
