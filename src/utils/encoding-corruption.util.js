"use strict";

// U+FFFD (REPLACEMENT CHARACTER) is what Node/DB drivers substitute for bytes
// they couldn't decode - a handful of these in a long text can be legitimate
// (e.g. a genuinely unusual character), but a high ratio means the whole
// string went through a bad charset conversion somewhere upstream (mojibake).
const CORRUPTION_RATIO_THRESHOLD = 0.05;
const REPLACEMENT_CHAR = "�";

function detectEncodingCorruption(text) {
  const value = String(text || "");

  if (value.length === 0) {
    return { corrupted: false, replacement_char_count: 0, ratio: 0 };
  }

  let replacementCharCount = 0;
  for (const char of value) {
    if (char === REPLACEMENT_CHAR) replacementCharCount += 1;
  }

  const ratio = replacementCharCount / value.length;

  return {
    corrupted: ratio >= CORRUPTION_RATIO_THRESHOLD,
    replacement_char_count: replacementCharCount,
    ratio
  };
}

module.exports = {
  CORRUPTION_RATIO_THRESHOLD,
  detectEncodingCorruption
};
