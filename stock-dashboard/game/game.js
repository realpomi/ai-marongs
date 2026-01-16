// Matter.js 모듈
const { Engine, Render, Runner, Bodies, Body, Composite, Events, Mouse, Vector } = Matter;

// 게임 설정
const CONFIG = {
    width: 360,
    height: 640,
    ballRadius: 10,
    maxPullDistance: 50,   // 당기는 거리 1/2 축소
    launchPower: 0.36,     // 힘 2배로 보정
    trajectoryPoints: 40,
    groundHeight: 180  // 하단 바닥 (약간 축소)
};

// 게임 상태
const state = {
    currentStage: 1,
    attempts: 0,  // 시도 횟수
    isDragging: false,
    currentBall: null,
    launchPos: { x: 70, y: 430 },  // 왼쪽에 배치
    aimPos: { x: 70, y: 430 },
    isLaunched: false,
    cleared: false,
    ballTrail: []  // 공의 이동 궤적
};

// Matter.js 엔진 설정
const engine = Engine.create();
const world = engine.world;
engine.world.gravity.y = 1;

// 렌더러 설정
const canvas = document.getElementById('game');
const render = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
        width: CONFIG.width,
        height: CONFIG.height,
        wireframes: false,
        background: '#16213e'
    }
});

// 스테이지 데이터 (세로 화면: 360x640, 9:16 비율)
const stages = [
    {
        // Stage 1: 기본 - 위로 쏴서 골인
        goal: { x: 310, y: 270, width: 60, height: 40 },
        obstacles: [],
        platforms: []
    },
    {
        // Stage 2: 장애물 피하기
        goal: { x: 300, y: 250, width: 60, height: 40 },
        obstacles: [
            { x: 180, y: 300, width: 105, height: 12, restitution: 3.2 }
        ],
        platforms: [
        ]
    },
    {
        // Stage 3: 벽 반사
        goal: { x: 300, y: 400, width: 60, height: 40 },
        obstacles: [],
        platforms: [
            { x: 200, y: 350, width: 140, height: 12, restitution: 1.05 }  // 통통 튀는 판
        ]
    },
    {
        // Stage 4: 좁은 틈 통과
        goal: { x: 290, y: 100, width: 60, height: 40 },
        obstacles: [
            { x: 180, y: 230, width: 12, height: 130 },
            { x: 250, y: 170, width: 12, height: 130 }
        ],
        platforms: []
    },
    {
        // Stage 5: 경사면 이용
        goal: { x: 300, y: 160, width: 60, height: 40 },
        obstacles: [
            { x: 200, y: 190, width: 100, height: 12, angle: 0.3 }
        ],
        platforms: [
            { x: 110, y: 280, width: 90, height: 12, angle: -0.2, restitution: 1.05 }
        ]
    },
    {
        // Stage 6: 탄성 계단
        goal: { x: 90, y: 160, width: 60, height: 40 },
        obstacles: [],
        platforms: [
            { x: 280, y: 160, width: 12, height: 120 },
        ]
    },
    {
        // Stage 7: 장애물 미로
        goal: { x: 240, y: 430, width: 60, height: 40 },
        obstacles: [
            { x: 120, y: 200, width: 120, height: 12 },
            { x: 240, y: 300, width: 120, height: 12 },
            { x: 120, y: 400, width: 120, height: 12 }
        ],
        platforms: []
    },
    {
        // Stage 8: 벽 반사 골인
        goal: { x: 190, y: 400, width: 50, height: 40 },
        obstacles: [
            { x: 100, y: 320, width: 12, height: 180 }
        ],
        platforms: [
            { x: 280, y: 300, width: 100, height: 12, angle: -0.3, restitution: 4.05 }
        ]
    },
    {
        // Stage 9: 복합 퍼즐
        goal: { x: 300, y: 420, width: 60, height: 40 },
        obstacles: [
            { x: 180, y: 150, width: 100, height: 12 },
            { x: 280, y: 250, width: 12, height: 80 }
        ],
        platforms: [
            { x: 100, y: 350, width: 80, height: 12, angle: 0.2, restitution: 1.05 },
            { x: 250, y: 350, width: 80, height: 12, angle: -0.2, restitution: 1.05 }
        ]
    },
    {
        // Stage 10: 최종 스테이지
        goal: { x: 180, y: 360, width: 50, height: 35 },
        obstacles: [
            { x: 100, y: 150, width: 80, height: 12, angle: -0.2 },
            { x: 260, y: 150, width: 80, height: 12, angle: 0.2 },
            { x: 180, y: 250, width: 12, height: 100 }
        ],
        platforms: [
            { x: 80, y: 380, width: 70, height: 12, restitution: 1.05 },
            { x: 280, y: 380, width: 70, height: 12, restitution: 1.05 },
            { x: 180, y: 450, width: 100, height: 12, angle: 0, restitution: 1.05 }
        ]
    }
];

