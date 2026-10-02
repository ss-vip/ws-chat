### ws-Chat 聊天室

使用 NodeJS Express, ws 套件，透過 Websocket 技術實現多人即時線上聊天。前端採用 React（react-native-web + Tamagui + Vite），圖標使用 lucide。

- 有命名功能，用戶可自訂顯示名稱（1-20 字，不可重名）
- 有用戶進入及退出聊天室的提示
- 有即時線上人數顯示
- 有發射火箭的 Donate 抖內送禮特效
- WeChat/LINE 風格對話氣泡，附時間戳與日期分隔
- 些許不完善的功能將持續調整程式碼

> DEMO WEB: [https://demo.koyeb.app/](https://demo.koyeb.app/)
備用站: [https://ws-chat-11hk.onrender.com/](https://ws-chat-11hk.onrender.com/)

`* 也許需要些時間讓服務甦醒`

---

### Try it

1. Clone code, change env setting.
2. Install and build the web frontend (outputs to `dist/`)

```bash
npm i && npm run build:web
```

3. Run the server

```bash
npm run start
```

4. Open your browser ,go host url and play

### 開發前端

```bash
npm run dev   # 啟動 Vite dev server（熱重載，API/WS 代理未設定時請另行處理）
```
