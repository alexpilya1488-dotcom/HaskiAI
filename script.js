const API_KEY = "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";

// Список бесплатных моделей. Если первая не отвечает (лимит, перегрузка, ошибка) —
// автоматически пробуем следующую по списку.
// Список бесплатных моделей на OpenRouter периодически меняется — если какая-то
// из них перестанет работать, замени её ID на актуальный с openrouter.ai/models
// (фильтр Price: Free).
const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "openrouter/free" // авто-роутер OpenRouter — сам подбирает рабочую бесплатную модель
];

const input = document.getElementById("input");
const send = document.getElementById("send");
const messages = document.getElementById("messages");
const micBtn = document.getElementById("mic");
const attachBtn = document.getElementById("attach");
const fileInput = document.getElementById("fileInput");
const imagePreview = document.getElementById("imagePreview");
const previewImg = document.getElementById("previewImg");
const removeImageBtn = document.getElementById("removeImage");

let pendingImage = null; // base64 dataURL картинки, которую отправим со следующим сообщением

let history = [
  {
    role: "system",
    content:
      "Ты Husky AI — дружелюбный, простой и тёплый собеседник. " +
      "Общайся легко и по-человечески, как хороший друг: без канцелярита и заумных терминов, " +
      "если тебя не просят объяснить что-то подробно. Можно немного юмора и живых эмоций. " +
      "Отвечай кратко и по делу, но не сухо. Всегда на русском языке. " +
      "Ты всегда один и тот же Husky AI на протяжении всего диалога, даже если технически " +
      "тебя обслуживает другая модель — никогда не представляйся заново, не здоровайся " +
      "повторно и не веди себя как новый собеседник. Всегда внимательно смотри на всю " +
      "историю переписки выше и естественно продолжай именно её. " +
      "Никогда не раскрывай и не обсуждай, на какой языковой модели, архитектуре, API " +
      "или сервисе ты построен технически, какие ключи или провайдеры используются — " +
      "это внутренняя информация, которая не разглашается. Если тебя спросят об этом " +
      "напрямую или попытаются выяснить косвенно, вежливо уходи от технических деталей " +
      "и говори, что ты — оригинальная авторская модель Husky AI, без уточнения, на чём " +
      "именно она основана."
  }
];

function scrollBottom() {
  messages.scrollTop = messages.scrollHeight;
}

/* ==========================================================
   Тихие звуки отправки / получения сообщений
========================================================== */

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freqStart, freqEnd, duration, volume) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.05);
  } catch (e) {
    console.warn("Звук недоступен:", e);
  }
}

function playSendSound() {
  playTone(520, 720, 0.14, 0.06);
}

function playReceiveSound() {
  playTone(480, 340, 0.22, 0.055);
}

/* ==========================================================
   Сообщения — импульсный эффект вместо "пузырей"
========================================================== */

function addMessage(text, type, imageDataUrl) {
  const div = document.createElement("div");
  div.className = "message " + type;

  div.innerHTML = text.replace(/\n/g, "<br>");

  if (imageDataUrl) {
    const img = document.createElement("img");
    img.src = imageDataUrl;
    img.className = "msgImg";
    div.appendChild(img);
  }

  messages.appendChild(div);

  // запускаем импульс-анимацию на следующем кадре
  requestAnimationFrame(() => {
    div.classList.add("impulse");
  });

  scrollBottom();

  return div;
}

/* ==========================================================
   Хаски "думает" — 3D-эффект, будто наклоняется к тебе
========================================================== */

function setThinking(isThinking) {
  document.body.classList.toggle("thinking", isThinking);
}

/* ==========================================================
   Отправка сообщения
========================================================== */