// 골대 생성
let goalSensor = null;

function createGoal(goalData) {
    const { x, y, width, height } = goalData;

    // 골대 프레임 - 위는 뚫리고 아래는 막힘 (바구니 형태)
    const leftPost = Bodies.rectangle(x - width / 2, y, 8, height, {
        isStatic: true,
        render: { fillStyle: '#f59e0b' }
    });
    const rightPost = Bodies.rectangle(x + width / 2, y, 8, height, {
        isStatic: true,
        render: { fillStyle: '#f59e0b' }
    });
    // 바닥 (아래 막힘)
    const bottom = Bodies.rectangle(x, y + height / 2 - 4, width + 8, 8, {
        isStatic: true,
        render: { fillStyle: '#f59e0b' }
    });

    // 골 감지 센서 (바닥 근처에 배치)
    goalSensor = Bodies.rectangle(x, y + height / 2 - 20, width - 16, 20, {
        isStatic: true,
        isSensor: true,
        label: 'goal',
        render: {
            fillStyle: 'rgba(74, 222, 128, 0.15)',
            strokeStyle: 'transparent'
        }
    });

    Composite.add(world, [leftPost, rightPost, bottom, goalSensor]);
}

// 장애물 생성
function createObstacles(obstacles) {
    obstacles.forEach(obs => {
        const obstacle = Bodies.rectangle(obs.x, obs.y, obs.width, obs.height, {
            isStatic: true,
            angle: obs.angle || 0,
            render: { fillStyle: obs.restitution > 0.95 ? '#f59e0b' : '#ef4444' },
            restitution: obs.restitution || 0.95
        });
        Composite.add(world, obstacle);
    });
}

// 플랫폼 생성
function createPlatforms(platforms) {
    platforms.forEach(plat => {
        const isBouncy = plat.restitution && plat.restitution > 0.9;
        const platform = Bodies.rectangle(plat.x, plat.y, plat.width, plat.height, {
            isStatic: true,
            angle: plat.angle || 0,
            label: isBouncy ? 'bouncyPlatform' : 'platform',
            render: { fillStyle: isBouncy ? '#f59e0b' : '#475569' },
            restitution: plat.restitution || 0.9
        });
        Composite.add(world, platform);
    });
}

// 벽과 바닥 생성
function createWalls() {
    const wallOptions = {
        isStatic: true,
        restitution: 0.95,  // 벽 반발력 높임
        render: { fillStyle: '#334155' }
    };

    // 좌우 벽
    const leftWall = Bodies.rectangle(-10, CONFIG.height / 2, 20, CONFIG.height, wallOptions);
    const rightWall = Bodies.rectangle(CONFIG.width + 10, CONFIG.height / 2, 20, CONFIG.height, wallOptions);
    // 천장
    const ceiling = Bodies.rectangle(CONFIG.width / 2, -10, CONFIG.width, 20, wallOptions);

    // 하단 1/3 바닥 영역
    const groundY = CONFIG.height - CONFIG.groundHeight / 2;
    const ground = Bodies.rectangle(CONFIG.width / 2, groundY, CONFIG.width, CONFIG.groundHeight, {
        isStatic: true,
        render: { fillStyle: '#2d3748' },
        restitution: 0.7  // 바닥 반발력도 높임
    });

    // 바닥 상단 라인 (시각적 구분)
    const groundLine = Bodies.rectangle(CONFIG.width / 2, CONFIG.height - CONFIG.groundHeight, CONFIG.width, 4, {
        isStatic: true,
        render: { fillStyle: '#4a5568' }
    });

    Composite.add(world, [leftWall, rightWall, ceiling, ground, groundLine]);
}

// 공 생성
function createBall() {
    if (state.currentBall) {
        Composite.remove(world, state.currentBall);
    }

    state.currentBall = Bodies.circle(state.launchPos.x, state.launchPos.y, CONFIG.ballRadius, {
        restitution: 0.9,
        friction: 0.02,
        frictionAir: 0.008,
        density: 0.002,
        label: 'ball',
        render: {
            fillStyle: '#3b82f6',
            strokeStyle: '#60a5fa',
            lineWidth: 3
        }
    });

    // 공을 정지 상태로 시작
    Body.setStatic(state.currentBall, true);
    Composite.add(world, state.currentBall);
    state.isLaunched = false;
}

