const API_KEY = "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";
const MODEL = "openai/gpt-oss-20b:free";

const input = document.getElementById("input");
const send = document.getElementById("send");
const messages = document.getElementById("messages");

let history = [
  {
    role: "system",
    content: "Ты Husky AI. Отвечай дружелюбно, кратко и на русском языке."
  }
];

function scrollBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "message " + type;

  div.innerHTML = text.replace(/\n/g, "<br>");

  div.style.opacity = "0";
  div.style.transform = "translateY(20px)";

  messages.appendChild(div);

  requestAnimationFrame(() => {
    div.style.transition = "0.35s";
    div.style.opacity = "1";
    div.style.transform = "translateY(0)";
  });

  scrollBottom();

  return div;
}

function createRipple(x, y) {
  const ripple = document.createElement("div");

  ripple.className = "ripple";

  ripple.style.left = x + "px";
  ripple.style.top = y + "px";

  document.body.appendChild(ripple);

  setTimeout(() => {
    ripple.remove();
  }, 900);
}

document.addEventListener("pointerdown", (e) => {
  createRipple(e.clientX, e.clientY);
});

async function sendMessage() {

  const text = input.value.trim();

  if (!text) return;

  addMessage(text, "user");

  input.value = "";

  history.push({
    role: "user",
    content: text
  });

  const loading = addMessage(
    "🐺 Husky AI печатает<span id='dots'>.</span>",
    "ai"
  );

  let dots = 1;

  const timer = setInterval(() => {
    const el = document.getElementById("dots");

    if (!el) return;

    dots++;

    if (dots > 3) dots = 1;

    el.textContent = ".".repeat(dots);

  }, 350);

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
          model: MODEL,
          messages: history
        })
      }
    );

    clearInterval(timer);

    loading.remove();

    const data = await response.json();

    let answer = "Не удалось получить ответ.";

    if (
      data.choices &&
      data.choices.length &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      answer = data.choices[0].message.content;
    }

    addMessage(answer, "ai");

    history.push({
      role: "assistant",
      content: answer
    });

    scrollBottom();

  } catch (e) {

    clearInterval(timer);

    loading.remove();

    addMessage("❌ Ошибка подключения к нейросети.", "ai");

    console.error(e);
  }

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

send.addEventListener("mouseenter", () => {
  send.style.transform = "scale(1.08)";
});

send.addEventListener("mouseleave", () => {
  send.style.transform = "";
});

scrollBottom();
