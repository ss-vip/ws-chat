// Web build 不需要 react-native 原生內部模組（Libraries/* 路徑由 vite alias 導到這裡）
module.exports = function stub() {
  return function () { return null; };
};
