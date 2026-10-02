// Web build 不需要 react-native 原生內部模組（由 react-native-svg 的 fabric 路徑引入）
module.exports = function stub() {
  return function () { return null; };
};
