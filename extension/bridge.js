chrome.runtime.onMessage.addListener((message) => {
  window.postMessage({ source: "nudgepay-extension", payload: message }, "*");
});