// 스테이지 로드
function loadStage(stageNum) {
    // 기존 객체 제거
    Composite.clear(world);

    const stageData = stages[stageNum - 1];
    if (!stageData) {
        showMessage('All Stages Clear!');
        return;
    }

    state.currentStage = stageNum;
    state.cleared = false;

    // 시작 위치 설정 (스테이지별 또는 기본값)
    const defaultPos = { x: 70, y: 430 };
    state.launchPos = stageData.startPos || defaultPos;
    state.aimPos = { ...state.launchPos };

    createWalls();
    createGoal(stageData.goal);
    createObstacles(stageData.obstacles);
    createPlatforms(stageData.platforms);
    createBall();

    // 발사대 표시
    const launchPad = Bodies.circle(state.launchPos.x, state.launchPos.y, 25, {
        isStatic: true,
        isSensor: true,
        render: {
            fillStyle: 'rgba(59, 130, 246, 0.3)',
            strokeStyle: '#3b82f6',
            lineWidth: 2
        }
    });
    Composite.add(world, launchPad);

    updateUI();
}

// UI 업데이트
function updateUI() {
    document.getElementById('stage-num').textContent = state.currentStage;
    document.getElementById('attempts').textContent = state.attempts;
}

// 메시지 표시
function showMessage(text, duration = 2000) {
    const msgEl = document.getElementById('message');
    msgEl.textContent = text;
    msgEl.style.display = 'block';

    if (duration > 0) {
        setTimeout(() => {
            msgEl.style.display = 'none';
        }, duration);
    }
}

// 궤적 계산 및 포물선 표시 (힘에 비례한 길이)
function drawTrajectory(ctx, startPos, velocity, power) {
    const gravityY = 0.001;
    const timeStep = 1;
    const maxLength = power * 150;  // 힘 %에 비례한 최대 길이

    ctx.save();

    let pos = { x: startPos.x, y: startPos.y };
    let vel = { x: velocity.x, y: velocity.y };
    let totalLength = 0;
    let prevPos = { x: pos.x, y: pos.y };

    // 포물선 경로 그리기
    ctx.beginPath();
    ctx.moveTo(startPos.x, startPos.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);

    for (let i = 0; i < 200; i++) {
        vel.y += gravityY * timeStep;
        pos.x += vel.x * timeStep;
        pos.y += vel.y * timeStep;

        // 이동 거리 누적
        totalLength += Math.hypot(pos.x - prevPos.x, pos.y - prevPos.y);
        prevPos = { x: pos.x, y: pos.y };

        // 힘에 비례한 길이만큼만 그리기
        if (totalLength > maxLength) {
            break;
        }
        // 바닥에 닿으면 중단
        if (pos.y > CONFIG.height - CONFIG.groundHeight) {
            break;
        }
        // 화면 밖으로 나가면 중단
        if (pos.x < 0 || pos.x > CONFIG.width) {
            break;
        }

        ctx.lineTo(pos.x, pos.y);
    }

    ctx.stroke();
    ctx.restore();
}

// 조준선 그리기 (공 → 마우스: 실선)
function drawAimLine(ctx, ballPos, aimPos) {
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;

    // 공에서 조준점까지 실선
    ctx.beginPath();
    ctx.moveTo(ballPos.x, ballPos.y);
    ctx.lineTo(aimPos.x, aimPos.y);
    ctx.stroke();

    ctx.restore();
}

// 마우스 이벤트 처리
let mousePos = { x: 0, y: 0 };
let dragStart = null;

canvas.addEventListener('mousedown', (e) => {
    if (state.isLaunched || state.cleared) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 공 근처 클릭 확인
    const ballPos = state.currentBall.position;
    const dist = Math.hypot(x - ballPos.x, y - ballPos.y);

    if (dist < CONFIG.ballRadius * 3) {
        state.isDragging = true;
        dragStart = { x, y };
    }
});

// window에서 마우스 이벤트 처리 (캔버스 밖에서도 드래그 유지)
window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;

    if (state.isDragging && !state.isLaunched) {
        // 드래그 거리 제한 (조준 위치만 업데이트, 공은 고정)
        const dx = state.launchPos.x - mousePos.x;
        const dy = state.launchPos.y - mousePos.y;
        const dist = Math.hypot(dx, dy);

        if (dist > CONFIG.maxPullDistance) {
            const angle = Math.atan2(dy, dx);
            state.aimPos.x = state.launchPos.x - Math.cos(angle) * CONFIG.maxPullDistance;
            state.aimPos.y = state.launchPos.y - Math.sin(angle) * CONFIG.maxPullDistance;
        } else {
            state.aimPos.x = mousePos.x;
            state.aimPos.y = mousePos.y;
        }
    }
});

window.addEventListener('mouseup', () => {
    if (state.isDragging && !state.isLaunched) {
        launchBall();
    }
    state.isDragging = false;
    dragStart = null;
});

// 터치 이벤트 (모바일)
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    canvas.dispatchEvent(new MouseEvent('mouseup'));
});

