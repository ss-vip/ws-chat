import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, useWindowDimensions } from "react-native";
import {
  Adapt,
  Button,
  Dialog,
  Input,
  SizableText,
  XStack,
  YStack,
  isWeb,
} from "tamagui";
import { LinearGradient } from "@tamagui/linear-gradient";
import { LogOut, MessageCircle, Rocket, Send, Users, WifiOff } from "lucide-react";

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

let confettiScriptLoading = false;
function loadConfettiScript() {
  if (!isWeb || confettiScriptLoading || window.confetti) return;
  confettiScriptLoading = true;
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js";
  script.async = true;
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
  const [nameModal, setNameModal] = useState({ visible: false, error: "", value: "" });
  const wsRef = useRef(null);
  const scrollRef = useRef(null);

  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [
      ...prev.slice(-(MAX_MESSAGES - 1)),
      { id: Date.now() + Math.random(), ts: Date.now(), ...msg },
    ]);
  }, []);

  const promptAndSendName = useCallback((getError) => {
    setNameModal({ visible: true, error: getError || "", value: "" });
  }, []);

  const confirmName = useCallback(() => {
    const name = nameModal.value.trim();
    if (!name || name.length > 20) {
      setNameModal((m) => ({ ...m, error: "暱稱需為 1-20 個字" }));
      return;
    }
    wsRef.current?.send(JSON.stringify({ event: "setName", data: name }));
    setUserName(name);
    setNameModal((m) => ({ ...m, visible: false }));
  }, [nameModal.value]);

  const connect = useCallback(() => {
    wsRef.current?.close();
    const protocol = location.protocol === "http:" ? "ws://" : "wss://";
    const url = `${protocol}${location.hostname}${location.port ? ":" + location.port : ""}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    const timeout = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        setNotice("無法連線到伺服器");
      }
    }, 5000);

    ws.onopen = () => {
      window.clearTimeout(timeout);
      setConnected(true);
      setNotice("");
      promptAndSendName("");
    };

    ws.onmessage = (response) => {
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
        case "system":
          appendMessage({ kind: "system", text: res.data });
          break;
        case "error":
          setNotice(res.data);
          setUserName("");
          setConnected(true);
          promptAndSendName(res.data);
          break;
        case "message":
          appendMessage({ kind: "chat", name: res.data.name, text: res.data.text });
          break;
      }
    };

    ws.onclose = () => {
      window.clearTimeout(timeout);
      setConnected(false);
      setNotice((prev) => prev || "連線已斷開");
    };
  }, [appendMessage, promptAndSendName]);

  useEffect(() => {
    loadConfettiScript();
    connect();
    return () => wsRef.current?.close();
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
    if (!text) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: "message", data: text }));
      setInputText("");
    } else {
      setNotice("訊息發送失敗，請重新連線");
    }
  }, [inputText]);

  // Enter 送出； keyCode 229 / isComposing 代表 IME 組字中（確認候選字），不可送出
  const sendRocket = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && userName) {
      ws.send(JSON.stringify({ event: "sendRocket", data: userName }));
    } else {
      setNotice("訊息發送失敗，請重新連線");
    }
  };

  const logout = () => {
    wsRef.current?.close();
    setUserName("");
    connect();
  };

  const renderMessage = (m, idx) => {
    const showDateSep = idx === 0 || formatDate(m.ts) !== formatDate(messages[idx - 1].ts);

    if (m.kind !== "chat") {
      const isRocket = m.kind === "rocket";
      return (
        <React.Fragment key={m.id}>
          {showDateSep && <DateSeparator ts={m.ts} />}
          <YStack alignItems="center" marginBottom="$3">
            <XStack
              alignItems="center"
              gap="$1.5"
              backgroundColor={isRocket ? "#fff6dd" : "#e4e9f0"}
              borderColor={isRocket ? "#f2d98a" : undefined}
              borderWidth={isRocket ? 1 : 0}
              borderRadius="$4"
              paddingHorizontal="$3"
              paddingVertical="$1"
            >
              {isRocket && <Rocket size={13} color="#9a6b00" />}
              <SizableText size="$2" color={isRocket ? "#9a6b00" : "#8a94a6"} textAlign="center">
                {isRocket ? `收到來自 ${m.name} 發射的火箭` : m.text}
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
        overflow="hidden"
        elevations="$2"
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
            <YStack flex={1} onPress={() => promptAndSendName("")} cursor="pointer">
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
              pressStyle={{ opacity: 0.7 }}
              onPress={() => setShowUsers(true)}
            />
            <Button
              size="$2"
              chromeless
              circular
              backgroundColor="rgba(255,255,255,0.16)"
              icon={<LogOut size={16} color="#fff" />}
              pressStyle={{ opacity: 0.7 }}
              onPress={logout}
            />
          </XStack>
        </LinearGradient>

        {/* Messages */}
        <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: "#eef1f6" }}>
          <YStack paddingHorizontal="$3.5" paddingTop="$3.5" paddingBottom="$2">
            {messages.length === 0 && (
              <YStack flex={1} height={300} justifyContent="center" alignItems="center" gap="$2">
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
            placeholder={userName ? "輸入訊息..." : "先設定暱稱才能聊天喔"}
            placeholderTextColor="#9aa4b2"
            onSubmitEditing={sendMessage}
          />
          <Button
            size="$4"
            circular
            chromeless
            backgroundColor="#fdece4"
            icon={<Rocket size={19} color="#e8590c" />}
            opacity={connected ? 1 : 0.45}
            pressStyle={{ opacity: 0.7 }}
            onPress={sendRocket}
          />
          <Button
            size="$4"
            circular
            chromeless
            backgroundColor={PRIMARY}
            icon={<Send size={18} color="#fff" />}
            opacity={connected ? 1 : 0.45}
            pressStyle={{ opacity: 0.7 }}
            onPress={sendMessage}
          />
        </XStack>

        <SizableText size="$1" color="#b3bac4" textAlign="center" paddingVertical="$1.5">
          ＊ 這是個 DEMO 頁面，程式碼在 Github
        </SizableText>
      </YStack>

      {/* 斷線提示 */}
      {!connected && (
        <YStack
          position="absolute" top={76} alignSelf="center"
          backgroundColor="#dc2626" borderRadius="$10" paddingHorizontal="$4" paddingVertical="$2"
          onPress={connect} cursor="pointer"
          elevations="$1"
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

      {/* 暱稱 Dialog */}
      <Dialog open={nameModal.visible} onOpenChange={(v) => !v && setNameModal((m) => ({ ...m, visible: false }))}>
        <Dialog.Portal>
          <Dialog.Overlay key="overlay" animation="quick" opacity={0.5} enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
          <Dialog.Content
            key="content"
            bordered
            elevate
            animation={[
              "quick",
              { opacity: { overshootClamping: true } },
            ]}
            enterStyle={{ x: 0, y: -8, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: -8, opacity: 0, scale: 0.9 }}
            backgroundColor="#fff"
            borderRadius="$4"
            padding="$4"
            width={isWide ? 360 : "86%"}
            maxWidth={420}
            elevate
          >
            <Dialog.Title fontSize={17} fontWeight="700">設定暱稱</Dialog.Title>
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
              onSubmitEditing={confirmName}
            />
            <YStack gap="$2" marginTop="$4">
              <Dialog.Close asChild>
                <Button backgroundColor={PRIMARY} borderRadius="$3" onPress={confirmName}>
                  <Button.Text color="#fff" fontWeight="600">開始聊天</Button.Text>
                </Button>
              </Dialog.Close>
              <Dialog.Close asChild>
                <Button chromeless borderRadius="$3" onPress={() => setNameModal((m) => ({ ...m, visible: false }))}>
                  <Button.Text color="#8a94a6">稍後再說</Button.Text>
                </Button>
              </Dialog.Close>
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
            bordered
            elevate
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
              {users.map((name, i) => (
                <XStack key={i} alignItems="center" gap="$2.5" paddingVertical="$1">
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
                <Button chromeless borderRadius="$3">
                  <Button.Text color="#8a94a6">關閉</Button.Text>
                </Button>
              </Dialog.Close>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </YStack>
  );
}