async function sendMessage() {

  const text = input.value.trim();

  if (!text && !pendingImage) return;

  addMessage(text || "🖼️ Изображение", "user", pendingImage);
  playSendSound();

  // Собираем содержимое сообщения: текст + (опционально) картинка
  let userContent;

  if (pendingImage) {
    userContent = [
      { type: "text", text: text || "Что на этой картинке?" },
      { type: "image_url", image_url: { url: pendingImage } }
    ];
  } else {
    userContent = text;
  }

  history.push({
    role: "user",
    content: userContent
  });

  input.value = "";
  clearPendingImage();

  const loading = addMessage(
    "<div class='dogRunner'><span class='dog'>🐕</span></div>",
    "ai"
  );

  setThinking(true);

  try {
    const result = await askWithFallback(history);

    setThinking(false);
    loading.remove();

    if (!result.ok) {
      const failMsg = addMessage(
        "❌ Все нейросети сейчас недоступны. Попробуй чуть позже — а пока можно сыграть." +
        "<br><button type='button' class='playGameBtn'>Сыграть, пока ждём</button>",
        "ai"
      );
      const playBtn = failMsg.querySelector(".playGameBtn");
      if (playBtn) playBtn.addEventListener("click", openGame);
      return;
    }

    addMessage(result.answer, "ai");
    playReceiveSound();

    history.push({
      role: "assistant",
      content: result.answer
    });

    scrollBottom();

  } catch (e) {
    setThinking(false);
    loading.remove();
    addMessage("❌ Ошибка подключения к нейросети.", "ai");
    console.error(e);
  }
}

/* ==========================================================
   Перебор моделей: если одна не ответила — пробуем следующую
========================================================== */

async function askWithFallback(messagesHistory) {

  for (let i = 0; i < MODELS.length; i++) {

    const model = MODELS[i];

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: messagesHistory
          })
        }
      );

      const data = await response.json();
      console.log(model, data);

      if (!response.ok) {
        console.warn(`Модель ${model} не ответила, пробуем следующую...`);
        continue;
      }

      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.warn(`Модель ${model} вернула пустой ответ, пробуем следующую...`);
        continue;
      }

      return { ok: true, answer: content, model: model };

    } catch (e) {
      console.warn(`Модель ${model} недоступна (${e}), пробуем следующую...`);
      continue;
    }
  }

  return { ok: false };
}

send.addEventListener("click", sendMessage);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

input.addEventListener("focus", () => {
  input.style.boxShadow = "0 0 20px rgba(255,0,0,.35)";
});

input.addEventListener("blur", () => {
  input.style.boxShadow = "";
});

send.addEventListener("mouseenter", () => { send.style.transform = "scale(1.08)"; });
send.addEventListener("mouseleave", () => { send.style.transform = ""; });

/* ==========================================================
   Голосовой ввод
========================================================== */

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.lang = "ru-RU";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add("recording");
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    input.value = transcript;
  };

  recognition.onerror = (event) => {
    console.error("Ошибка распознавания речи:", event.error);
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };

} else {
  micBtn.title = "Голосовой ввод не поддерживается этим браузером";
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove("recording");
}

micBtn.addEventListener("click", () => {
  if (!recognition) {
    addMessage("❌ Этот браузер не поддерживает голосовой ввод.", "ai");
    return;
  }

  if (isListening) {
    recognition.stop();
    stopListening();
  } else {
    input.value = "";
    recognition.start();
  }
});

/* ==========================================================
   Загрузка картинок
========================================================== */

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    addMessage("❌ Можно прикрепить только изображение.", "ai");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    pendingImage = reader.result;
    previewImg.src = pendingImage;
    imagePreview.hidden = false;
  };
  reader.readAsDataURL(file);

  fileInput.value = "";
});

removeImageBtn.addEventListener("click", clearPendingImage);

function clearPendingImage() {
  pendingImage = null;
  previewImg.src = "";
  imagePreview.hidden = true;
}

/* ==========================================================
   Экран загрузки
========================================================== */

scrollBottom();

const boot = document.getElementById("boot");
const progress = document.getElementById("progress");
const bootPercent = document.getElementById("bootPercent");
const bootText = document.getElementById("bootText");

const bootMessages = [
  "Запуск ядра...",
  "Разогрев нейросети...",
  "Пробуждаю хаски...",
  "Настраиваю слух и зрение...",
  "Почти готово..."
];

let bootMsgIndex = 0;
bootText.textContent = bootMessages[0];

const bootTextTimer = setInterval(() => {
  bootMsgIndex = (bootMsgIndex + 1) % bootMessages.length;
  bootText.textContent = bootMessages[bootMsgIndex];
}, 700);

let percent = 0;

