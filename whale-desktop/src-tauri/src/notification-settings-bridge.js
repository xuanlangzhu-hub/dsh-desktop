(() => {
  "use strict";

  const initial = __WHALE_INITIAL_NOTIFICATION_SETTINGS__;
  const prefix = "__WHALE_NOTIFICATION_SETTINGS__";
  const keyPattern = /^dsh-notification\.v\d+$/;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;

  const post = (payload) => {
    try {
      window.chrome?.webview?.postMessage(prefix + JSON.stringify(payload));
    } catch {
      // Persistence is optional; the plugin's own localStorage remains usable.
    }
  };

  for (const [key, value] of Object.entries(initial)) {
    if (keyPattern.test(key) && typeof value === "string") {
      nativeSetItem.call(window.localStorage, key, value);
    }
  }

  // First run after upgrading migrates whichever port-local values are visible
  // into the native store. Later ports are restored from `initial` above.
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key !== null && keyPattern.test(key)) {
      const value = window.localStorage.getItem(key);
      if (value !== null) post({ op: "set", key, value });
    }
  }

  Storage.prototype.setItem = function (key, value) {
    nativeSetItem.call(this, key, value);
    const normalizedKey = String(key);
    if (this === window.localStorage && keyPattern.test(normalizedKey)) {
      post({ op: "set", key: normalizedKey, value: String(value) });
    }
  };

  Storage.prototype.removeItem = function (key) {
    nativeRemoveItem.call(this, key);
    const normalizedKey = String(key);
    if (this === window.localStorage && keyPattern.test(normalizedKey)) {
      post({ op: "remove", key: normalizedKey });
    }
  };
})();
