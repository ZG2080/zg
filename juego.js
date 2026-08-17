const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwWS3Iv8V7P_Wly7cgWPSV-GXbWVfB8vvjjg3LVQia7D7dSM38jTCl7gZOD9LT8Ieh8/exec';

// ===== ESTADO DEL JUEGO =====
const partida = {
  estado: 'inicio',
  dni: '',
  nombreJugador: '',
  puntos: 0,
  vidas: 3,
  oleada: 1,
  tiempoRestante: 20 * 60, // segundos
  jefeMuerto: false,
  jefaAparecido: false,
  gasRadio: 0, // radio del area segura
  gasActivo: false,
  gameLoop: null,
  timerInterval: null,
  isMobile: false,
  dañoCooldown: 0,
  esperandoOleada: false,
  oleadaUltimoDropBomba: 0
};

// Entidades
let jugador = {};
let balas = [];
let enemigos = [];
let particulas = [];
let bombasPickup = [];
let jefe = null;

// Input: estado de controles agrupado en un solo objeto
const controles = {
  keys: {},
  joystickDir: { x: 0, y: 0 },
  joystickActivo: false,
  joystickOrigen: { x: 0, y: 0 },
  joystickMiraActivo: false,
  joystickMiraOrigen: { x: 0, y: 0 },
  miraAngMovil: 0,
  disparoAutoInterval: null,
  mousePos: { x: 0, y: 0 },
  joystickIdMover: null,
  joystickIdMira: null
};
canvas.addEventListener('mousemove', e => { controles.mousePos.x = e.clientX; controles.mousePos.y = e.clientY; });
canvas.addEventListener('click', () => disparar());

// ===== RESIZE =====
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  partida.gasRadio = Math.min(canvas.width, canvas.height) * 0.5;
}
window.addEventListener('resize', resize);
resize();

// ===== DETECCIÓN MÓVIL =====
partida.isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent) || window.innerWidth < 768;
if (partida.isMobile) document.getElementById('controles-movil').classList.add('visible');

// Mostrar ranking en pantalla inicial al cargar
mostrarRankingEnPantalla('inicio-ranking');

// ===== TECLADO =====
document.addEventListener('keydown', e => {
  controles.keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); disparar(); }
  if (e.code === 'KeyE') { e.preventDefault(); usarBomba(); }
});
document.addEventListener('keyup', e => controles.keys[e.code] = false);

// ===== JOYSTICK =====
const joystickArea = document.getElementById('joystick-area');
const joystickThumb = document.getElementById('joystick-thumb');

joystickArea.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  controles.joystickIdMover = t.identifier;
  const rect = joystickArea.getBoundingClientRect();
  controles.joystickOrigen = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
  controles.joystickActivo = true;
}, { passive: false });

joystickArea.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!controles.joystickActivo) return;
  const t = Array.from(e.touches).find(t => t.identifier === controles.joystickIdMover);
  if (!t) return;
  const dx = t.clientX - controles.joystickOrigen.x;
  const dy = t.clientY - controles.joystickOrigen.y;
  const dist = Math.min(Math.sqrt(dx*dx+dy*dy), 40);
  const ang = Math.atan2(dy, dx);
  controles.joystickDir = { x: Math.cos(ang) * (dist/40), y: Math.sin(ang) * (dist/40) };
  joystickThumb.style.transform = `translate(calc(-50% + ${Math.cos(ang)*dist}px), calc(-50% + ${Math.sin(ang)*dist}px))`;
}, { passive: false });

joystickArea.addEventListener('touchend', e => {
  const t = Array.from(e.changedTouches).find(t => t.identifier === controles.joystickIdMover);
  if (!t) return;
  controles.joystickIdMover = null;
  controles.joystickActivo = false;
  controles.joystickDir = { x: 0, y: 0 };
  joystickThumb.style.transform = 'translate(-50%, -50%)';
});

