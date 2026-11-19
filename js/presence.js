import { rtdb } from "./firebase-config.js";
import { ref, set, onValue, onDisconnect, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

export function setPresence(uid) {
  const r = ref(rtdb, `presence/${uid}`);
  set(r, { online: true, lastSeen: rtdbTimestamp() });
  onDisconnect(r).set({ online: false, lastSeen: rtdbTimestamp() });
}

export function listenPresence(uid, cb) {
  const r = ref(rtdb, `presence/${uid}`);
  return onValue(r, (snap) => cb(snap.val()));
}

export function setTyping(chatId, uid, typing) {
  const r = ref(rtdb, `typing/${chatId}/${uid}`);
  set(r, { typing, updatedAt: rtdbTimestamp() });
}
