let database;
let gameState;
let canvas, ctx;
let joystick;
let player;
let gameLoop;

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
    document.getElementById('ready-button').addEventListener('click', ready);
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

function ready() {
    fetch('/ready', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (data.message === 'Game started') {
                startGame();
            } else {
                alert('Waiting for other player to be ready');
            }
        } else {
            alert(data.message || 'Failed to update ready status');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while updating ready status');
    });
}

function startGame() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const joystickOptions = {
        zone: document.body,
        color: 'blue',
        size: 100
    };
    joystick = nipplejs.create(joystickOptions);

    player = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        radius: 20,
        color: gameState.player === 'player1' ? 'blue' : 'red'
    };

    joystick.on('move', (evt, data) => {
        const speed = 2;
        player.x += data.vector.x * speed;
        player.y += data.vector.y * speed;
    });

    gameLoop = setInterval(updateGame, 1000 / 60);  // 60 FPS
}

function updateGame() {
    // Keep player within canvas bounds
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

    // Update player position in Firebase
    updatePosition(player.x, player.y);

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Paint the canvas
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();

    // Get opponent's position and paint
    fetch('/game_state')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                gameState = data.game;
                const opponentPlayer = gameState.player === 'player1' ? 'player2' : 'player1';
                const opponentColor = opponentPlayer === 'player1' ? 'blue' : 'red';
                ctx.fillStyle = opponentColor;
                ctx.beginPath();
                ctx.arc(gameState[opponentPlayer].x, gameState[opponentPlayer].y, player.radius, 0, Math.PI * 2);
                ctx.fill();

                // Check if game has ended
                if (gameState.status === 'finished') {
                    endGame();
                }
            }
        });
}

function updatePosition(x, y) {
    fetch('/update_position', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ x, y }),
    });
}

function endGame() {
    clearInterval(gameLoop);
    // Calculate the winner based on colored area
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let bluePixels = 0;
    let redPixels = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i] === 0 && imageData.data[i + 1] === 0 && imageData.data[i + 2] === 255) {
            bluePixels++;
        } else if (imageData.data[i] === 255 && imageData.data[i + 1] === 0 && imageData.data[i + 2] === 0) {
            redPixels++;
        }
    }
    const winner = bluePixels > redPixels ? 'player1' : 'player2';
    alert(`Game over! The winner is ${winner}`);
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