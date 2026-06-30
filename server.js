require("dotenv").config();
const express = require("express");
const http = require('http');
const WebSocket = require("ws");
const path = require("path");
const crypto = require("crypto");

const port = process.env.PORT || 8080;
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Listening port ${port}`);
});

const wss = new WebSocket.Server({ server });
const userMap = new Map();

function broadcastUserList() {
  sendToAll("userList", Array.from(userMap.values()).map(u => u.name));
}

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  const userId = crypto.randomUUID();
  userMap.set(userId, { name: "Guest" });
  sendToAll("onlineCount", userMap.size);
  broadcastUserList();
  console.log(`有人上線,目前人數:${userMap.size} - ${getDateTime()}`);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const user = userMap.get(userId);
      if (!user) return;

      switch (msg.event) {
        case "setName":
          user.name = msg.data;
          broadcastUserList();
          sendToAll("message", `:+:+: 歡迎 ${msg.data} 加入聊天室 :+:+:`);
          break;

        case "sendRocket":
          sendToAll("getRocket", `🎉 收到來自 ${msg.data} 發射的火箭 💖`);
          break;

        default:
          sendToAll("message", `😎 ${user.name}：${msg.data}`);
          break;
      }
    } catch (err) {
      console.error("訊息解析錯誤:", err);
    }
  });

  ws.on("close", () => {
    const user = userMap.get(userId);
    userMap.delete(userId);
    sendToAll("onlineCount", userMap.size);
    broadcastUserList();
    sendToAll("message", `=== 掰掰 ${user?.name || "Guest"} 離開聊天室 ===`);
    console.log(`有人下線,目前人數:${userMap.size} - ${getDateTime()}`);
  });
});

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
  wss.close(() => server.close(() => process.exit(0)));
});

process.on("SIGINT", () => process.emit("SIGTERM"));

process.on("unhandledRejection", (reason, promise) => {
  console.error("未捕捉到的 rejection：", promise, "原因：", reason);
  process.exit(1);
});
