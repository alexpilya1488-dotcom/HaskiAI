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

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "message " + type;
  div.innerHTML = text.replace(/\n/g, "<br>");
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

async function sendMessage() {
  const text = input.value.trim();

  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  history.push({
    role: "user",
    content: text
  });

  const loading = addMessage("🐺 Husky AI печатает...", "ai");

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

    const data = await response.json();

    loading.remove();

    let answer = "Не удалось получить ответ.";

    if (
      data.choices &&
      data.choices.length > 0 &&
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

  } catch (e) {
    loading.remove();
    addMessage("❌ Ошибка подключения к нейросети.", "ai");
    console.error(e);
  }
}

send.addEventListener("click", sendMessage);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});