// ===== JOYSTICK DERECHO: apuntar y disparar en celular =====
const joystickMiraArea = document.getElementById('joystick-mira-area');
const joystickMiraThumb = document.getElementById('joystick-mira-thumb');

joystickMiraArea.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  controles.joystickIdMira = t.identifier;
  const rect = joystickMiraArea.getBoundingClientRect();
  controles.joystickMiraOrigen = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
  controles.joystickMiraActivo = true;
  if (!controles.disparoAutoInterval) controles.disparoAutoInterval = setInterval(() => { if (controles.joystickMiraActivo) disparar(); }, 130);
}, { passive: false });

joystickMiraArea.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!controles.joystickMiraActivo) return;
  const t = Array.from(e.touches).find(t => t.identifier === controles.joystickIdMira);
  if (!t) return;
  const dx = t.clientX - controles.joystickMiraOrigen.x;
  const dy = t.clientY - controles.joystickMiraOrigen.y;
  const dist = Math.min(Math.sqrt(dx*dx+dy*dy), 35);
  const ang = Math.atan2(dy, dx);
  controles.miraAngMovil = ang;
  jugador.ang = ang;
  joystickMiraThumb.style.transform = `translate(calc(-50% + ${Math.cos(ang)*dist}px), calc(-50% + ${Math.sin(ang)*dist}px))`;
}, { passive: false });

joystickMiraArea.addEventListener('touchend', e => {
  const t = Array.from(e.changedTouches).find(t => t.identifier === controles.joystickIdMira);
  if (!t) return;
  controles.joystickIdMira = null;
  controles.joystickMiraActivo = false;
  joystickMiraThumb.style.transform = 'translate(-50%, -50%)';
  clearInterval(controles.disparoAutoInterval);
  controles.disparoAutoInterval = null;
});

// ===== INICIAR JUEGO =====
async function iniciarJuego() {
  partida.dni = document.getElementById('input-dni').value.trim();
  if (!partida.dni || partida.dni.length < 7) { alert('Por favor ingresá tu DNI válido'); return; }

  partida.nombreJugador = '';
  try {
    const resp = await fetch(`${APPS_SCRIPT_URL}?accion=cliente&dni=${encodeURIComponent(partida.dni)}`);
    const data = await resp.json();
    if (data.encontrado) partida.nombreJugador = data.nombre || '';
  } catch (e) {
    console.error('No se pudo obtener el nombre del cliente:', e);
  }

  document.getElementById('pantalla-inicio').classList.add('oculta');
  document.getElementById('hud').style.display = 'flex';

  document.getElementById('hud-dni').textContent = partida.dni;

  resetJuego();
  partida.estado = 'jugando';
  partida.gameLoop = requestAnimationFrame(update);
  partida.timerInterval = setInterval(tickTimer, 1000);
}

function resetJuego() {
  partida.puntos = 0;
  partida.vidas = 3;
  partida.oleada = 1;
  partida.tiempoRestante = 20 * 60;
  partida.jefeMuerto = false;
  partida.jefaAparecido = false;
  partida.gasActivo = false;
  partida.esperandoOleada = false;
  balas = [];
  enemigos = [];
  particulas = [];
  jefe = null;
  partida.gasRadio = Math.min(canvas.width, canvas.height) * 0.52;

  jugador = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    r: 14,
    vel: 2.727 * (partida.isMobile ? 0.72 : 1),
    ang: 0,
    cooldown: 0,
    bombas: 10
  };

  bombasPickup = [];
  partida.oleadaUltimoDropBomba = 0;

  actualizarHUD();
  spawnOleada();
}

// ===== TIMER =====
function tickTimer() {
  if (partida.estado !== 'jugando') return;
  partida.tiempoRestante--;

  // Gas desactivado

  // Jefe al minuto 15 (5 minutos restantes)
  if (partida.tiempoRestante === 5 * 60 && !partida.jefaAparecido) {
    mostrarBossWarning();
  }

  if (partida.tiempoRestante <= 0) terminarJuego('tiempo');

  actualizarHUD();
}

