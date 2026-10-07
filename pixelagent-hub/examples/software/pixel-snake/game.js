(() => {
  const COLS = 20, ROWS = 20, SIZE = 20, TICK = 150;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');
  const pauseBtn = document.getElementById('pauseBtn');
  const restartBtn = document.getElementById('restartBtn');

  let snake, dir, nextDir, food, score, state, timer;

  function reset() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    state = 'paused';
    scoreEl.textContent = score;
    statusEl.textContent = 'Paused';
    pauseBtn.textContent = 'Resume';
    pauseBtn.disabled = false;
    placeFood();
    draw();
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!snake.some(s => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    if (free.length) food = free[Math.floor(Math.random() * free.length)];
  }

  function move() {
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || snake.some(s => s.x === head.x && s.y === head.y)) {
      gameOver();
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++;
      scoreEl.textContent = score;
      placeFood();
    } else {
      snake.pop();
    }
  }

  function gameOver() {
    state = 'gameover';
    statusEl.textContent = 'Game Over';
    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = true;
    clearInterval(timer);
    draw();
  }

  function tick() {
    if (state === 'running') {
      dir = nextDir;
      move();
      if (state !== 'gameover') draw();
    }
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff5555';
    ctx.fillRect(food.x * SIZE, food.y * SIZE, SIZE - 1, SIZE - 1);
    snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#aaff55' : '#55cc55';
      ctx.fillRect(seg.x * SIZE, seg.y * SIZE, SIZE - 1, SIZE - 1);
    });
    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
    }
  }

  function togglePause() {
    if (state === 'gameover') return;
    if (state === 'running') {
      state = 'paused';
      statusEl.textContent = 'Paused';
      pauseBtn.textContent = 'Resume';
    } else {
      state = 'running';
      statusEl.textContent = 'Running';
      pauseBtn.textContent = 'Pause';
    }
    draw();
  }

  window.addEventListener('keydown', (e) => {
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (arrows.includes(e.key)) {
      e.preventDefault();
      if (state === 'gameover') return;
      const map = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 }
      };
      const want = map[e.key];
      if (want.x !== -dir.x || want.y !== -dir.y) nextDir = want;
    }
  });

  pauseBtn.addEventListener('click', togglePause);
  restartBtn.addEventListener('click', () => {
    clearInterval(timer);
    reset();
    timer = setInterval(tick, TICK);
  });

  reset();
  timer = setInterval(tick, TICK);
})();