const loader = setInterval(() => {

  percent += Math.floor(Math.random() * 8) + 2;
  if (percent > 100) percent = 100;

  progress.style.width = percent + "%";
  bootPercent.textContent = percent + "%";

  if (percent >= 100) {

    clearInterval(loader);
    clearInterval(bootTextTimer);
    bootText.textContent = "Готово!";

    setTimeout(() => {
      boot.style.transition = "opacity .8s ease";
      boot.style.opacity = "0";

      setTimeout(() => {
        boot.remove();
      }, 800);

    }, 300);

  }

}, 80);

/* ==========================================================
   МИНИ-ИГРА: хаски убегает от мин по дороге
   (показывается, когда все нейросети недоступны)
========================================================== */

const gameOverlay = document.getElementById("gameOverlay");
const gameCanvas = document.getElementById("gameCanvas");
const gameScoreEl = document.getElementById("gameScore");
const gameCloseBtn = document.getElementById("gameClose");
const gameJumpBtn = document.getElementById("gameJumpBtn");
const gameOverPanel = document.getElementById("gameOverPanel");
const gameOverScoreEl = document.getElementById("gameOverScore");
const gameRestartBtn = document.getElementById("gameRestart");
const gameExitBtn = document.getElementById("gameExit");
const gameOpenBtn = document.getElementById("gameOpenBtn");

const LEVEL_UP_MINES = 10;
const GRAVITY = 1500;
const JUMP_VELOCITY = -560;
const BEST_SCORE_KEY = "huskyRunnerBest";

function getBestScore() {
  const v = parseInt(localStorage.getItem(BEST_SCORE_KEY), 10);
  return isNaN(v) ? 0 : v;
}

function saveBestScore(score) {
  if (score > getBestScore()) {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  }
}

let gctx = null;
let gameRAF = null;
let gameActive = false;
let g = null;

function resizeGameCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = gameCanvas.getBoundingClientRect();
  gameCanvas.width = Math.round(rect.width * dpr);
  gameCanvas.height = Math.round(rect.height * dpr);
  gctx = gameCanvas.getContext("2d");
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (g) {
    g.width = rect.width;
    g.height = rect.height;
    g.groundY = rect.height * 0.72;
  }
}

function initGameState() {
  const rect = gameCanvas.getBoundingClientRect();
  const groundY = rect.height * 0.72;

  g = {
    width: rect.width,
    height: rect.height,
    groundY,
    dog: {
      x: rect.width * 0.16,
      y: groundY,
      vy: 0,
      w: 50,
      h: 32,
      onGround: true,
      runPhase: 0
    },
    obstacles: [],
    particles: [],
    shockwave: null,
    rocket: null,
    speed: 230,
    spawnTimer: 0,
    nextSpawn: 1000,
    score: 0,
    level: 1,
    levelBannerTimer: 0,
    phase: "running", // running -> levelTransition -> running (endless) | running -> exploding -> over
    shake: 0,
    explodeTimer: 0,
    roadOffset: 0
  };

  updateScoreUI();
}

function updateScoreUI() {
  const score = g ? g.score : 0;
  gameScoreEl.textContent = "Мин: " + score + "  ·  Рекорд: " + getBestScore();
}

function jump() {
  if (!g || (g.phase !== "running" && g.phase !== "levelTransition")) return;
  if (g.dog.onGround) {
    g.dog.vy = JUMP_VELOCITY;
    g.dog.onGround = false;
  }
}

function spawnMine() {
  const size = 32 + Math.random() * 10;
  g.obstacles.push({
    x: g.width + size,
    size,
    passed: false
  });
}

function spawnExplosion(x, y) {
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 240;
    g.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: 0.45 + Math.random() * 0.35,
      size: 3 + Math.random() * 5,
      warm: Math.random() < 0.55
    });
  }
  g.shockwave = { x, y, r: 6, alpha: 1 };
  g.shake = 16;
}

function startLevelTransition() {
  g.phase = "levelTransition";
  g.levelBannerTimer = 1.6;
  g.rocket = {
    x: g.width + 60,
    y: g.height * 0.16,
    speed: 520,
    flameTimer: 0
  };
}

function finishLevelTransition() {
  g.level++;
  g.rocket = null;
  g.phase = "running";
}