function mostrarBossWarning() {
  partida.jefaAparecido = true;
  const bw = document.getElementById('boss-warning');
  bw.style.display = 'block';
  setTimeout(() => {
    bw.style.display = 'none';
    spawnJefe();
  }, 3000);
}

// ===== HUD =====
function actualizarHUD() {
  document.getElementById('hud-score').textContent = partida.puntos;
  document.getElementById('hud-oleada').textContent = partida.oleada;
  const mins = Math.floor(partida.tiempoRestante / 60);
  const segs = partida.tiempoRestante % 60;
  const tiempoEl = document.getElementById('hud-tiempo');
  tiempoEl.textContent = `${mins}:${segs.toString().padStart(2,'0')}`;
  tiempoEl.className = 'hud-val tiempo-val' + (partida.tiempoRestante < 60 ? ' urgente' : '');

  let vidasStr = '';
  for (let i = 0; i < 3; i++) vidasStr += i < partida.vidas ? '♥' : '♡';
  document.getElementById('hud-vidas').textContent = vidasStr;

  document.getElementById('hud-bombas').textContent = jugador.bombas ?? 10;

  // Gas warning visual
  const gw = document.getElementById('gas-warning');
  gw.className = partida.gasActivo ? 'activo' : '';
}

// ===== SPAWN =====
function spawnOleada() {
  const cant = 2 + Math.floor(partida.oleada * 1.2);
  for (let i = 0; i < cant; i++) {
    setTimeout(() => spawnEnemigo(), i * 300);
  }
}

function spawnEnemigo() {
  const lado = Math.floor(Math.random() * 4);
  let x, y;
  if (lado === 0) { x = Math.random() * canvas.width; y = -20; }
  else if (lado === 1) { x = canvas.width + 20; y = Math.random() * canvas.height; }
  else if (lado === 2) { x = Math.random() * canvas.width; y = canvas.height + 20; }
  else { x = -20; y = Math.random() * canvas.height; }

  const velBase = 0.6 + partida.oleada * 0.12 + Math.random() * 0.4;
  const multiplicadorRonda = Math.pow(1.01, partida.oleada - 1); // +1% acumulativo por ronda
  const factorMovil = partida.isMobile ? 0.72 : 1; // misma escala que la velocidad del jugador en celular, para mantener la relación de velocidades igual que en PC

  enemigos.push({
    x, y,
    r: 12,
    vel: velBase * multiplicadorRonda * factorMovil,
    hp: 1 + Math.floor(partida.oleada / 3),
    maxHp: 1 + Math.floor(partida.oleada / 3),
    tipo: 'normal'
  });
}

function spawnJefe() {
  jefe = {
    x: Math.random() > 0.5 ? 80 : canvas.width - 80,
    y: Math.random() > 0.5 ? 80 : canvas.height - 80,
    r: 40,
    vel: 0.95 * (partida.isMobile ? 0.72 : 1),
    hp: 80,
    maxHp: 80,
    tipo: 'jefe',
    ataque: 0,
    fase: 1
  };
}

// ===== DISPARO =====
function disparar() {
  if (partida.estado !== 'jugando') return;
  if (jugador.cooldown > 0) return;
  jugador.cooldown = 12;

  // Usar ángulo actual del jugador (apunta hacia mouse o dirección de movimiento)
  const ang = jugador.ang;
  balas.push({
    x: jugador.x + Math.cos(ang) * (jugador.r + 6),
    y: jugador.y + Math.sin(ang) * (jugador.r + 6),
    vx: Math.cos(ang) * 7.5,
    vy: Math.sin(ang) * 7.5,
    ang: ang,
    r: 5,
    vida: 250
  });
}

