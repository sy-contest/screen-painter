import os
import json
from flask import Flask, render_template, request, jsonify, session
import firebase_admin
from firebase_admin import credentials, db
from dotenv import load_dotenv
from .config import get_firebase_config
import time

load_dotenv()

app = Flask(__name__, template_folder='../templates', static_folder='../static')

app.secret_key = os.getenv('FLASK_SECRET_KEY')
if not app.secret_key:
    raise ValueError("No FLASK_SECRET_KEY set for Flask application")

firebase_service_account = json.loads(os.getenv('FIREBASE_SERVICE_ACCOUNT'))
cred = credentials.Certificate(firebase_service_account)
firebase_admin.initialize_app(cred, {
    'databaseURL': os.getenv('FIREBASE_DATABASE_URL')
})

@app.route('/login', methods=['POST'])
def login():
    username = request.json.get('username')
    game_id = request.json.get('game_id')

    if not username or not game_id:
        return jsonify({'success': False, 'message': 'Username and game ID are required'}), 400

    game_ref = db.reference(f'games/{game_id}')
    game = game_ref.get()

    if not game:
        # Create a new game if it doesn't exist
        game_ref.set({
            'status': 'waiting_players',
            'player1': {'username': None, 'ready': False, 'x': 0, 'y': 0},
            'player2': {'username': None, 'ready': False, 'x': 0, 'y': 0},
            'start_time': None,
            'end_time': None
        })
        game = game_ref.get()

    if game['status'] == 'finished':
        return jsonify({'success': False, 'message': 'Game has already finished'}), 403

    if game['player1']['username'] == username:
        player = 'player1'
    elif game['player2']['username'] == username:
        player = 'player2'
    elif not game['player1']['username']:
        player = 'player1'
        game_ref.child('player1').update({'username': username})
    elif not game['player2']['username']:
        player = 'player2'
        game_ref.child('player2').update({'username': username})
    else:
        return jsonify({'success': False, 'message': 'Game is full'}), 403

    session['username'] = username
    session['game_id'] = game_id
    session['player'] = player

    if game['player1']['username'] and game['player2']['username']:
        game_ref.update({'status': 'waiting_ready'})

    return jsonify({'success': True, 'player': player})

@app.route('/ready', methods=['POST'])
def ready():
    if 'username' not in session or 'game_id' not in session or 'player' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    game_id = session['game_id']
    player = session['player']

    game_ref = db.reference(f'games/{game_id}')
    game = game_ref.get()

    if not game:
        return jsonify({'success': False, 'message': 'Game not found'}), 404

    if game['status'] != 'waiting_ready':
        return jsonify({'success': False, 'message': 'Game is not in waiting state'}), 400

    game_ref.child(player).update({'ready': True})
    
    updated_game = game_ref.get()
    if updated_game['player1']['ready'] and updated_game['player2']['ready']:
        start_time = int(time.time())
        game_ref.update({
            'status': 'playing',
            'start_time': start_time,
            'end_time': start_time + 30  # 30 seconds game duration
        })
        return jsonify({'success': True, 'message': 'Game started'})
    
    return jsonify({'success': True, 'message': 'Ready status updated'})

@app.route('/make_guess', methods=['POST'])
def make_guess():
    if 'username' not in session or 'game_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    guess = request.json.get('guess')
    game_id = session['game_id']
    player = session['player']

    if not guess:
        return jsonify({'success': False, 'message': 'No guess provided'}), 400

    game_ref = db.reference(f'games/{game_id}')
    game = game_ref.get()

    if not game:
        return jsonify({'success': False, 'message': 'Game not found'}), 404

    if game['status'] != 'playing':
        return jsonify({'success': False, 'message': 'Game is not in playing state'}), 400

    correct_number = game['correct_number']
    
    if int(guess) == correct_number:
        game_ref.update({'status': 'finished', 'winner': player})
        return jsonify({'success': True, 'message': 'Correct guess! You win!', 'winner': player})
    else:
        hint = 'higher' if int(guess) < correct_number else 'lower'
        return jsonify({'success': True, 'message': f'Incorrect. Try a {hint} number.'})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/config')
def config():
    try:
        return get_firebase_config()
    except Exception as e:
        app.logger.error(f"Error in config: {str(e)}")
        return jsonify({'error': 'Failed to get Firebase config'}), 500

@app.route('/update_position', methods=['POST'])
def update_position():
    if 'username' not in session or 'game_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    game_id = session['game_id']
    player = session['player']
    x = request.json.get('x')
    y = request.json.get('y')

    if x is None or y is None:
        return jsonify({'success': False, 'message': 'Position data is required'}), 400

    game_ref = db.reference(f'games/{game_id}')
    game_ref.child(player).update({'x': x, 'y': y})

    return jsonify({'success': True})

@app.route('/game_state', methods=['GET'])
def game_state():
    if 'username' not in session or 'game_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    game_id = session['game_id']
    game_ref = db.reference(f'games/{game_id}')
    game = game_ref.get()

    if not game:
        return jsonify({'success': False, 'message': 'Game not found'}), 404

    return jsonify({'success': True, 'game': game})

if __name__ == '__main__':
    app.run(debug=True)