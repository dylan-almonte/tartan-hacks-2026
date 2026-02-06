const MESSAGE_TYPE = "NUDGEPAY_SET_DATA";

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== MESSAGE_TYPE) {
    return;
  }

  if (!message.payload) {
    sendResponse({ ok: false, error: "Missing payload" });
    return;
  }

  chrome.storage.local.set(message.payload, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ ok: true });
  });

  return true;
});
