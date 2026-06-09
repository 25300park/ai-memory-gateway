const {
  callProviderModel,
  normalizeModelProfile
} = require("./model-provider.service");

async function getResponse({ modelProfile, finalPrompt, live = false }) {
  if (!modelProfile) {
    throw new Error("modelProfile is required.");
  }

  const normalizedProfile = normalizeModelProfile(modelProfile);

  const result = await callProviderModel({
    modelProfile: normalizedProfile,
    finalPrompt,
    live
  });

  return {
    answer: result.answer,
    storedAssistantMessage: result.storedAssistantMessage || result.answer,
    provider_result: result,
    model_profile: normalizedProfile
  };
}

module.exports = {
  getResponse
};