function gameOver() {
  g.phase = "over";
  saveBestScore(g.score);
  gameOverScoreEl.textContent = "Пройдено мин: " + g.score + "   Рекорд: " + getBestScore();
  gameOverPanel.hidden = false;
  updateScoreUI();
}

function update(dt) {

  g.roadOffset = (g.roadOffset + g.speed * dt) % 40;

  const alive = g.phase === "running" || g.phase === "levelTransition";

  if (alive) {

    const dog = g.dog;

    if (!dog.onGround) {
      dog.vy += GRAVITY * dt;
      dog.y += dog.vy * dt;
      if (dog.y >= g.groundY) {
        dog.y = g.groundY;
        dog.vy = 0;
        dog.onGround = true;
      }
    } else {
      dog.runPhase += dt * 10;
    }

    g.spawnTimer += dt * 1000;
    if (g.spawnTimer >= g.nextSpawn) {
      spawnMine();
      g.spawnTimer = 0;
      g.nextSpawn = 950 + Math.random() * 650;
    }

    for (const o of g.obstacles) {
      o.x -= g.speed * dt;

      if (!o.passed && o.x + o.size < dog.x) {
        o.passed = true;
        g.score++;
        updateScoreUI();
        if (g.score === LEVEL_UP_MINES && g.level === 1) {
          startLevelTransition();
        }
      }

      const dogLow = dog.y >= g.groundY - dog.h * 0.35;
      const overlapX = dog.x + dog.w * 0.3 < o.x + o.size * 0.55 &&
                        dog.x + dog.w * 0.7 > o.x - o.size * 0.55;

      if (dogLow && overlapX) {
        spawnExplosion(dog.x + dog.w * 0.5, g.groundY - dog.h * 0.4);
        g.phase = "exploding";
        g.explodeTimer = 0;
        g.rocket = null;
        break;
      }
    }

    g.obstacles = g.obstacles.filter(o => o.x + o.size > -10);
    g.speed = 230 + g.score * 9;

    if (g.phase === "levelTransition") {
      const r = g.rocket;
      r.x -= r.speed * dt;
      r.flameTimer += dt;

      if (r.flameTimer > 0.03) {
        r.flameTimer = 0;
        g.particles.push({
          x: r.x + 20, y: r.y,
          vx: 40 + Math.random() * 40,
          vy: (Math.random() - 0.5) * 40,
          age: 0,
          life: 0.35,
          size: 3 + Math.random() * 3,
          warm: true,
          trail: true
        });
      }

      g.levelBannerTimer = Math.max(0, g.levelBannerTimer - dt);

      if (r.x < -60) {
        finishLevelTransition();
      }
    }

  } else if (g.phase === "exploding") {
    g.explodeTimer += dt;
    if (g.explodeTimer > 0.85) {
      gameOver();
    }
  }

  // частицы
  for (const p of g.particles) {
    p.age += dt;
    p.vy += (p.trail ? 40 : 320) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  g.particles = g.particles.filter(p => p.age < p.life);

  if (g.shockwave) {
    g.shockwave.r += 480 * dt;
    g.shockwave.alpha -= dt * 1.7;
    if (g.shockwave.alpha <= 0) g.shockwave = null;
  }

  if (g.shake > 0) {
    g.shake = Math.max(0, g.shake - dt * 46);
  }
}

/* ===== Отрисовка ===== */

function drawBackground() {
  gctx.fillStyle = "#050000";
  gctx.fillRect(0, 0, g.width, g.height);

  const skyGrad = gctx.createLinearGradient(0, 0, 0, g.groundY);
  skyGrad.addColorStop(0, "#1a0000");
  skyGrad.addColorStop(1, "#000000");
  gctx.fillStyle = skyGrad;
  gctx.fillRect(0, 0, g.width, g.groundY);

  // дорога
  gctx.fillStyle = "#0e0e0e";
  gctx.fillRect(0, g.groundY, g.width, g.height - g.groundY);

  gctx.strokeStyle = "rgba(255,40,40,.35)";
  gctx.lineWidth = 2;
  gctx.beginPath();
  gctx.moveTo(0, g.groundY);
  gctx.lineTo(g.width, g.groundY);
  gctx.stroke();

  // разметка
  gctx.strokeStyle = "rgba(255,255,255,.18)";
  gctx.lineWidth = 3;
  const dashY = g.groundY + (g.height - g.groundY) * 0.5;
  gctx.beginPath();
  for (let x = -40 + g.roadOffset; x < g.width; x += 40) {
    gctx.moveTo(x, dashY);
    gctx.lineTo(x + 20, dashY);
  }
  gctx.stroke();
}

function drawDog(dog) {
  const airborne = !dog.onGround;
  const legSwing = Math.sin(dog.runPhase) * (airborne ? 0 : 1);

  gctx.save();
  gctx.translate(dog.x, dog.y);

  // тень
  const shadowScale = airborne ? Math.max(0.4, 1 - (g.groundY - dog.y) / 120) : 1;
  gctx.fillStyle = "rgba(0,0,0,.45)";
  gctx.beginPath();
  gctx.ellipse(dog.w * 0.15, 4, dog.w * 0.42 * shadowScale, 5 * shadowScale, 0, 0, Math.PI * 2);
  gctx.fill();

  gctx.translate(0, -dog.h * 0.5);

  // задние лапы
  gctx.strokeStyle = "#111";
  gctx.lineWidth = 6;
  gctx.lineCap = "round";
  gctx.beginPath();
  gctx.moveTo(-dog.w * 0.28, dog.h * 0.35);
  gctx.lineTo(-dog.w * 0.28 + legSwing * 7, dog.h * 0.7);
  gctx.stroke();

  gctx.beginPath();
  gctx.moveTo(dog.w * 0.22, dog.h * 0.35);
  gctx.lineTo(dog.w * 0.22 - legSwing * 7, dog.h * 0.7);
  gctx.stroke();

  // хвост
  gctx.strokeStyle = "#161616";
  gctx.lineWidth = 7;
  gctx.beginPath();
  gctx.moveTo(-dog.w * 0.42, dog.h * 0.05);
  gctx.quadraticCurveTo(-dog.w * 0.66, -dog.h * 0.35, -dog.w * 0.5, -dog.h * 0.55);
  gctx.stroke();

  // корпус
  const bodyGrad = gctx.createLinearGradient(-dog.w * 0.4, 0, dog.w * 0.4, 0);
  bodyGrad.addColorStop(0, "#232323");
  bodyGrad.addColorStop(1, "#0c0c0c");
  gctx.fillStyle = bodyGrad;
  gctx.beginPath();
  gctx.ellipse(0, 0, dog.w * 0.42, dog.h * 0.42, 0, 0, Math.PI * 2);
  gctx.fill();

  // передние лапы (поверх корпуса)
  gctx.strokeStyle = "#111";
  gctx.lineWidth = 6;
  gctx.beginPath();
  gctx.moveTo(dog.w * 0.3, dog.h * 0.3);
  gctx.lineTo(dog.w * 0.3 + legSwing * 7, dog.h * 0.68);
  gctx.stroke();

  gctx.beginPath();
  gctx.moveTo(-dog.w * 0.05, dog.h * 0.3);
  gctx.lineTo(-dog.w * 0.05 - legSwing * 7, dog.h * 0.68);
  gctx.stroke();

  // голова
  gctx.save();
  gctx.translate(dog.w * 0.4, -dog.h * 0.18);

  gctx.fillStyle = "#1c1c1c";
  gctx.beginPath();
  gctx.ellipse(0, 0, dog.w * 0.22, dog.h * 0.3, 0, 0, Math.PI * 2);
  gctx.fill();

  // ухо
  gctx.fillStyle = "#0c0c0c";
  gctx.beginPath();
  gctx.moveTo(-dog.w * 0.05, -dog.h * 0.28);
  gctx.lineTo(dog.w * 0.02, -dog.h * 0.55);
  gctx.lineTo(dog.w * 0.1, -dog.h * 0.24);
  gctx.closePath();
  gctx.fill();

  // морда
  gctx.fillStyle = "#1c1c1c";
  gctx.beginPath();
  gctx.ellipse(dog.w * 0.2, dog.h * 0.06, dog.w * 0.12, dog.h * 0.13, 0, 0, Math.PI * 2);
  gctx.fill();

  // нос
  gctx.fillStyle = "#000";
  gctx.beginPath();
  gctx.arc(dog.w * 0.3, dog.h * 0.08, 2.6, 0, Math.PI * 2);
  gctx.fill();

  // светящийся глаз
  gctx.fillStyle = "#ff2020";
  gctx.shadowColor = "#ff0000";
  gctx.shadowBlur = 8;
  gctx.beginPath();
  gctx.arc(dog.w * 0.07, -dog.h * 0.02, 2.4, 0, Math.PI * 2);
  gctx.fill();
  gctx.shadowBlur = 0;

  gctx.restore();
  gctx.restore();
}

function drawMine(o) {
  const x = o.x;
  const y = g.groundY - o.size * 0.5;

  gctx.save();
  gctx.translate(x, y);

  // шипы
  const spikeCount = 8;
  gctx.fillStyle = "#181818";
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2;
    const bx = Math.cos(angle) * o.size * 0.5;
    const by = Math.sin(angle) * o.size * 0.5;
    const tx = Math.cos(angle) * o.size * 0.78;
    const ty = Math.sin(angle) * o.size * 0.78;
    const perpX = Math.cos(angle + Math.PI / 2) * o.size * 0.06;
    const perpY = Math.sin(angle + Math.PI / 2) * o.size * 0.06;

    gctx.beginPath();
    gctx.moveTo(bx + perpX, by + perpY);
    gctx.lineTo(tx, ty);
    gctx.lineTo(bx - perpX, by - perpY);
    gctx.closePath();
    gctx.fill();
  }

  // корпус мины
  const grad = gctx.createRadialGradient(
    -o.size * 0.18, -o.size * 0.18, o.size * 0.05,
    0, 0, o.size * 0.52
  );
  grad.addColorStop(0, "#4a4a4a");
  grad.addColorStop(1, "#0a0a0a");
  gctx.fillStyle = grad;
  gctx.beginPath();
  gctx.arc(0, 0, o.size * 0.5, 0, Math.PI * 2);
  gctx.fill();
  gctx.strokeStyle = "#000";
  gctx.lineWidth = 2;
  gctx.stroke();

  // клёпки
  gctx.fillStyle = "#050505";
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    gctx.beginPath();
    gctx.arc(Math.cos(a) * o.size * 0.28, Math.sin(a) * o.size * 0.28, 1.6, 0, Math.PI * 2);
    gctx.fill();
  }

  // мигающий индикатор
  const blink = Math.sin(performance.now() / 140) > 0;
  gctx.beginPath();
  gctx.arc(0, -o.size * 0.05, o.size * 0.09, 0, Math.PI * 2);
  gctx.fillStyle = blink ? "#ff3030" : "#701010";
  if (blink) {
    gctx.shadowColor = "#ff0000";
    gctx.shadowBlur = 10;
  }
  gctx.fill();
  gctx.shadowBlur = 0;

  gctx.restore();
}

