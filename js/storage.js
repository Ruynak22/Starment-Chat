import { storage } from "./firebase-config.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

export async function uploadChatImage(chatId, file) {
  if (!file.type.startsWith("image/")) throw new Error("Invalid MIME");
  if (file.size > 5 * 1024 * 1024) throw new Error("File too large");
  const r = ref(storage, `chat-images/${chatId}/${Date.now()}_${file.name}`);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}
