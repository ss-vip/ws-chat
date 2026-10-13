### ws-Chat 聊天室

使用 NodeJS Express、ws 套件，透過 WebSocket 技術實現多人即時線上聊天。前端採用 React（react-native-web + Tamagui + Vite），圖標使用 lucide。

- 登入：連線即由伺服器配發隨機且不重複的匿名名稱，確認後才進入聊天室
- 有命名功能：可自訂顯示名稱（1-20 字，不可重名），改名失敗不會被登出
- 有即時線上人數顯示、用戶進入及退出聊天室的提示
- 有發射火箭的 Donate 抖內送禮特效
- 對話氣泡風格，附時間戳與日期分隔
- 斷線自動重連（指數退避），未登入時登入畫面不可關閉
- 發言與火箭限速：同一連線至少 1 秒 1 次，超過會跳出提示

> DEMO WEB: [https://demo.koyeb.app/](https://demo.koyeb.app/)
> 備用站: [https://ws-chat-11hk.onrender.com/](https://ws-chat-11hk.onrender.com/)
> `* 也許需要些時間讓服務甦醒`

---

### 建構與執行

```bash
npm i           # 安裝依賴
npm start       # build 並啟動
```

打開瀏覽器進入頁面即可使用。`.env` 設定可參考 `.env.sample`，預設埠為 `8080`；亦可用啟動參數調整：

```bash
PORT=3000 npm start
```

### 本地開發（熱重載）

```bash
npm run serve  # 終端機 A：後端 server（埠 8080）
npm run dev  # 終端機 B：Vite dev server（預設 http://localhost:5197）
```

dev 模式的頁面由 Vite 提供，但 WebSocket 仍走同源 `/ws`，由 Vite `server.proxy` 轉發到 `localhost:8080`（見 `vite.config.mjs`），不需要另外設定位址。

### 測試

```bash
npm test   # 協定層回歸測試：自動起測試伺服器（預設 port 8093）
```