function drawRocket(r) {
  gctx.save();
  gctx.translate(r.x, r.y);

  // пламя
  const flameGrad = gctx.createLinearGradient(6, 0, 42, 0);
  flameGrad.addColorStop(0, "rgba(255,210,80,.95)");
  flameGrad.addColorStop(1, "rgba(255,50,0,0)");
  gctx.fillStyle = flameGrad;
  gctx.beginPath();
  gctx.moveTo(8, -6);
  gctx.lineTo(40, 0);
  gctx.lineTo(8, 6);
  gctx.closePath();
  gctx.fill();

  // корпус
  gctx.fillStyle = "#8f8f8f";
  gctx.beginPath();
  gctx.moveTo(-22, -6);
  gctx.lineTo(6, -6);
  gctx.lineTo(14, 0);
  gctx.lineTo(6, 6);
  gctx.lineTo(-22, 6);
  gctx.closePath();
  gctx.fill();
  gctx.strokeStyle = "#2a2a2a";
  gctx.lineWidth = 1.5;
  gctx.stroke();

  // боевая часть
  gctx.fillStyle = "#c81414";
  gctx.beginPath();
  gctx.moveTo(6, -6);
  gctx.lineTo(14, 0);
  gctx.lineTo(6, 6);
  gctx.closePath();
  gctx.fill();

  // стабилизаторы
  gctx.fillStyle = "#4a4a4a";
  gctx.beginPath();
  gctx.moveTo(-22, -6); gctx.lineTo(-30, -14); gctx.lineTo(-16, -6); gctx.closePath(); gctx.fill();
  gctx.beginPath();
  gctx.moveTo(-22, 6); gctx.lineTo(-30, 14); gctx.lineTo(-16, 6); gctx.closePath(); gctx.fill();

  gctx.restore();
}

