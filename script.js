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
    "🐺 Husky AI печатает<span id='dots'>.</span>",
    "ai"
  );

  setThinking(true);

  let dots = 1;

  const timer = setInterval(() => {
    const el = document.getElementById("dots");
    if (!el) return;
    dots++;
    if (dots > 3) dots = 1;
    el.textContent = ".".repeat(dots);
  }, 350);

  try {
    const result = await askWithFallback(history);

    clearInterval(timer);
    setThinking(false);
    loading.remove();

    if (!result.ok) {
      addMessage("❌ Все нейросети сейчас недоступны. Попробуй чуть позже.", "ai");
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
    clearInterval(timer);
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