// 공 발사
function launchBall() {
    if (state.isLaunched || state.cleared) return;

    // 조준 위치 기반으로 발사 방향 계산 (공은 launchPos에 고정)
    const dx = state.launchPos.x - state.aimPos.x;
    const dy = state.launchPos.y - state.aimPos.y;

    // 최소 드래그 거리 확인
    if (Math.hypot(dx, dy) < 10) {
        return;
    }

    // 발사
    Body.setStatic(state.currentBall, false);
    const velocity = {
        x: dx * CONFIG.launchPower,
        y: dy * CONFIG.launchPower
    };
    Body.setVelocity(state.currentBall, velocity);

    state.isLaunched = true;
    state.attempts++;
    state.ballTrail = [];  // 궤적 초기화
    updateUI();
}

// 골 체크
Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
        const labels = [pair.bodyA.label, pair.bodyB.label];

        if (labels.includes('ball') && labels.includes('goal')) {
            if (!state.cleared) {
                state.cleared = true;

                // 공을 거의 멈춤
                const ball = pair.bodyA.label === 'ball' ? pair.bodyA : pair.bodyB;
                Body.setVelocity(ball, { x: 0, y: 0.5 });

                showMessage('Stage Clear!', 1500);

                setTimeout(() => {
                    state.ballTrail = [];  // 스테이지 넘어갈 때 궤적 클리어
                    loadStage(state.currentStage + 1);
                }, 2000);
            }
        }

        // 탄성 플랫폼 충돌 처리
        if (labels.includes('ball') && labels.includes('bouncyPlatform')) {
            const ball = pair.bodyA.label === 'ball' ? pair.bodyA : pair.bodyB;
            const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
            const minBounceSpeed = 5;  // 최소 튕김 속도

            if (speed < minBounceSpeed) {
                // 속도가 낮으면 강제로 튕김 + 진행방향 가속
                const direction = ball.velocity.x >= 0 ? 1 : -1;
                const minXSpeed = 2;
                const newX = Math.abs(ball.velocity.x) < minXSpeed
                    ? direction * minXSpeed
                    : ball.velocity.x * 1.5;

                Body.setVelocity(ball, {
                    x: newX,
                    y: -minBounceSpeed
                });
            }
        }
    });
});

// 공이 화면 밖으로 나가거나 멈췄을 때 체크
function checkBallStatus() {
    if (!state.isLaunched || state.cleared) return;

    const ball = state.currentBall;
    const pos = ball.position;
    const vel = ball.velocity;

    // 공의 위치를 궤적에 기록
    state.ballTrail.push({ x: pos.x, y: pos.y });

    // 화면 밖으로 나감
    const outOfBounds = pos.y > CONFIG.height + 100 ||
        pos.x < -100 ||
        pos.x > CONFIG.width + 100;

    // 공이 거의 멈춤
    const stopped = Math.abs(vel.x) < 0.1 && Math.abs(vel.y) < 0.1;

    if (outOfBounds || (stopped && state.isLaunched)) {
        setTimeout(() => {
            if (!state.cleared) {
                createBall();
            }
        }, 500);
    }
}

// 커스텀 렌더링 (궤적, 슬링샷 라인)
Events.on(render, 'afterRender', () => {
    const ctx = render.context;

    // 공의 이동 궤적 그리기 (노란색 점)
    if (state.ballTrail.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(250, 204, 21, 0.7)';

        for (let i = 0; i < state.ballTrail.length; i += 3) {  // 3개마다 점 표시
            ctx.beginPath();
            ctx.arc(state.ballTrail[i].x, state.ballTrail[i].y, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    if (state.isDragging && !state.isLaunched && state.currentBall) {
        const ballPos = state.launchPos;  // 공은 항상 발사대 위치

        // 힘 계산
        const dx = state.launchPos.x - state.aimPos.x;
        const dy = state.launchPos.y - state.aimPos.y;
        const dist = Math.hypot(dx, dy);
        const power = Math.min(dist / CONFIG.maxPullDistance, 1);

        // 조준선 (공 → 마우스 반대 방향)
        drawAimLine(ctx, ballPos, state.aimPos);

        // 궤적 미리보기 (힘에 비례한 길이)
        const velocity = {
            x: dx * CONFIG.launchPower,
            y: dy * CONFIG.launchPower
        };
        drawTrajectory(ctx, ballPos, velocity, power);

        // 조준점 표시
        ctx.save();
        ctx.beginPath();
        ctx.arc(state.aimPos.x, state.aimPos.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // 힘 표시기
        ctx.save();
        ctx.fillStyle = `hsl(${120 - power * 120}, 80%, 50%)`;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${Math.round(power * 100)}%`, state.launchPos.x + 25, state.launchPos.y - 20);
        ctx.restore();
    }
});

// 게임 루프에 상태 체크 추가
Events.on(engine, 'afterUpdate', () => {
    checkBallStatus();
});

// 재시작 버튼
document.getElementById('restart-btn').addEventListener('click', () => {
    loadStage(state.currentStage);
});

// 게임 시작
Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);
loadStage(1);