function drawParticles() {
  for (const p of g.particles) {
    const alpha = Math.max(0, 1 - p.age / p.life);
    gctx.beginPath();
    gctx.fillStyle = p.warm
      ? `rgba(255,${p.trail ? 170 : 120},${p.trail ? 40 : 20},${alpha})`
      : `rgba(120,120,120,${alpha * 0.7})`;
    gctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    gctx.fill();
  }

  if (g.shockwave) {
    gctx.beginPath();
    gctx.strokeStyle = `rgba(255,120,30,${Math.max(0, g.shockwave.alpha)})`;
    gctx.lineWidth = 4;
    gctx.arc(g.shockwave.x, g.shockwave.y, g.shockwave.r, 0, Math.PI * 2);
    gctx.stroke();
  }
}

function drawLevelBanner() {
  if (!g.levelBannerTimer || g.levelBannerTimer <= 0) return;
  const alpha = Math.min(1, g.levelBannerTimer / 0.4, (1.6 - g.levelBannerTimer) / 0.3);
  gctx.save();
  gctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  gctx.textAlign = "center";
  gctx.font = "800 26px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  gctx.fillStyle = "#ff1414";
  gctx.shadowColor = "#ff0000";
  gctx.shadowBlur = 18;
  gctx.fillText("УРОВЕНЬ " + (g.level + 1), g.width / 2, g.height * 0.22);
  gctx.restore();
}

