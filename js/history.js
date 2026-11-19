import { db } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs, startAfter } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

export async function loadHistory(chatId, pageSize = 20, afterDoc = null) {
  let q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "desc"), limit(pageSize));
  if (afterDoc) q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "desc"), startAfter(afterDoc), limit(pageSize));
  const snap = await getDocs(q);
  return { docs: snap.docs, items: snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse() };
}