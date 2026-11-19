import { rtdb } from "./firebase-config.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

export function listenTyping(chatId, cb) {
  const r = ref(rtdb, `typing/${chatId}`);
  return onValue(r, (snap) => cb(snap.val() || {}));
}
