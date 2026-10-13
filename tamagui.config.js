// v3 preset（2.7.7）：v5 的 token 尺度會讓氣泡/輸入列塌陷，暫不升級
import { config } from "@tamagui/config/v3";
import { createTamagui } from "tamagui";

const tamaguiConfig = createTamagui(config);

export default tamaguiConfig;
