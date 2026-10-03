/* ==========================================================================
   RUSH - 3-Lane Arcade Game Engine
   ========================================================================== */

(function () {
    'use strict';

    // Game States
    const STATE = {
        MENU: 'MENU',
        PLAYING: 'PLAYING',
        GAMEOVER: 'GAMEOVER'
    };

    // Configuration
    const CONFIG = {
        LANE_COUNT: 3,
        MAX_HEALTH: 3,
        BASE_SPEED: 280,
        MAX_SPEED: 700,
        SPEED_ACCEL: 0.03, // Speed increase per second
        BASE_SPAWN_INTERVAL: 1.1, // seconds
        MIN_SPAWN_INTERVAL: 0.42,
        COLLECTIBLE_POINTS: 100,
        MAX_COMBO: 10,
        PLAYER_SIZE: 34,
        SHIELD_SPAWN_CHANCE: 0.08,
        COLLECTIBLE_SPAWN_CHANCE: 0.55
    };

    // Game Context & Elements
    let canvas, ctx;
    let currentState = STATE.MENU;
    let animFrameId = null;
    let lastTime = 0;

    // Audio Manager Shortcut
    const audio = window.soundManager;

    // Game Variables
    let score = 0;
    let bestScore = parseInt(localStorage.getItem('rush_best_score') || '0', 10);
    let combo = 1;
    let health = CONFIG.MAX_HEALTH;
    let hasShield = false;
    let gameSpeed = CONFIG.BASE_SPEED;
    let spawnTimer = 0;
    let roadOffset = 0;
    let screenShakeTimer = 0;

    // Lane X Positions (calculated on resize)
    let laneWidth = 0;
    let laneCenters = [0, 0, 0];

    // Entities
    const player = {
        lane: 1, // 0: Left, 1: Center, 2: Right
        x: 0,
        y: 0,
        targetX: 0,
        size: CONFIG.PLAYER_SIZE,
        color: '#22D3EE',
        trail: []
    };

    let objects = [];
    let particles = [];

    // UI Element References
    const startScreen = document.getElementById('startScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const gameHud = document.getElementById('gameHud');
    const startBtn = document.getElementById('startBtn');
    const restartBtn = document.getElementById('restartBtn');
    const soundToggleBtn = document.getElementById('soundToggleBtn');
    const soundIconOn = document.getElementById('soundIconOn');
    const soundIconOff = document.getElementById('soundIconOff');
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const comboDisplay = document.getElementById('comboDisplay');
    const healthDisplay = document.getElementById('healthDisplay');
    const shieldIndicator = document.getElementById('shieldIndicator');
    const shieldText = document.getElementById('shieldText');
    const finalScoreDisplay = document.getElementById('finalScore');
    const bestScoreDisplay = document.getElementById('bestScore');
    const newBestBadge = document.getElementById('newBestBadge');

    // ==========================================
    // Initialization & Setup
    // ==========================================

    function init() {
        canvas = document.getElementById('gameCanvas');
        ctx = canvas.getContext('2d');

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        setupInputListeners();
        updateSoundUI();
        updateBestScoreUI();

        // Set initial player position
        player.x = laneCenters[player.lane];
        player.targetX = player.x;
        player.y = canvas.height - 100;

        // Initial render call
        renderMenuState();
    }

    function resizeCanvas() {
        const wrapper = canvas.parentElement;
        const rect = wrapper.getBoundingClientRect();

        canvas.width = rect.width;
        canvas.height = rect.height;

        laneWidth = canvas.width / CONFIG.LANE_COUNT;
        laneCenters = [
            laneWidth * 0.5,
            laneWidth * 1.5,
            laneWidth * 2.5
        ];

        player.y = canvas.height - 100;
        player.x = laneCenters[player.lane];
        player.targetX = player.x;
    }

    function updateSoundUI() {
        if (audio.isMuted) {
            soundIconOn.classList.add('hidden');
            soundIconOff.classList.remove('hidden');
        } else {
            soundIconOn.classList.remove('hidden');
            soundIconOff.classList.add('hidden');
        }
    }

    function updateBestScoreUI() {
        bestScoreDisplay.textContent = bestScore;
    }

    // ==========================================
    // Controls & Event Handlers
    // ==========================================

    function setupInputListeners() {
        // Keyboard Input
        window.addEventListener('keydown', (e) => {
            audio.ensureContext();

            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                movePlayerLeft();
            } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                movePlayerRight();
            } else if (e.key === ' ' || e.key === 'Enter') {
                if (currentState === STATE.MENU || currentState === STATE.GAMEOVER) {
                    startGame();
                }
            }
        });

        // Mobile Touch Buttons
        btnLeft.addEventListener('touchstart', (e) => {
            e.preventDefault();
            audio.ensureContext();
            movePlayerLeft();
        });

        btnRight.addEventListener('touchstart', (e) => {
            e.preventDefault();
            audio.ensureContext();
            movePlayerRight();
        });

        // Fallback for desktop clicks on touch buttons
        btnLeft.addEventListener('click', () => {
            audio.ensureContext();
            movePlayerLeft();
        });
        btnRight.addEventListener('click', () => {
            audio.ensureContext();
            movePlayerRight();
        });

        // Start / Restart Buttons
        startBtn.addEventListener('click', () => {
            audio.ensureContext();
            startGame();
        });

        restartBtn.addEventListener('click', () => {
            audio.ensureContext();
            startGame();
        });

        // Mute Toggle Button
        soundToggleBtn.addEventListener('click', () => {
            audio.ensureContext();
            audio.toggleMute();
            updateSoundUI();
        });
    }

    function movePlayerLeft() {
        if (currentState !== STATE.PLAYING) return;
        if (player.lane > 0) {
            player.lane--;
            player.targetX = laneCenters[player.lane];
            audio.playMove();
        }
    }

    function movePlayerRight() {
        if (currentState !== STATE.PLAYING) return;
        if (player.lane < CONFIG.LANE_COUNT - 1) {
            player.lane++;
            player.targetX = laneCenters[player.lane];
            audio.playMove();
        }
    }

    // ==========================================
    // Game Loop & State Management
    // ==========================================

    function startGame() {
        currentState = STATE.PLAYING;

        // Reset parameters
        score = 0;
        combo = 1;
        health = CONFIG.MAX_HEALTH;
        hasShield = false;
        gameSpeed = CONFIG.BASE_SPEED;
        spawnTimer = 0;
        screenShakeTimer = 0;
        objects = [];
        particles = [];

        // Reset player position
        player.lane = 1;
        player.x = laneCenters[1];
        player.targetX = player.x;

        // UI Updates
        startScreen.classList.remove('active');
        startScreen.classList.add('hidden');
        gameOverScreen.classList.remove('active');
        gameOverScreen.classList.add('hidden');
        gameHud.classList.remove('hidden');

        updateHUD();

        lastTime = performance.now();
        if (animFrameId) cancelAnimationFrame(animFrameId);
        animFrameId = requestAnimationFrame(gameLoop);
    }

    function gameOver() {
        currentState = STATE.GAMEOVER;
        audio.playGameOver();

        // High Score check
        let isNewHigh = false;
        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem('rush_best_score', bestScore.toString());
            isNewHigh = true;
        }

        finalScoreDisplay.textContent = score;
        bestScoreDisplay.textContent = bestScore;

        if (isNewHigh) {
            newBestBadge.classList.remove('hidden');
        } else {
            newBestBadge.classList.add('hidden');
        }

        // UI updates
        gameHud.classList.add('hidden');
        gameOverScreen.classList.remove('hidden');
        gameOverScreen.classList.add('active');
    }

    function gameLoop(timestamp) {
        if (currentState !== STATE.PLAYING) return;

        const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // Clamp delta time
        lastTime = timestamp;

        update(dt);
        render();

        animFrameId = requestAnimationFrame(gameLoop);
    }

    // ==========================================
    // Update Logic
    // ==========================================

    function update(dt) {
        // Speed progression over time
        gameSpeed = Math.min(CONFIG.MAX_SPEED, CONFIG.BASE_SPEED + score * CONFIG.SPEED_ACCEL);

        // Passive score increment
        score += Math.round(gameSpeed * dt * 0.1);
        updateHUD();

        // Road animation offset
        roadOffset = (roadOffset + gameSpeed * dt) % 60;

        // Screen Shake update
        if (screenShakeTimer > 0) {
            screenShakeTimer -= dt;
        }

        // Smooth lerp player movement to target lane
        player.x += (player.targetX - player.x) * Math.min(1, dt * 22);

        // Player position trail
        if (Math.abs(player.targetX - player.x) > 2) {
            player.trail.push({ x: player.x, y: player.y, alpha: 0.5 });
        }
        player.trail.forEach(t => t.alpha -= dt * 3);
        player.trail = player.trail.filter(t => t.alpha > 0);

        // Spawning system
        spawnTimer += dt;
        const currentSpawnInterval = Math.max(
            CONFIG.MIN_SPAWN_INTERVAL,
            CONFIG.BASE_SPAWN_INTERVAL - (score * 0.00015)
        );

        if (spawnTimer >= currentSpawnInterval) {
            spawnObjectsWave();
            spawnTimer = 0;
        }

        // Update Objects
        for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            obj.y += gameSpeed * dt;
            obj.rotation += (obj.rotSpeed || 0) * dt;

            // Check Collision with player
            if (!obj.collected && checkCollision(player, obj)) {
                handleCollision(obj);
                if (obj.type === 'COLLECTIBLE' || obj.type === 'SHIELD') {
                    objects.splice(i, 1);
                    continue;
                }
            }

            // Remove out of bounds objects
            if (obj.y > canvas.height + 60) {
                // If hazard missed, slightly add survival bonus score
                if (obj.type === 'HAZARD' && !obj.hitPlayer) {
                    score += 5;
                }
                objects.splice(i, 1);
            }
        }

        // Update Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            p.alpha = Math.max(0, p.life / p.maxLife);

            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    // Spawns wave guaranteeing impossible patterns are prevented
    function spawnObjectsWave() {
        const laneIndices = [0, 1, 2];
        // Shuffle lanes to randomize spawn selection
        laneIndices.sort(() => Math.random() - 0.5);

        // Roll for number of hazards in wave (Max 2 hazards to always leave 1 lane clear!)
        const rand = Math.random();
        let hazardCount = 1;
        if (rand > 0.65 && gameSpeed > 350) {
            hazardCount = 2; // Spawn 2 hazards only when speed ramps up
        }

        // Assign hazards to chosen lanes
        const hazardLanes = laneIndices.slice(0, hazardCount);
        const safeLanes = laneIndices.slice(hazardCount);

        // Spawn Hazards
        hazardLanes.forEach(laneIdx => {
            const hazardTypes = ['BLOCK', 'SPIKE', 'ROTATE_DIAMOND'];
            const hType = hazardTypes[Math.floor(Math.random() * hazardTypes.length)];
            objects.push({
                type: 'HAZARD',
                hazardType: hType,
                lane: laneIdx,
                x: laneCenters[laneIdx],
                y: -40,
                size: 32,
                rotation: 0,
                rotSpeed: hType === 'ROTATE_DIAMOND' ? 3 : 0,
                hitPlayer: false
            });
        });

        // In remaining safe lane(s), optionally spawn Collectible or Shield
        safeLanes.forEach(laneIdx => {
            const spawnRoll = Math.random();

            if (!hasShield && spawnRoll < CONFIG.SHIELD_SPAWN_CHANCE) {
                // Spawn Shield Power-Up
                objects.push({
                    type: 'SHIELD',
                    lane: laneIdx,
                    x: laneCenters[laneIdx],
                    y: -40,
                    size: 28,
                    rotation: 0,
                    rotSpeed: 1.5
                });
            } else if (spawnRoll < CONFIG.COLLECTIBLE_SPAWN_CHANCE) {
                // Spawn Collectible
                const cShapes = ['CIRCLE', 'DIAMOND', 'CELL'];
                objects.push({
                    type: 'COLLECTIBLE',
                    shape: cShapes[Math.floor(Math.random() * cShapes.length)],
                    lane: laneIdx,
                    x: laneCenters[laneIdx],
                    y: -40,
                    size: 24,
                    rotation: 0,
                    rotSpeed: 2
                });
            }
        });
    }

    // Collision Check (Simple bounding circle / box check)
    function checkCollision(p, obj) {
        const dx = p.x - obj.x;
        const dy = p.y - obj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < (p.size / 2 + obj.size / 2);
    }

    function handleCollision(obj) {
        if (obj.type === 'COLLECTIBLE') {
            // Score & Combo increment
            const pts = CONFIG.COLLECTIBLE_POINTS * combo;
            score += pts;
            audio.playCollect();

            if (combo < CONFIG.MAX_COMBO) {
                combo++;
                audio.playCombo(combo);
            }

            spawnParticles(obj.x, obj.y, '#FACC15', 12);
            updateHUD();
        } else if (obj.type === 'SHIELD') {
            hasShield = true;
            audio.playShieldGet();
            spawnParticles(obj.x, obj.y, '#22D3EE', 16);
            updateHUD();
        } else if (obj.type === 'HAZARD') {
            if (obj.hitPlayer) return;
            obj.hitPlayer = true;

            if (hasShield) {
                // Shield absorbs hit
                hasShield = false;
                audio.playShieldBreak();
                spawnParticles(player.x, player.y, '#22D3EE', 20);
                screenShakeTimer = 0.15;
                updateHUD();
            } else {
                // Take Damage
                health--;
                combo = 1; // Reset combo multiplier
                screenShakeTimer = 0.3;
                audio.playHit();
                spawnParticles(player.x, player.y, '#EF4444', 24);
                updateHUD();

                if (health <= 0) {
                    gameOver();
                }
            }
        }
    }

    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 180;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.3 + Math.random() * 0.3,
                maxLife: 0.6,
                color: color,
                size: 3 + Math.random() * 4,
                alpha: 1
            });
        }
    }

    function updateHUD() {
        scoreDisplay.textContent = score;
        comboDisplay.textContent = `COMBO x${combo}`;

        // Health Hearts
        const hearts = healthDisplay.querySelectorAll('.heart');
        hearts.forEach((heart, idx) => {
            if (idx < health) {
                heart.classList.add('active');
            } else {
                heart.classList.remove('active');
            }
        });

        // Shield Badge
        if (hasShield) {
            shieldIndicator.className = 'shield-badge ready';
            shieldText.textContent = 'SHIELD: READY';
        } else {
            shieldIndicator.className = 'shield-badge empty';
            shieldText.textContent = 'SHIELD: EMPTY';
        }
    }

    // ==========================================
    // Rendering Logic
    // ==========================================

    function renderMenuState() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawArenaBackground();
        drawPlayer();
    }

    function render() {
        ctx.save();

        // Screen Shake effect on hit
        if (screenShakeTimer > 0) {
            const shakeX = (Math.random() - 0.5) * 12;
            const shakeY = (Math.random() - 0.5) * 12;
            ctx.translate(shakeX, shakeY);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Background Arena & Lanes
        drawArenaBackground();

        // Draw Falling Objects
        objects.forEach(drawObject);

        // Draw Player Trail & Player
        drawPlayerTrail();
        drawPlayer();

        // Draw Particles
        drawParticles();

        ctx.restore();
    }

    function drawArenaBackground() {
        // Fill Arena Dark Color
        ctx.fillStyle = '#1D1D1D';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Subtle Vertical Lane Dividers
        ctx.strokeStyle = '#2A2A2A';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 16]);

        // Lane 1 divider
        ctx.beginPath();
        ctx.moveTo(laneWidth, 0);
        ctx.lineTo(laneWidth, canvas.height);
        ctx.stroke();

        // Lane 2 divider
        ctx.beginPath();
        ctx.moveTo(laneWidth * 2, 0);
        ctx.lineTo(laneWidth * 2, canvas.height);
        ctx.stroke();

        ctx.setLineDash([]); // Reset line dash

        // Draw Moving Speed Grid / Road Stripes
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let y = roadOffset - 60; y < canvas.height; y += 60) {
            ctx.fillRect(0, y, canvas.width, 3);
        }
    }

    function drawPlayerTrail() {
        player.trail.forEach(t => {
            ctx.save();
            ctx.globalAlpha = t.alpha * 0.4;
            ctx.fillStyle = player.color;
            ctx.beginPath();
            // Arrow shape trail
            ctx.moveTo(t.x, t.y - player.size / 2);
            ctx.lineTo(t.x - player.size / 2, t.y + player.size / 2);
            ctx.lineTo(t.x, t.y + player.size / 4);
            ctx.lineTo(t.x + player.size / 2, t.y + player.size / 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });
    }

    function drawPlayer() {
        ctx.save();

        // Draw Shield Aura if Active
        if (hasShield) {
            ctx.strokeStyle = '#22D3EE';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.size * 0.8, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
            ctx.fill();
        }

        // Draw Player Geometric Vehicle / Arrow
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y - player.size / 2);
        ctx.lineTo(player.x - player.size / 2, player.y + player.size / 2);
        ctx.lineTo(player.x, player.y + player.size / 4);
        ctx.lineTo(player.x + player.size / 2, player.y + player.size / 2);
        ctx.closePath();
        ctx.fill();

        // Inner highlight core
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(player.x, player.y - player.size / 8, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawObject(obj) {
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.rotation);

        if (obj.type === 'COLLECTIBLE') {
            ctx.fillStyle = '#FACC15';
            ctx.strokeStyle = '#EAB308';
            ctx.lineWidth = 2;

            if (obj.shape === 'CIRCLE') {
                ctx.beginPath();
                ctx.arc(0, 0, obj.size / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else if (obj.shape === 'DIAMOND') {
                ctx.beginPath();
                ctx.moveTo(0, -obj.size / 2);
                ctx.lineTo(obj.size / 2, 0);
                ctx.lineTo(0, obj.size / 2);
                ctx.lineTo(-obj.size / 2, 0);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else { // CELL
                ctx.fillRect(-obj.size / 2, -obj.size / 2, obj.size, obj.size);
                ctx.strokeRect(-obj.size / 2, -obj.size / 2, obj.size, obj.size);
            }
        } else if (obj.type === 'SHIELD') {
            ctx.strokeStyle = '#22D3EE';
            ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
            ctx.lineWidth = 3;

            ctx.beginPath();
            ctx.arc(0, 0, obj.size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner icon symbol
            ctx.fillStyle = '#22D3EE';
            ctx.fillRect(-4, -4, 8, 8);
        } else if (obj.type === 'HAZARD') {
            ctx.fillStyle = '#EF4444';
            ctx.strokeStyle = '#DC2626';
            ctx.lineWidth = 2;

            if (obj.hazardType === 'SPIKE') {
                // Triangle Spike
                ctx.beginPath();
                ctx.moveTo(0, -obj.size / 2);
                ctx.lineTo(obj.size / 2, obj.size / 2);
                ctx.lineTo(-obj.size / 2, obj.size / 2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else if (obj.hazardType === 'ROTATE_DIAMOND') {
                // Cross/Star Hazard
                ctx.beginPath();
                ctx.moveTo(0, -obj.size / 2);
                ctx.lineTo(obj.size / 4, -obj.size / 4);
                ctx.lineTo(obj.size / 2, 0);
                ctx.lineTo(obj.size / 4, obj.size / 4);
                ctx.lineTo(0, obj.size / 2);
                ctx.lineTo(-obj.size / 4, obj.size / 4);
                ctx.lineTo(-obj.size / 2, 0);
                ctx.lineTo(-obj.size / 4, -obj.size / 4);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else {
                // Solid Block
                ctx.fillRect(-obj.size / 2, -obj.size / 2, obj.size, obj.size);
                ctx.strokeRect(-obj.size / 2, -obj.size / 2, obj.size, obj.size);
            }
        }

        ctx.restore();
    }

    function drawParticles() {
        particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    // Initialize on window load
    window.addEventListener('load', init);
})();
