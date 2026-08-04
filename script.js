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
  div.textContent = text;
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
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: history
      })
    });

    const data = await response.json();

    loading.remove();

    if (data.error) {
      addMessage("❌ " + data.error, "ai");
      return;
    }

    addMessage(data.reply, "ai");

    history.push({
      role: "assistant",
      content: data.reply
    });

  } catch (e) {
    loading.remove();
    addMessage("❌ Ошибка подключения.", "ai");
    console.error(e);
  }
}

send.onclick = sendMessage;

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