// ===== BOMBA =====
function usarBomba() {
  if (partida.estado !== 'jugando') return;
  if (jugador.bombas <= 0) return;
  jugador.bombas--;
  actualizarHUD();

  const RADIO_BOMBA = 240; // triple del radio anterior (80 -> 240)
  const DAÑO_BOMBA = 2;

  crearExplosion(jugador.x, jugador.y, '#ffd700');
  crearExplosion(jugador.x, jugador.y, '#ff9900');

  enemigos = enemigos.filter(e => {
    const dist = Math.sqrt((jugador.x - e.x) ** 2 + (jugador.y - e.y) ** 2);
    if (dist < RADIO_BOMBA) {
      e.hp -= DAÑO_BOMBA;
      if (e.hp <= 0) {
        crearExplosion(e.x, e.y, '#ff4444');
        partida.puntos += 10 * partida.oleada;
        intentarDropearBomba(e.x, e.y);
        actualizarHUD();
        return false;
      }
    }
    return true;
  });

  if (jefe) {
    const dist = Math.sqrt((jugador.x - jefe.x) ** 2 + (jugador.y - jefe.y) ** 2);
    if (dist < RADIO_BOMBA) {
      jefe.hp -= DAÑO_BOMBA;
      crearExplosion(jefe.x, jefe.y, '#ff6600');
      if (jefe.hp <= 0) {
        crearExplosion(jefe.x, jefe.y, '#ffd700');
        partida.puntos += 500;
        partida.jefeMuerto = true;
        jefe = null;
        actualizarHUD();
      }
    }
  }
}

// ===== PICKUPS DE BOMBA (drop al matar enemigos) =====
function intentarDropearBomba(x, y) {
  if (jugador.bombas >= 10) return; // tope de 10 bombas
  if (partida.oleada - partida.oleadaUltimoDropBomba < 2) return; // máximo 1 cada 2 oleadas
  if (Math.random() > 0.15) return; // chance de drop
  partida.oleadaUltimoDropBomba = partida.oleada;
  bombasPickup.push({ x, y, r: 10, vida: 600 });
}

function moverBombasPickup() {
  bombasPickup = bombasPickup.filter(p => p.vida > 0);
  bombasPickup.forEach(p => {
    p.vida--;
    const dist = Math.sqrt((jugador.x - p.x) ** 2 + (jugador.y - p.y) ** 2);
    if (dist < jugador.r + p.r) {
      p.vida = 0;
      jugador.bombas = Math.min(10, jugador.bombas + 1);
      actualizarHUD();
    }
  });
}

function dibujarBombasPickup() {
  bombasPickup.forEach(p => {
    ctx.save();
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💣', p.x, p.y);
    ctx.restore();
  });
}

// ===== GAME LOOP =====
function update() {
  if (partida.estado !== 'jugando') return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  dibujarFondo();
  moverJugador();
  moverBalas();
  moverEnemigos();
  moverJefe();
  moverBombasPickup();
  verificarColisiones();
  dibujarGas();
  dibujarParticulas();
  dibujarBalas();
  dibujarBombasPickup();
  dibujarEnemigos();
  dibujarJefe();
  dibujarJugador();
  verificarOleada();

  if (jugador.cooldown > 0) jugador.cooldown--;

  partida.gameLoop = requestAnimationFrame(update);
}

// ===== FONDO =====
function dibujarFondo() {
  ctx.fillStyle = '#0a0f0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.strokeStyle = 'rgba(45,106,79,0.15)';
  ctx.lineWidth = 0.5;
  const gridSize = 40;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
}

