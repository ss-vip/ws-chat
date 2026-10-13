import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions } from "react-native";
import {
  Button,
  Dialog,
  Input,
  SizableText,
  XStack,
  YStack,
  isWeb,
} from "tamagui";
import { LinearGradient } from "@tamagui/linear-gradient";
import { Dog, Github, LogOut, MessageCircle, Rocket, Send, Users, WifiOff } from "lucide-react";

const MAX_MESSAGES = 100;
const PRIMARY = "#1a73e8";
const AVATAR_COLORS = ["#4f7cf0", "#22b07d", "#f0932b", "#eb5757", "#9b59b6", "#16a085", "#e84393", "#2d98da"];

function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || "?")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("zh-TW");
}

function fireConfetti() {
  if (isWeb && typeof window.confetti === "function") {
    window.confetti();
    window.setTimeout(() => window.confetti.reset(), 3000);
  }
}

const confettiCDN = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js";

// 狗狗送禮特效素材。之後換成真 GIF：把檔案放到 public/dog.gif，並把下面改成 "/dog.gif" 即可
const dogEffectSrc = "/dog.svg";

// 狗狗叫聲素材。換成別的音檔時改這裡（wav/mp3 皆可）
const dogBarkSrc = "/dog-bark.wav";
let dogBarkAudio = null;
function playDogBark() {
  if (!isWeb) return;
  try {
    if (!dogBarkAudio) dogBarkAudio = new window.Audio(dogBarkSrc);
    dogBarkAudio.currentTime = 0; // 連叫時從頭播
    const p = dogBarkAudio.play();
    // 瀏覽器在使用者有互動前會拒絕自動播放 → 安靜略過，不影響特效
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    // 音訊失敗不影響特效
  }
}
let confettiScriptLoading = false;
function loadConfettiScript() {
  if (!isWeb || confettiScriptLoading || window.confetti) return;
  confettiScriptLoading = true;
  const script = document.createElement("script");
  script.src = confettiCDN;
  script.async = true;
  // CDN 掛掉或被擋時要放開旗標，否則永遠不再重試
  script.onload = () => { confettiScriptLoading = false; };
  script.onerror = () => { confettiScriptLoading = false; script.remove(); };
  document.head.appendChild(script);
}

function Avatar({ name, size = 34 }) {
  const label = String(name || "?").slice(0, 1).toUpperCase();
  return (
    <YStack
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor={avatarColor(name)}
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      <SizableText color="#fff" fontSize={size * 0.42} fontWeight="700">{label}</SizableText>
    </YStack>
  );
}

