function addNumbers(a, b) {
  return a - b; // 버그: -가 아니라 +여야 함
}
module.exports = { addNumbers };