// ===== JUGADOR =====
function moverJugador() {
  let dx = 0, dy = 0;

  if (controles.keys['ArrowLeft'] || controles.keys['KeyA']) dx -= 1;
  if (controles.keys['ArrowRight'] || controles.keys['KeyD']) dx += 1;
  if (controles.keys['ArrowUp'] || controles.keys['KeyW']) dy -= 1;
  if (controles.keys['ArrowDown'] || controles.keys['KeyS']) dy += 1;

  if (controles.joystickActivo) { dx = controles.joystickDir.x; dy = controles.joystickDir.y; }

  const mag = Math.sqrt(dx*dx + dy*dy);
  if (mag > 0) {
    dx /= mag; dy /= mag;
    // Desde la ronda 10, el jugador gana +1% de velocidad acumulativo por ronda (igual que los enemigos)
    const multiplicadorVelJugador = partida.oleada > 10 ? Math.pow(1.01, partida.oleada - 10) : 1;
    jugador.x += dx * jugador.vel * multiplicadorVelJugador;
    jugador.y += dy * jugador.vel * multiplicadorVelJugador;
  }

  // Apuntar: en PC siempre sigue al mouse (incluso mientras te movés); en celular sigue el joystick derecho, o la dirección de movimiento si no lo está usando
  if (!partida.isMobile) {
    jugador.ang = Math.atan2(controles.mousePos.y - jugador.y, controles.mousePos.x - jugador.x);
  } else if (controles.joystickMiraActivo) {
    jugador.ang = controles.miraAngMovil;
  } else if (mag > 0) {
    jugador.ang = Math.atan2(dy, dx);
  }

  // Límites del canvas
  jugador.x = Math.max(jugador.r, Math.min(canvas.width - jugador.r, jugador.x));
  jugador.y = Math.max(jugador.r, Math.min(canvas.height - jugador.r, jugador.y));

  // Gas desactivado
}

function dibujarJugador() {
  ctx.save();
  ctx.translate(jugador.x, jugador.y);

  // Sombra
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 15;

  // Cuerpo
  ctx.fillStyle = '#52b788';
  ctx.beginPath();
  ctx.arc(0, 0, jugador.r, 0, Math.PI * 2);
  ctx.fill();

  // Cañón
  ctx.fillStyle = '#2d6a4f';
  ctx.save();
  ctx.rotate(jugador.ang);
  ctx.fillRect(0, -4, jugador.r + 8, 8);
  ctx.restore();

  // Centro
  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ===== BALAS =====
function moverBalas() {
  balas = balas.filter(b => b.vida > 0);
  balas.forEach(b => {
    b.x += b.vx;
    b.y += b.vy;
    b.vida--;
    if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) b.vida = 0;
  });
}