function DateSeparator({ ts }) {
  return (
    <YStack alignItems="center" marginVertical="$3">
      <YStack backgroundColor="#e2e7ee" borderRadius="$3" paddingHorizontal="$2.5" paddingVertical="$1">
        <SizableText size="$2" color="#7c8694">{formatDate(ts)}</SizableText>
      </YStack>
    </YStack>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const bubbleMax = isWide ? "58%" : "74%";

  const [userName, setUserName] = useState("");
  const [onlineCount, setOnlineCount] = useState(0);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("");
  const [showUsers, setShowUsers] = useState(false);
  const [dogVisible, setDogVisible] = useState(false);
  const [nameModal, setNameModal] = useState({ visible: false, error: "", value: "" });
  const wsRef = useRef(null);
  const scrollRef = useRef(null);
  const connectRef = useRef(() => {});
  const retryRef = useRef(0);
  const retryTimerRef = useRef(null);
  const connectTimeoutRef = useRef(null);
  const dogTimerRef = useRef(null);

  const isLoggedIn = userName !== "";

  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [
      ...prev.slice(-(MAX_MESSAGES - 1)),
      { id: Date.now() + Math.random(), ts: Date.now(), ...msg },
    ]);
  }, []);

  // 狗狗特效：顯示後自動消失；短時間重複觸發只會重設計時，不會堆疊
  const showDogEffect = useCallback(() => {
    setDogVisible(true);
    playDogBark();
    if (dogTimerRef.current) window.clearTimeout(dogTimerRef.current);
    dogTimerRef.current = window.setTimeout(() => setDogVisible(false), 3000);
  }, []);

  useEffect(() => () => {
    if (dogTimerRef.current) window.clearTimeout(dogTimerRef.current);
  }, []);

  // 未登入時登入畫面不可關閉；已登入才允許取消「修改暱稱」
  // Tamagui v3 傳進來的 event 不保證有 preventDefault，缺 API 時靠 onOpenChange 的守門兜底
  const blockDismiss = useCallback((event) => {
    if (isLoggedIn) return;
    if (typeof event?.preventDefault === "function") event.preventDefault();
  }, [isLoggedIn]);

  const promptAndSendName = useCallback(() => {
    setNameModal((m) => ({ visible: true, error: "", value: m.value }));
  }, []);

  const confirmName = useCallback(() => {
    const name = nameModal.value.trim();
    if (!name || name.length > 20) {
      setNameModal((m) => ({ ...m, error: "暱稱需為 1-20 個字" }));
      return;
    }
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setNameModal((m) => ({ ...m, error: "連線中斷，請稍候重試" }));
      return;
    }
    // 不先斬後奏：等伺服器回 loginOk 才算登入成功
    ws.send(JSON.stringify({ event: "setName", data: name }));
  }, [nameModal.value]);

  // Enter 送出；isComposing / keyCode 229 代表 IME 組字中（確認候選字），不可送出
  const enterSubmit = (fn) => (e) => {
    if (e.key !== "Enter") return;
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    fn();
  };

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
    retryRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    window.clearTimeout(retryTimerRef.current);
    window.clearTimeout(connectTimeoutRef.current);
    retryTimerRef.current = null;
    connectTimeoutRef.current = null;
    setConnected(false); // 重連期間不算已連線，避免沿用舊連線狀態

    const prev = wsRef.current;
    if (prev) {
      prev.onclose = null; // 拋棄舊連線事件，避免覆寫新連線狀態
      prev.close();
    }

    const protocol = location.protocol === "http:" ? "ws://" : "wss://";
    const sameOrigin = `${protocol}${location.hostname}${location.port ? ":" + location.port : ""}`;
    // 連線位址固定為 <host>/ws：dev 由 Vite proxy 轉發，正式環境同源直連
    const base = import.meta.env.VITE_WS_URL || sameOrigin;
    const url = base.endsWith("/ws") ? base : `${base.replace(/\/+$/, "")}/ws`;

    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      // 例外不可外拋到 React（會整棵樹卸載、畫面卡死）
      setNotice("無法連線到伺服器");
      scheduleRetry();
      return;
    }
    wsRef.current = ws;

    connectTimeoutRef.current = window.setTimeout(() => {
      if (wsRef.current !== ws) return;
      if (ws.readyState !== WebSocket.OPEN) {
        setNotice("無法連線到伺服器");
        ws.close(); // 觸發 onclose → 自動重連
      }
    }, 5000);

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      window.clearTimeout(connectTimeoutRef.current);
      retryRef.current = 0;
      setConnected(true);
      setNotice("");
    };

    ws.onmessage = (response) => {
      if (wsRef.current !== ws) return;
      let res;
      try {
        res = JSON.parse(response.data);
      } catch {
        return;
      }
      switch (res.event) {
        case "onlineCount":
          setOnlineCount(res.data);
          break;
        case "userList":
          setUsers(res.data);
          break;
        case "getRocket":
          appendMessage({ kind: "rocket", name: res.data.name });
          fireConfetti();
          break;
        case "getDog":
          appendMessage({ kind: "dog", name: res.data.name });
          showDogEffect();
          break;
        case "system":
          appendMessage({ kind: "system", text: res.data });
          break;
        case "notice":
          // 非致命提示（例如限速），不影響登入狀態
          setNotice(res.data);
          break;
        case "assignedName":
          // 系統配發的隨機匿稱：登入畫面必定開啟，且不可取消
          setNameModal({ visible: true, error: "", value: res.data });
          break;
        case "loginOk":
          setUserName(res.data);
          setNameModal({ visible: false, error: "", value: "" });
          break;
        case "setNameError":
          // 暱稱輸入問題：只在登入視窗內提示，不影響已成立的身分
          setNameModal((m) => ({ ...m, visible: true, error: res.data }));
          break;
        case "error":
          // 伺服器不承認目前身份 → 回到未登入，登入畫面重新擋下
          setNotice(res.data);
          setUserName("");
          setNameModal((m) => ({ visible: true, error: res.data, value: m.value }));
          break;
        case "message":
          appendMessage({ kind: "chat", name: res.data.name, text: res.data.text });
          break;
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      window.clearTimeout(connectTimeoutRef.current);
      setConnected(false);
      setUserName(""); // 連線失效即失效登入狀態
      setNotice((prevNotice) => prevNotice || "連線已斷開");
      scheduleRetry();
    };
  }, [appendMessage, scheduleRetry]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    loadConfettiScript();
    connect();
    return () => {
      window.clearTimeout(retryTimerRef.current);
      window.clearTimeout(connectTimeoutRef.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isWeb) window.setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
  }, [messages]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text || !isLoggedIn) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: "message", data: text }));
      setInputText("");
    } else {
      setNotice("訊息發送失敗，請重新連線");
    }
  }, [inputText, isLoggedIn]);

  const sendRocket = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && isLoggedIn) {
      // 暱稱由伺服器自行填入，不接受客戶端指定
      ws.send(JSON.stringify({ event: "sendRocket" }));
    } else {
      setNotice("訊息發送失敗，請重新連線");
    }
  };

  const sendDog = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && isLoggedIn) {
      // 暱稱由伺服器自行填入，不接受客戶端指定
      ws.send(JSON.stringify({ event: "sendDog" }));
    } else {
      setNotice("訊息發送失敗，請重新連線");
    }
  };

  const logout = () => {
    setUserName("");
    setMessages([]);
    retryRef.current = 0;
    connect(); // 關舊連線、開新連線 → 重新配發匿稱並回到登入畫面
  };

  const renderMessage = (m, idx) => {
    const showDateSep = idx === 0 || formatDate(m.ts) !== formatDate(messages[idx - 1].ts);

    if (m.kind !== "chat") {
      const isRocket = m.kind === "rocket";
      const isDog = m.kind === "dog";
      const isGift = isRocket || isDog;
      const giftText = isRocket ? "發射的火箭" : "送出的狗狗";
      return (
        <React.Fragment key={m.id}>
          {showDateSep && <DateSeparator ts={m.ts} />}
          <YStack alignItems="center" marginBottom="$3">
            <XStack
              alignItems="center"
              gap="$1.5"
              backgroundColor={isRocket ? "#fff6dd" : isDog ? "#e7f7ee" : "#e4e9f0"}
              borderColor={isRocket ? "#f2d98a" : isDog ? "#b6e2c8" : undefined}
              borderWidth={isGift ? 1 : 0}
              borderRadius="$4"
              paddingHorizontal="$3"
              paddingVertical="$1"
            >
              {isRocket && <Rocket size={13} color="#9a6b00" />}
              {isDog && <Dog size={13} color="#2f7d45" />}
              <SizableText size="$2" color={isRocket ? "#9a6b00" : isDog ? "#2f7d45" : "#8a94a6"} textAlign="center">
                {isGift ? `收到來自 ${m.name} ${giftText}` : m.text}
              </SizableText>
            </XStack>
          </YStack>
        </React.Fragment>
      );
    }

    const time = (
      <SizableText size="$1" color="#a3adba" marginHorizontal="$1.5" marginBottom="$1" flexShrink={0}>
        {formatTime(m.ts)}
      </SizableText>
    );

    if (m.name === userName) {
      return (
        <React.Fragment key={m.id}>
          {showDateSep && <DateSeparator ts={m.ts} />}
          <XStack justifyContent="flex-end" alignItems="flex-end" gap="$2" marginBottom="$3">
            {time}
            <YStack
              backgroundColor={PRIMARY}
              borderTopRightRadius="$1"
              borderRadius="$3.5"
              paddingHorizontal="$3"
              paddingVertical="$2"
              flexShrink={1}
              maxWidth={bubbleMax}
            >
              <SizableText color="#fff" fontSize={15} lineHeight={21}>{m.text}</SizableText>
            </YStack>
            <Avatar name={userName || "我"} />
          </XStack>
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key={m.id}>
        {showDateSep && <DateSeparator ts={m.ts} />}
        <XStack justifyContent="flex-start" alignItems="flex-start" gap="$2" marginBottom="$3">
          <Avatar name={m.name} />
          <YStack flexShrink={1} maxWidth={bubbleMax}>
            <SizableText size="$1" color="#8a94a6" marginBottom="$1" marginLeft="$0.5">{m.name}</SizableText>
            <XStack alignItems="flex-end">
              <YStack
                backgroundColor="#fff"
                borderTopLeftRadius="$1"
                borderRadius="$3.5"
                paddingHorizontal="$3"
                paddingVertical="$2"
                flexShrink={1}
              >
                <SizableText color="#1f2937" fontSize={15} lineHeight={21}>{m.text}</SizableText>
              </YStack>
              {time}
            </XStack>
          </YStack>
        </XStack>
      </React.Fragment>
    );
  };

  return (
    <YStack flex={1} backgroundColor="#e7ecf3" paddingVertical={isWide ? 24 : 0} paddingHorizontal={isWide ? 16 : 0}>
      <YStack
        flex={1}
        backgroundColor="#fff"
        maxWidth={980}
        width="100%"
        alignSelf="center"
        borderRadius={isWide ? "$5" : 0}
        // 沒有 hidden 的話 borderRadius 只是裝飾，header/輸入列的直角會凸出圓角外
        overflow="hidden"
        style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.06), 0 12px 32px rgba(16,24,40,0.10)" }}
      >
        {/* Header */}
        <LinearGradient colors={["#1f7ae0", "#155bb5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <XStack alignItems="center" gap="$2.5" paddingHorizontal="$3.5" paddingVertical="$3" position="relative" zIndex={1}>
            <YStack
              width={38} height={38} borderRadius={19}
              backgroundColor="rgba(255,255,255,0.18)"
              alignItems="center" justifyContent="center"
            >
              <MessageCircle size={19} color="#fff" />
            </YStack>
            <YStack flex={1} onPress={promptAndSendName} cursor="pointer">
              <SizableText color="#fff" fontSize={16} fontWeight="700">ws-Chat 即時聊天</SizableText>
              <XStack alignItems="center" gap="$1" marginTop="$0.5">
                <YStack width={7} height={7} borderRadius={4} backgroundColor="#5df08d" />
                <SizableText color="rgba(255,255,255,0.85)" size="$2" numberOfLines={1}>
                  {userName ? userName : connected ? "點此設定暱稱" : "連線中..."}．{onlineCount} 人線上
                </SizableText>
              </XStack>
            </YStack>
            <Button
              size="$2"
              chromeless
              circular
              backgroundColor="rgba(255,255,255,0.16)"
              icon={<Users size={16} color="#fff" />}
              // 主題的 backgroundHover(#f6f6f6) 會蓋掉自訂底色，白色圖示直接隱形 → 改加深底色
              hoverStyle={{ backgroundColor: "rgba(0,0,0,0.18)" }}
              pressStyle={{ opacity: 0.7 }}
              onPress={() => setShowUsers(true)}
            />
            <Button
              size="$2"
              chromeless
              circular
              backgroundColor="rgba(255,255,255,0.16)"
              icon={<LogOut size={16} color="#fff" />}
              hoverStyle={{ backgroundColor: "rgba(0,0,0,0.18)" }}
              pressStyle={{ opacity: 0.7 }}
              onPress={logout}
            />
          </XStack>
        </LinearGradient>

        {/* Messages */}
        <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: "#eef1f6" }}>
          <YStack paddingHorizontal="$3.5" paddingTop="$3.5" paddingBottom="$2">
            {messages.length === 0 && (
              <YStack
                flexGrow={1}
                minHeight={280}
                alignItems="center"
                gap="$2"
                // v5 preset 下 justifyContent prop 沒被套用，用原生 style 保證置中
                style={{ justifyContent: "center" }}
              >
                <MessageCircle size={34} color="#c3cbd6" />
                <SizableText color="#9aa4b2" size="$3">還沒有訊息，說點什麼吧</SizableText>
              </YStack>
            )}
            {messages.map(renderMessage)}
          </YStack>
        </ScrollView>

        {/* Input row */}
        <XStack
          alignItems="center"
          gap="$2"
          paddingHorizontal="$3"
          paddingVertical="$2.5"
          borderTopWidth={1}
          borderTopColor="#e5e9ef"
          backgroundColor="#fff"
        >
          <Input
            flex={1}
            size="$4"
            borderRadius="$10"
            backgroundColor="#f1f3f6"
            borderWidth={0}
            value={inputText}
            onChangeText={setInputText}
            maxLength={200}
            placeholder={userName ? "輸入訊息..." : "完成登入後即可聊天"}
            placeholderTextColor="#9aa4b2"
            onKeyDown={enterSubmit(sendMessage)}
          />
          <Button
            size="$4"
            circular
            chromeless
            backgroundColor="#e7f7ee"
            icon={<Dog size={19} color="#2f7d45" />}
            hoverStyle={{ backgroundColor: "#f2fbf6" }}
            opacity={connected && isLoggedIn ? 1 : 0.45}
            disabled={!connected || !isLoggedIn}
            pressStyle={{ opacity: 0.7 }}
            onPress={sendDog}
          />
          <Button
            size="$4"
            circular
            chromeless
            backgroundColor="#fdece4"
            icon={<Rocket size={19} color="#e8590c" />}
            hoverStyle={{ backgroundColor: "#fff5ee" }}
            opacity={connected && isLoggedIn ? 1 : 0.45}
            disabled={!connected || !isLoggedIn}
            pressStyle={{ opacity: 0.7 }}
            onPress={sendRocket}
          />
          <Button
            size="$4"
            circular
            chromeless
            backgroundColor={PRIMARY}
            icon={<Send size={18} color="#fff" />}
            hoverStyle={{ backgroundColor: "#1558b0" }}
            opacity={connected && isLoggedIn ? 1 : 0.45}
            disabled={!connected || !isLoggedIn}
            pressStyle={{ opacity: 0.7 }}
            onPress={sendMessage}
          />
        </XStack>

        <XStack
          alignItems="center"
          justifyContent="center"
          gap="$1.5"
          // 與卡片底部留白，避免連結文字貼齊下緣
          paddingBottom="$3"
        >
          <Button
            size="$2"
            chromeless
            // 注意：tamagui 2.7.7 的 <Button.Icon as={X} /> 不會渲染（靜默無輸出），
            // 圖標一律用 icon prop（與 app 其他按鈕一致）
            icon={<Github size={16} color="#6b7280" />}
            hoverStyle={{ backgroundColor: "#f1f4f9" }}
            onPress={() => {
              window.open("https://github.com/ss-vip/ws-chat", "_blank", "noopener,noreferrer");
            }}
          >
            <Button.Text color="#6b7280" hoverStyle={{ color: "#374151" }}>Github</Button.Text>
          </Button>
        </XStack>
      </YStack>

      {/* 斷線提示 */}
      {!connected && (
        <YStack
          position="absolute" top={76} alignSelf="center"
          backgroundColor="#dc2626" borderRadius="$10" paddingHorizontal="$4" paddingVertical="$2"
          onPress={connect} cursor="pointer"
          style={{ boxShadow: "0 6px 16px rgba(220,38,38,0.35)" }}
        >
          <XStack alignItems="center" gap="$1.5">
            <WifiOff size={14} color="#fff" />
            <SizableText color="#fff" size="$2">連線已斷開，點擊重新連線</SizableText>
          </XStack>
        </YStack>
      )}

      {/* Toast */}
      {notice !== "" && (
        <YStack
          position="absolute" bottom={90} alignSelf="center"
          backgroundColor="rgba(15,23,42,0.82)" borderRadius="$3" paddingHorizontal="$3.5" paddingVertical="$2"
        >
          <SizableText color="#fff" size="$2">{notice}</SizableText>
        </YStack>
      )}

      {/* 狗狗送禮特效：出現在輸入框上方，純展示不攔截點擊 */}
      {dogVisible && (
        <YStack position="absolute" bottom={132} alignSelf="center" pointerEvents="none">
          <img src={dogEffectSrc} alt="狗狗送禮" width={184} height={184} style={{ display: "block" }} />
        </YStack>
      )}

      {/* 暱稱 Dialog：未登入時即登入閘門，不可取消（Esc/點外部皆不關閉） */}
      <Dialog
        open={nameModal.visible}
        onOpenChange={(v) => {
          if (v || isLoggedIn) setNameModal((m) => ({ ...m, visible: v }));
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay key="overlay" animation="quick" opacity={0.5} enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
          <Dialog.Content
            key="content"
            // 不用 bordered/elevate：v5 preset 沒有 border/elevation token，會解析成黑框且沒陰影
            borderWidth={1}
            borderColor="#e5e9ef"
            style={{ boxShadow: "0 12px 32px rgba(16,24,40,0.18)" }}
            animation="quick"
            enterStyle={{ x: 0, y: -8, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: -8, opacity: 0, scale: 0.9 }}
            onEscapeKeyDown={blockDismiss}
            onPointerDownOutside={blockDismiss}
            onFocusOutside={blockDismiss}
            backgroundColor="#fff"
            borderRadius="$4"
            padding="$4"
            width={isWide ? 360 : "86%"}
            maxWidth={420}
          >
            <Dialog.Title fontSize={17} fontWeight="700">
              {isLoggedIn ? "修改暱稱" : "進入聊天室"}
            </Dialog.Title>
            {!isLoggedIn && (
              <SizableText size="$2" color="#7c8694" marginTop="$1">
                系統已為你配發一個不重複的匿名名稱，可直接沿用，或改成自己的名字。
              </SizableText>
            )}
            {nameModal.error !== "" && (
              <SizableText color="#dc2626" size="$2" marginTop="$1">{nameModal.error}</SizableText>
            )}
            <Input
              marginTop="$2"
              size="$4"
              borderRadius="$3"
              value={nameModal.value}
              onChangeText={(v) => setNameModal((m) => ({ ...m, value: v }))}
              maxLength={20}
              placeholder="請輸入暱稱（1-20 字）"
              placeholderTextColor="#9aa4b2"
              autoFocus
              onKeyDown={enterSubmit(confirmName)}
            />
            {!connected && (
              <SizableText size="$2" color="#b26a00" marginTop="$1" onPress={connect} cursor="pointer">
                連線中斷，自動重連中…（點此立即重試）
              </SizableText>
            )}
            <YStack gap="$2" marginTop="$4">
              <Button
                backgroundColor={PRIMARY}
                hoverStyle={{ backgroundColor: "#1558b0" }}
                borderRadius="$3"
                disabled={!connected}
                opacity={connected ? 1 : 0.6}
                onPress={confirmName}
              >
                <Button.Text color="#fff" fontWeight="600">
                  {isLoggedIn ? "確認修改" : "進入聊天室"}
                </Button.Text>
              </Button>
              {isLoggedIn && (
                <Button
                  chromeless
                  borderRadius="$3"
                  hoverStyle={{ backgroundColor: "#f1f4f9" }}
                  onPress={() => setNameModal((m) => ({ ...m, visible: false }))}
                >
                  <Button.Text color="#6b7280" hoverStyle={{ color: "#374151" }}>取消</Button.Text>
                </Button>
              )}
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      {/* 線上用戶 Dialog */}
      <Dialog open={showUsers} onOpenChange={setShowUsers}>
        <Dialog.Portal>
          <Dialog.Overlay key="overlay" animation="quick" opacity={0.5} enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
          <Dialog.Content
            key="content"
            // 不用 bordered/elevate：v5 preset 沒有 border/elevation token，會解析成黑框且沒陰影
            borderWidth={1}
            borderColor="#e5e9ef"
            style={{ boxShadow: "0 12px 32px rgba(16,24,40,0.18)" }}
            animation="quick"
            enterStyle={{ x: 0, y: -8, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: -8, opacity: 0, scale: 0.9 }}
            backgroundColor="#fff"
            borderRadius="$4"
            padding="$4"
            width={isWide ? 360 : "86%"}
            maxWidth={420}
          >
            <Dialog.Title fontSize={17} fontWeight="700">線上用戶（{onlineCount}）</Dialog.Title>
            <YStack marginTop="$2" gap="$1">
              {users.map((name) => (
                <XStack key={name} alignItems="center" gap="$2.5" paddingVertical="$1">
                  <Avatar name={name} size={30} />
                  <SizableText
                    color={name === userName ? PRIMARY : "#374151"}
                    fontWeight={name === userName ? "600" : "400"}
                    numberOfLines={1}
                  >
                    {name}{name === userName ? "（我）" : ""}
                  </SizableText>
                </XStack>
              ))}
            </YStack>
            <YStack marginTop="$4">
              <Dialog.Close asChild>
                <Button chromeless borderRadius="$3" hoverStyle={{ backgroundColor: "#f1f4f9" }}>
                  <Button.Text color="#6b7280" hoverStyle={{ color: "#374151" }}>關閉</Button.Text>
                </Button>
              </Dialog.Close>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </YStack>
  );
}
