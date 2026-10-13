// 協定層回歸測試：起自己的 server（不需外部程序），npm test 即可執行
import { WebSocket } from "ws";
import { spawn } from "node:child_process";

const PORT = Number(process.env.TEST_PORT || 8093);
const URL = `ws://127.0.0.1:${PORT}/ws`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, cond, extra = "") =>
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " | " + extra : ""}`);

let server = null;
async function startServer() {
  server = spawn("node", ["server.js"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) return;
    } catch {}
    await wait(100);
  }
  throw new Error("server 啟動失敗");
}
async function stopServer() {
  const proc = server;
  server = null;
  if (!proc) return;
  await new Promise((resolve) => {
    let done = false;
    const failSafe = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      if (!done) { done = true; resolve(); }
    }, 4000);
    proc.on("exit", () => {
      clearTimeout(failSafe);
      if (!done) { done = true; resolve(); }
    });
    proc.kill("SIGTERM");
  });
}

function client() {
  const ws = new WebSocket(URL);
  const rec = [];
  ws.on("message", (d) => rec.push(JSON.parse(d.toString())));
  const of = (ev) => rec.filter((m) => m.event === ev);
  return {
    ws, rec, of,
    open: () => new Promise((r) => ws.on("open", r)),
    send: (o) => ws.send(JSON.stringify(o)),
    wait,
  };
}

await startServer();
try {
  // ---- 1. 連線即配發隨機唯一匿稱，且未登入不計入房間 ----
  const a = client();
  await a.open();
  await wait(200);
  const assignedA = a.of("assignedName")[0]?.data;
  check("A 收到 assignedName", !!assignedA, String(assignedA));
  check("匿稱格式 訪客-XXXX", /^訪客-[A-Z2-9]{4}$/.test(assignedA || ""), String(assignedA));
  check("未登入不出現在 userList", a.of("userList").every((m) => !m.data.includes(assignedA)),
    JSON.stringify(a.of("userList").pop()?.data));
  check("未登入 onlineCount 為 0", (a.of("onlineCount").pop()?.data ?? -1) === 0,
    String(a.of("onlineCount").pop()?.data));

  // ---- 2. 未登入不能發言 / 發火箭 / 送狗狗 ----
  a.send({ event: "message", data: "未登入訊息" });
  a.send({ event: "sendRocket" });
  a.send({ event: "sendDog" });
  await wait(200);
  check("未登入訊息被擋下", a.of("message").length === 0);
  check("未登入火箭被擋下", a.of("getRocket").length === 0);
  check("未登入狗狗被擋下", a.of("getDog").length === 0);
  check("未登入被提示", a.of("error").some((m) => m.data.includes("請先完成登入")),
    JSON.stringify(a.of("error").map((m) => m.data)));

  // ---- 3. 用配發匿稱完成登入 ----
  a.send({ event: "setName", data: assignedA });
  await wait(200);
  check("登入成功回 loginOk", a.of("loginOk")[0]?.data === assignedA, JSON.stringify(a.of("loginOk")));
  check("登入後 onlineCount = 1", a.of("onlineCount").pop()?.data === 1,
    String(a.of("onlineCount").pop()?.data));
  check("登入後出現在 userList", a.of("userList").pop()?.data.includes(assignedA),
    JSON.stringify(a.of("userList").pop()?.data));
  check("有歡迎系統訊息", a.of("system").some((m) => m.data.includes("歡迎")),
    JSON.stringify(a.of("system")));

  // ---- 4. 重複確認同一名稱（改名到自己）不可被誤判重名 ----
  a.send({ event: "setName", data: assignedA });
  await wait(200);
  check("重複確認自己名字仍成功", a.of("loginOk").length === 2,
    `loginOk=${a.of("loginOk").length} error=${JSON.stringify(a.of("error").map((e) => e.data))}`);
  check("重複確認不重複廣播歡迎",
    a.of("system").filter((m) => m.data.includes("歡迎")).length === 1,
    String(a.of("system").filter((m) => m.data.includes("歡迎")).length));

  // ---- 5. 第二個連線拿到不同匿稱 ----
  const b = client();
  await b.open();
  await wait(200);
  const assignedB = b.of("assignedName")[0]?.data;
  check("B 收到不同匿稱", !!assignedB && assignedB !== assignedA, `${assignedA} vs ${assignedB}`);

  // ---- 6. 自訂暱稱：重名拒絕、且拒絕後仍未登入 ----
  b.send({ event: "setName", data: assignedA });
  await wait(200);
  check("重名被拒絕", b.of("setNameError").some((m) => m.data.includes("已被使用")),
    JSON.stringify(b.rec.filter((m) => m.event === "setNameError")));
  check("被拒後 B 仍未登入", b.of("loginOk").length === 0 && (b.of("onlineCount").pop()?.data ?? 0) === 1,
    `onlineCount=${b.of("onlineCount").pop()?.data}`);
  b.send({ event: "setName", data: "小紅" });
  await wait(200);
  check("B 自訂名字成功", b.of("loginOk")[0]?.data === "小紅", JSON.stringify(b.of("loginOk")));
  check("onlineCount = 2", b.of("onlineCount").pop()?.data === 2, String(b.of("onlineCount").pop()?.data));

  // ---- 6b. 已登入者改名失敗不可被登出（error 只代表身分失敗） ----
  const errBefore = a.of("error").length;
  const nameErrBefore = a.of("setNameError").length;
  a.send({ event: "setName", data: "小紅" });
  await wait(250);
  check("改名失敗用 setNameError 而非 error",
    a.of("setNameError").length > nameErrBefore && a.of("error").length === errBefore,
    `error=${JSON.stringify(a.of("error").map((e) => e.data))} setNameError=${JSON.stringify(a.of("setNameError").map((e) => e.data))}`);
  a.send({ event: "message", data: "改名失敗後仍可發言" });
  await wait(250);
  check("改名失敗後身分仍有效（可發言）",
    b.of("message").some((m) => m.data?.text === "改名失敗後仍可發言"),
    JSON.stringify(b.of("message").slice(-1)));

  // ---- 7. 火箭名稱由伺服器決定（客戶端偽造無效） ----
  b.send({ event: "sendRocket", data: "偽造的名字" });
  await wait(200);
  const rocket = a.of("getRocket").pop();
  check("火箭名稱不可偽造", rocket?.data?.name === "小紅", JSON.stringify(rocket));

  // ---- 7b. 狗狗送禮：廣播、名稱不可偽造、限速與火箭各自獨立 ----
  b.send({ event: "sendDog", data: "偽造的名字" });
  await wait(250);
  const dog = a.of("getDog").pop();
  check("收到狗狗事件", a.of("getDog").length > 0, JSON.stringify(a.of("getDog")));
  check("狗狗名稱不可偽造", dog?.data?.name === "小紅", JSON.stringify(dog));
  const dogBase = a.of("getDog").length;
  await wait(1100); // 讓狗狗令牌回滿，確保測的是「連發」而不是「上一發還沒過期」
  b.send({ event: "sendDog" });
  b.send({ event: "sendDog" }); // 令牌只剩 0，應被擋
  await wait(300);
  check("狗狗連發 2 次只放行 1 次", a.of("getDog").length - dogBase === 1,
    `${a.of("getDog").length - dogBase}`);
  check("狗狗被限速有提示", b.of("notice").some((n) => n.data.includes("狗狗")),
    JSON.stringify([...new Set(b.of("notice").map((n) => n.data))]));

  // ---- 8. 訊息長度 / 空白過濾（每則間隔 1 秒以上，避免撞到限速） ----
  const msgBase = a.of("message").length;
  b.send({ event: "message", data: "x".repeat(500) });
  await wait(1100);
  b.send({ event: "message", data: "   " });
  await wait(1100);
  b.send({ event: "message", data: "正常訊息" });
  await wait(300);
  check("過長與空白訊息被丟棄",
    a.of("message").length - msgBase === 1 && a.of("message").at(-1).data.text === "正常訊息",
    JSON.stringify(a.of("message").slice(msgBase)));

  // ---- 9. 發言限速：至少 1 秒 1 則 ----
  await wait(1100); // 讓令牌回滿，確保測的是「連發」而不是「上一則還沒過期」
  const rateBase = a.of("message").length;
  b.send({ event: "message", data: "同時第1則" });
  b.send({ event: "message", data: "同時第2則" });
  b.send({ event: "message", data: "同時第3則" });
  await wait(300);
  const burstGot = a.of("message").length - rateBase;
  check("連發 3 則只放行 1 則", burstGot === 1, `收到 ${burstGot}/3`);
  check("被限速時有提示", b.of("notice").some((n) => n.data.includes("太快")),
    JSON.stringify([...new Set(b.of("notice").map((n) => n.data))]));
  await wait(1300);
  b.send({ event: "message", data: "滿1秒後的第2則" });
  await wait(300);
  check("滿 1 秒後放行", a.of("message").some((m) => m.data?.text === "滿1秒後的第2則"));

  // ---- 10. 火箭同樣不可連發 ----
  const rocketBase = a.of("getRocket").length;
  b.send({ event: "sendRocket" });
  b.send({ event: "sendRocket" });
  b.send({ event: "sendRocket" });
  await wait(300);
  check("火箭連發只放行 1 發", a.of("getRocket").length - rocketBase === 1,
    `收到 ${a.of("getRocket").length - rocketBase}/3`);

  // ---- 11. 未登入斷線不廣播離開；已登入斷線才廣播 ----
  const c = client();
  await c.open();
  await wait(200);
  const sysBefore = a.of("system").length;
  c.ws.close();
  await wait(300);
  check("未登入離開不廣播", a.of("system").length === sysBefore,
    JSON.stringify(a.of("system").slice(sysBefore)));

  b.ws.close();
  await wait(300);
  check("已登入離開有廣播", a.of("system").some((m) => m.data.includes("小紅 離開")),
    JSON.stringify(a.of("system").slice(sysBefore)));
  check("離開後 onlineCount = 1", a.of("onlineCount").pop()?.data === 1,
    String(a.of("onlineCount").pop()?.data));

  a.ws.close();
  await wait(100);
} finally {
  await stopServer();
}

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(failed ? `\n>>> ${failed} 項失敗` : "\n>>> 全部通過");
process.exit(failed ? 1 : 0);
