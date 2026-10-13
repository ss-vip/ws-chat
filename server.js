require("dotenv").config();
const express = require("express");
const http = require('http');
const WebSocket = require("ws");
const path = require("path");
const crypto = require("crypto");

const port = process.env.PORT || 8080;
const app = express();

app.use(express.static(path.join(__dirname, "dist")));

const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Listening port ${port}`);
});

const wss = new WebSocket.Server({ server, path: "/ws", maxPayload: 4096 });
const userMap = new Map();

// 令牌桶：capacity 允許突發，refillPerSec 為穩態速率（每秒補幾個令牌）
function rateLimiter(capacity, refillPerSec) {
  let tokens = capacity;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

const GUEST_PREFIX = "訪客-";
// 移除易混淆字元 0/O/1/I
const GUEST_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function isNameTaken(name, exceptId) {
  for (const [id, user] of userMap) {
    if (id !== exceptId && user.name === name) return true;
  }
  return false;
}

function pickGuestName(exceptId) {
  for (let i = 0; i < 50; i++) {
    const bytes = crypto.randomBytes(4);
    let code = "";
    for (const b of bytes) code += GUEST_ALPHABET[b % GUEST_ALPHABET.length];
    const name = GUEST_PREFIX + code;
    if (!isNameTaken(name, exceptId)) return name;
  }
  return GUEST_PREFIX + crypto.randomUUID().slice(0, 8).toUpperCase();
}

// 只有完成登入（confirmed）的使用者才計入房間人數與列表
function presence() {
  const names = Array.from(userMap.values()).filter(u => u.confirmed).map(u => u.name);
  return { count: names.length, names };
}

function sendPresenceTo(client) {
  const { count, names } = presence();
  sendTo(client, "onlineCount", count);
  sendTo(client, "userList", names);
}

function broadcastPresence() {
  const { count, names } = presence();
  sendToAll("onlineCount", count);
  sendToAll("userList", names);
}

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  // 每條連線各自的限速：發言與火箭都至少 1 秒 1 次（無突發），改名可容錯
  const limitMessage = rateLimiter(1, 1);
  const limitRocket = rateLimiter(1, 1);
  const limitDog = rateLimiter(1, 1);
  const limitName = rateLimiter(5, 0.5);

  const userId = crypto.randomUUID();
  const guestName = pickGuestName(userId);
  userMap.set(userId, { name: guestName, confirmed: false });
  sendTo(ws, "assignedName", guestName);
  sendPresenceTo(ws); // 新連線先同步現況，否則要等別人變動才會更新
  console.log(`有人上線(待登入 ${guestName}),目前人數:${userMap.size} - ${getDateTime()}`);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const user = userMap.get(userId);
      if (!user) return;

      switch (msg.event) {
        case "setName": {
          if (!limitName()) {
            sendTo(ws, "notice", "操作太頻繁，請稍候再試");
            break;
          }
          const name = typeof msg.data === "string" ? msg.data.trim() : "";
          if (!name || name.length > 20) {
            // 輸入問題用獨立事件：error 代表「身分不成立」，收到會被客戶端登出
            sendTo(ws, "setNameError", "暱稱需為 1-20 個字");
            break;
          }
          if (isNameTaken(name, userId)) {
            sendTo(ws, "setNameError", "暱稱已被使用，請換一個");
            break;
          }
          const firstLogin = !user.confirmed;
          user.name = name;
          user.confirmed = true;
          sendTo(ws, "loginOk", name);
          if (firstLogin) {
            sendToAll("system", `歡迎 ${name} 加入聊天室`);
          }
          broadcastPresence();
          break;
        }

        case "sendRocket": {
          if (!user.confirmed) {
            sendTo(ws, "error", "請先完成登入");
            break;
          }
          if (!limitRocket()) {
            sendTo(ws, "notice", "火箭發射太頻繁，請稍候再試");
            break;
          }
          // 名稱一律取伺服器端紀錄，避免偽造
          sendToAll("getRocket", { name: user.name });
          break;
        }

        case "sendDog": {
          if (!user.confirmed) {
            sendTo(ws, "error", "請先完成登入");
            break;
          }
          if (!limitDog()) {
            sendTo(ws, "notice", "狗狗跑太快了，請稍候再試");
            break;
          }
          // 與火箭同一套：名稱取伺服器端紀錄
          sendToAll("getDog", { name: user.name });
          break;
        }

        case "message": {
          if (!user.confirmed) {
            sendTo(ws, "error", "請先完成登入");
            break;
          }
          if (!limitMessage()) {
            sendTo(ws, "notice", "發送太快了，請稍慢");
            break;
          }
          const text = typeof msg.data === "string" ? msg.data.trim() : "";
          if (!text || text.length > 200) break;
          sendToAll("message", { name: user.name, text });
          break;
        }
      }
    } catch (err) {
      console.error("訊息解析錯誤:", err);
    }
  });

  ws.on("close", () => {
    const user = userMap.get(userId);
    userMap.delete(userId);
    if (user && user.confirmed) {
      sendToAll("system", `${user.name} 離開了聊天室`);
    }
    broadcastPresence();
    console.log(`有人下線(${user ? user.name : "未知"}),目前人數:${userMap.size} - ${getDateTime()}`);
  });
});

function sendTo(client, event, data) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ event, data }));
  }
}

function sendToAll(event, data) {
  const eventData = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(eventData);
    }
  });
}

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => clearInterval(pingInterval));

function getDateTime() {
  return new Date().toLocaleString("sv", { timeZone: "Asia/Taipei" });
}

app.use((req, res) => {
  res.status(404).json({ code: "error", msg: "抱歉，未知的查詢" });
});

app.use((err, req, res, next) => {
  console.error("錯誤:", err);
  res.status(err.httpStatus || 500).json({ code: "error", msg: err.message || "伺服器錯誤" });
});

process.on("uncaughtException", (err) => {
  console.error("發生未知的異常", err);
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("收到 SIGTERM，關閉伺服器");
  // 既有 WebSocket 不會被 wss.close() 關閉，需先切斷，否則程序無法退出
  wss.clients.forEach(client => client.terminate());
  wss.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
});

process.on("SIGINT", () => process.emit("SIGTERM"));

process.on("unhandledRejection", (reason, promise) => {
  console.error("未捕捉到的 rejection：", promise, "原因：", reason);
  process.exit(1);
});
