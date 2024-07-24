require("dotenv").config();
const express = require("express");
const http = require('http');
const WebSocket = require("ws");
const path = require("path");
const port = process.env.PORT || 80; // TODO Change your env setting.
const app = express();

app.use(express.static(path.join(__dirname, "public")));

// 開啟 WebSocket 的服務
const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Listening port ${ port }`);
});
const wss = new WebSocket.Server({ server });
let onLineCount = 0;
let userList = [];

// 當有 client 連線成功時
wss.on("connection", (ws, req) => {
  // 線上人數
  onLineCount++;
  sendToAll("onlineCount", onLineCount);

  // 隨機給予 userId
  const userId = req.headers["sec-websocket-key"]?.toString().substring(0, 8);
  userList.push([userId, "Guest"]);
  const userIndex = userList.findIndex((element) => element[0] == userId);
  console.log("有人上線,目前人數:" + onLineCount)

  // 當收到 client 消息時
  ws.on("message", (data) => {
    // 接收到 Buffer 格式需轉成字串
    const getClientData = JSON.parse(data.toString());
    // 接收到的事件處理
    switch (getClientData.event) {
      case "setName":
        userList[userIndex][1] = getClientData.data;
        sendToAll("message", ":+:+: 歡迎 " + getClientData.data + " 加入聊天室 :+:+:");
        break;

      case "sendRocket":
        sendToAll("getRocket", "🎉 收到來自 " + getClientData.data + " 發射的火箭 💖");
        break;

      default:
        // 回傳帶有發言者暱稱的聊天訊息
        sendToAll("message", "😎 " + userList[userIndex][1] + "：" + getClientData.data);
        break;
    }
  });

  // 當連線關閉
  ws.on("close", () => {
    onLineCount--;
    sendToAll("onlineCount", onLineCount);
    sendToAll("message", "=== 掰掰 " + userList[userIndex][1] + " 離開聊天室 ===");
    userList.splice(userIndex, 1);
    console.log("有人下線,目前人數:" + onLineCount)
  });

  // 發送至每個 client
  function sendToAll(event, data) {
    const eventData = JSON.stringify({ event, data });
    let clients = wss.clients; // 取得所有連接中的 client
    clients.forEach((client) => {
      client.send(eventData); // 發送至每個 client
    });
  };
});

// 404 路由
app.use((req, res) => {
  res.status(404).json({
    code: "error",
    msg: "抱歉，未知的查詢",
  });
});

// 出現預料外的錯誤
process.on("uncaughtException", (err) => {
  // 記錄錯誤下來，等到服務都處理完後，停掉該 process
  console.error("發生未知的異常", err);
  console.error(err.name);
  console.error(err.message);
  console.error(err.stack); // 可以追蹤到哪裡發生錯誤
  process.exit(1);
});

// next() 統一錯誤處理
app.use((err, req, res, next) => {
  // console.log('當前環境為:', process.env.NODE_ENV)
  err.httpStatus = err.httpStatus || 500;
});

// 未捕捉到的 catch
process.on("unhandledRejection", (reason, promise) => {
  console.error("未捕捉到的 rejection：", promise, "原因：", reason);
  // 記錄於 log 上
});