function dibujarBalas() {
  balas.forEach(b => {
    ctx.save();
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ===== ENEMIGOS =====
function moverEnemigos() {
  enemigos.forEach(e => {
    const ang = Math.atan2(jugador.y - e.y, jugador.x - e.x);
    let dx = Math.cos(ang) * e.vel;
    let dy = Math.sin(ang) * e.vel;

    // Separación: empuja levemente a los enemigos cercanos entre sí para que no se amontonen en fila
    let sepX = 0, sepY = 0;
    enemigos.forEach(otro => {
      if (otro === e) return;
      const ddx = e.x - otro.x;
      const ddy = e.y - otro.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const distMin = e.r + otro.r + 14;
      if (dist > 0 && dist < distMin) {
        const fuerza = (distMin - dist) / distMin;
        sepX += (ddx / dist) * fuerza;
        sepY += (ddy / dist) * fuerza;
      }
    });

    e.x += dx + sepX * e.vel;
    e.y += dy + sepY * e.vel;
  });
}

function dibujarEnemigos() {
  enemigos.forEach(e => {
    ctx.save();
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur = 10;

    // Barra de vida
    if (e.maxHp > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r*2, 4);
      ctx.fillStyle = '#ff3333';
      ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r*2*(e.hp/e.maxHp), 4);
    }

    ctx.fillStyle = '#cc2222';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff6666';
    ctx.beginPath();
    ctx.arc(e.x - 3, e.y - 3, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });
}

// ===== JEFE =====
function moverJefe() {
  if (!jefe) return;

  const ang = Math.atan2(jugador.y - jefe.y, jugador.x - jefe.x);
  const vel = jefe.fase === 2 ? jefe.vel * 1.8 : jefe.vel;
  jefe.x += Math.cos(ang) * vel;
  jefe.y += Math.sin(ang) * vel;

  if (jefe.hp < jefe.maxHp * 0.4) jefe.fase = 2;
}

function dibujarJefe() {
  if (!jefe) return;
  ctx.save();

  ctx.shadowColor = jefe.fase === 2 ? '#ff0000' : '#ff6600';
  ctx.shadowBlur = 30;

  // Cuerpo
  ctx.fillStyle = jefe.fase === 2 ? '#8b0000' : '#cc4400';
  ctx.beginPath();
  ctx.arc(jefe.x, jefe.y, jefe.r, 0, Math.PI * 2);
  ctx.fill();

  // Barra de vida
  const barW = 100;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(jefe.x - barW/2, jefe.y - jefe.r - 14, barW, 8);
  ctx.fillStyle = jefe.fase === 2 ? '#ff0000' : '#ff6600';
  ctx.fillRect(jefe.x - barW/2, jefe.y - jefe.r - 14, barW*(jefe.hp/jefe.maxHp), 8);

  // Cara
  ctx.fillStyle = '#ff9944';
  ctx.font = `${jefe.r}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('☠', jefe.x, jefe.y);

  ctx.restore();
}

// ===== GAS =====
function dibujarGas() {
  if (!partida.gasActivo) return;
  const cx = canvas.width / 2, cy = canvas.height / 2;

  // Zona de gas (fuera del círculo seguro)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 180, 0, 0.12)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Zona segura (limpiar)
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, partida.gasRadio, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Borde del gas
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, partida.gasRadio, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ===== PARTÍCULAS =====
function crearExplosion(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const ang = (Math.PI * 2 / 8) * i;
    particulas.push({
      x, y,
      vx: Math.cos(ang) * (2 + Math.random() * 3),
      vy: Math.sin(ang) * (2 + Math.random() * 3),
      r: 3 + Math.random() * 3,
      vida: 20 + Math.random() * 20,
      maxVida: 40,
      color
    });
  }
}

function moverParticulas() {
  particulas = particulas.filter(p => p.vida > 0);
  particulas.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.9;
    p.vy *= 0.9;
    p.vida--;
  });
}

function dibujarParticulas() {
  moverParticulas();
  particulas.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.vida / p.maxVida;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ===== COLISIONES =====

function verificarColisiones() {
  if (partida.dañoCooldown > 0) partida.dañoCooldown--;

  verificarColisionBalasVsEnemigos();
  verificarColisionBalasVsJefe();

  if (partida.dañoCooldown === 0) {
    verificarColisionEnemigosVsJugador();
    verificarColisionJefeVsJugador();
  }
}

function verificarColisionBalasVsEnemigos() {
  balas.forEach(b => {
    enemigos = enemigos.filter(e => {
      const dist = Math.sqrt((b.x-e.x)**2 + (b.y-e.y)**2);
      if (dist < b.r + e.r) {
        b.vida = 0;
        e.hp--;
        if (e.hp <= 0) {
          crearExplosion(e.x, e.y, '#ff4444');
          partida.puntos += 10 * partida.oleada;
          intentarDropearBomba(e.x, e.y);
          actualizarHUD();
          return false;
        }
        return true;
      }
      return true;
    });
  });
}

function verificarColisionBalasVsJefe() {
  if (!jefe) return;
  balas.forEach(b => {
    const dist = Math.sqrt((b.x-jefe.x)**2 + (b.y-jefe.y)**2);
    if (dist < b.r + jefe.r) {
      b.vida = 0;
      jefe.hp -= 1;
      crearExplosion(b.x, b.y, '#ff6600');
      if (jefe.hp <= 0) {
        crearExplosion(jefe.x, jefe.y, '#ffd700');
        crearExplosion(jefe.x+20, jefe.y-20, '#ff6600');
        crearExplosion(jefe.x-20, jefe.y+20, '#ff0000');
        partida.puntos += 500;
        partida.jefeMuerto = true;
        jefe = null;
        actualizarHUD();
      }
    }
  });
}

function verificarColisionEnemigosVsJugador() {
  enemigos.forEach(e => {
    const dist = Math.sqrt((jugador.x-e.x)**2 + (jugador.y-e.y)**2);
    if (dist < jugador.r + e.r) {
      recibirDaño();
    }
  });
}

function verificarColisionJefeVsJugador() {
  if (!jefe) return;
  const dist = Math.sqrt((jugador.x-jefe.x)**2 + (jugador.y-jefe.y)**2);
  if (dist < jugador.r + jefe.r) {
    recibirDaño();
  }
}

function recibirDaño() {
  if (partida.dañoCooldown > 0) return;
  partida.dañoCooldown = 90;
  partida.vidas--;
  crearExplosion(jugador.x, jugador.y, '#52b788');
  actualizarHUD();
  if (partida.vidas <= 0) terminarJuego('muerte');
}

// ===== OLEADAS =====
function verificarOleada() {
  if (enemigos.length === 0 && !jefe && !partida.esperandoOleada) {
    partida.esperandoOleada = true;
    partida.oleada++;
    actualizarHUD();
    setTimeout(() => {
      partida.esperandoOleada = false;
      spawnOleada();
    }, 2000);
  }
}

// ===== FIN DEL JUEGO =====
async function terminarJuego(motivo) {
  partida.estado = 'gameover';
  cancelAnimationFrame(partida.gameLoop);
  clearInterval(partida.timerInterval);

  document.getElementById('hud').style.display = 'none';
  document.getElementById('gas-warning').className = '';

  const pantalla = document.getElementById('pantalla-gameover');
  pantalla.classList.remove('oculta');

  document.getElementById('go-dni').textContent = `DNI: ${partida.dni}`;
  document.getElementById('go-score').textContent = `${partida.puntos} PTS`;

  let msg = '';
  if (motivo === 'tiempo') msg = '⏱️ ¡Se acabó el tiempo!';
  else if (motivo === 'muerte') msg = '💀 ¡Te quedaste sin vidas!';
  document.getElementById('go-mensaje').textContent = msg;

  // Guardar en ranking (Google Sheets)
  await guardarPuntajeServidor(partida.dni, partida.nombreJugador, partida.puntos);
}

// ===== RANKING (Google Sheets vía Apps Script) =====
async function guardarPuntajeServidor(dniJugador, nombreJug, pts) {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ tipo: 'puntaje_juego', dni: dniJugador, nombre: nombreJug, puntos: pts })
    });
  } catch (e) {
    console.error('No se pudo guardar el puntaje:', e);
  }
}

async function obtenerRankingServidor() {
  try {
    const resp = await fetch(`${APPS_SCRIPT_URL}?accion=ranking`);
    return await resp.json();
  } catch (e) {
    console.error('No se pudo traer el ranking:', e);
    return [];
  }
}

async function mostrarRankingEnPantalla(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:1rem">Cargando...</div>';
  const ranking = await obtenerRankingServidor();
  if (ranking.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:1rem">Sin puntajes hoy todavía</div>';
    return;
  }
  const medallas = ['🥇','🥈','🥉'];
  container.innerHTML = ranking.map((r,i) => `
    <div class="ranking-item">
      <span class="ranking-pos">${medallas[i] || (i+1)}</span>
      <span class="ranking-dni">DNI: ${r.dni}</span>
      <span class="ranking-pts">${r.pts} pts</span>
    </div>
  `).join('');
}

// ===== NAVEGACIÓN =====
function reiniciar() {
  document.getElementById('pantalla-gameover').classList.add('oculta');
  document.getElementById('hud').style.display = 'flex';

  resetJuego();
  partida.estado = 'jugando';
  partida.gameLoop = requestAnimationFrame(update);
  partida.timerInterval = setInterval(tickTimer, 1000);
}

function volverInicio() {
  document.getElementById('pantalla-gameover').classList.add('oculta');
  document.getElementById('hud').style.display = 'none';
  document.getElementById('pantalla-inicio').classList.remove('oculta');

  partida.estado = 'inicio';
  mostrarRankingEnPantalla('inicio-ranking');
}
