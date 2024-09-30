let database;

fetch('/config')
    .then(response => response.json())
    .then(firebaseConfig => {
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        initializeEventListeners();
    })
    .catch(error => {
        console.error('Error loading Firebase config:', error);
        alert('Failed to load Firebase configuration. Please try again later.');
    });

function initializeEventListeners() {
    document.getElementById('login-button').addEventListener('click', login);
    document.getElementById('guess-button').addEventListener('click', makeGuess);
}

function login() {
    const username = document.getElementById('username').value;
    const gameId = document.getElementById('game-id').value;

    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, game_id: gameId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('game-area').style.display = 'block';
            listenForGameUpdates(gameId);
        } else {
            alert(data.message || 'Failed to login');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while logging in');
    });
}

function makeGuess() {
    const guess = document.getElementById('guess-input').value;

    fetch('/make_guess', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ guess }),
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('result').textContent = data.message;
        if (data.winner) {
            alert('Congratulations! You won!');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while making a guess');
    });
}

function listenForGameUpdates(gameId) {
    const gameRef = database.ref(`games/${gameId}`);
    gameRef.on('value', (snapshot) => {
        const game = snapshot.val();
        if (game.status === 'finished') {
            alert(`Game over! The winner is ${game.winner}`);
        }
    });
}