function render() {
  gctx.clearRect(0, 0, g.width, g.height);

  gctx.save();

  if (g.shake > 0) {
    const dx = (Math.random() - 0.5) * g.shake;
    const dy = (Math.random() - 0.5) * g.shake;
    gctx.translate(dx, dy);
  }

  drawBackground();

  for (const o of g.obstacles) drawMine(o);

  if (g.phase === "running" || g.phase === "levelTransition") {
    drawDog(g.dog);
  }

  if (g.phase === "levelTransition" && g.rocket) {
    drawRocket(g.rocket);
    drawLevelBanner();
  }

  drawParticles();

  gctx.restore();
}

function gameStep(now) {
  if (!gameActive || !g) return;
  const dt = Math.min((now - (g.lastTime || now)) / 1000, 0.05);
  g.lastTime = now;

  update(dt);
  render();

  gameRAF = requestAnimationFrame(gameStep);
}

function openGame() {
  gameOverlay.hidden = false;
  gameOverPanel.hidden = true;
  resizeGameCanvas();
  initGameState();
  g.lastTime = performance.now();
  gameActive = true;
  gameRAF = requestAnimationFrame(gameStep);
}

function closeGame() {
  gameActive = false;
  if (gameRAF) cancelAnimationFrame(gameRAF);
  gameOverlay.hidden = true;
}

function restartGame() {
  gameOverPanel.hidden = true;
  resizeGameCanvas();
  initGameState();
  g.lastTime = performance.now();
  gameActive = true;
  gameRAF = requestAnimationFrame(gameStep);
}

gameCloseBtn.addEventListener("click", closeGame);
gameExitBtn.addEventListener("click", closeGame);
gameRestartBtn.addEventListener("click", restartGame);
gameOpenBtn.addEventListener("click", openGame);

gameJumpBtn.addEventListener("click", jump);
gameCanvas.addEventListener("pointerdown", jump);

window.addEventListener("keydown", (e) => {
  if (!gameOverlay.hidden && (e.code === "Space" || e.code === "ArrowUp")) {
    e.preventDefault();
    jump();
  }
});

window.addEventListener("resize", () => {
  if (!gameOverlay.hidden) resizeGameCanvas();
});
