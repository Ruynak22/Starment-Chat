/* ============================================================
   StarmentChat — Hình nền trò chuyện (kiểu TikTok)
   - Nền mẫu (CSS) + ảnh tuỳ chỉnh của người dùng.
   - Áp dụng cho một cuộc trò chuyện riêng hoặc toàn bộ.
   - Lưu bằng localStorage (không cần deploy rules).
   ============================================================ */

const GLOBAL_KEY = "starment_wallpaper";
const GLOBAL_CUSTOM_KEY = "starment_wallpaper_custom";
const PER_CHAT_KEY = "starment_chat_wallpapers";
const MAX_CUSTOM_BYTES = 1_500_000;

export const WALLPAPERS = [
  { id: "default",  name: "Mặc định",       swatch: "linear-gradient(135deg,#1b2230,#0c1018)" },
  { id: "midnight", name: "Đêm khuya",      swatch: "linear-gradient(160deg,#0f2027,#203a43,#2c5364)" },
  { id: "aurora",   name: "Cực quang",      swatch: "linear-gradient(135deg,#3a1c71,#d76d77,#ffaf7b)" },
  { id: "sunset",   name: "Hoàng hôn",      swatch: "linear-gradient(135deg,#ff7e5f,#feb47b)" },
  { id: "mint",     name: "Bạc hà",         swatch: "linear-gradient(135deg,#11998e,#38ef7d)" },
  { id: "ocean",    name: "Đại dương",      swatch: "linear-gradient(135deg,#1a2980,#26d0ce)" },
  { id: "blossom",  name: "Hoa nở",         swatch: "linear-gradient(135deg,#ffafbd,#ffc3a0)" },
  { id: "lavender", name: "Lavender",       swatch: "linear-gradient(135deg,#7f7fd5,#86a8e7,#91eae4)" },
  { id: "coffee",   name: "Cà phê",         swatch: "linear-gradient(135deg,#3e2723,#6d4c41,#a1887f)" },
  { id: "grid",     name: "Lưới tech",      swatch: "repeating-linear-gradient(0deg,#121826 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,#121826 0 1px,transparent 1px 22px),#0a0f18" },
  { id: "stars",    name: "Đêm sao",        swatch: "radial-gradient(2px 2px at 20% 30%,#fff,transparent),radial-gradient(2px 2px at 70% 60%,#fff,transparent),radial-gradient(1px 1px at 45% 80%,#fff,transparent),#0b1020" },
  { id: "candy",    name: "Kẹo ngọt",       swatch: "linear-gradient(135deg,#a18cd1,#fbc2eb)" }
];

const validIds = new Set(WALLPAPERS.map((w) => w.id));
validIds.add("custom"); // ảnh tuỳ chỉnh (không nằm trong lưới mẫu)

/* ---------- helpers lưu trữ ---------- */
function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readGlobal() {
  const id = localStorage.getItem(GLOBAL_KEY) || "default";
  return {
    id: validIds.has(id) ? id : "default",
    custom: localStorage.getItem(GLOBAL_CUSTOM_KEY) || null
  };
}

function readPerChat() {
  const map = readJSON(PER_CHAT_KEY, {});
  return map && typeof map === "object" && !Array.isArray(map) ? map : {};
}

function writeGlobal(id, custom) {
  try {
    localStorage.setItem(GLOBAL_KEY, id);
    if (custom === null) localStorage.removeItem(GLOBAL_CUSTOM_KEY);
    else if (custom) localStorage.setItem(GLOBAL_CUSTOM_KEY, custom);
  } catch { /* ignore quota errors */ }
}

function writePerChat(map) {
  try { localStorage.setItem(PER_CHAT_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/* ---------- Áp dụng nền ---------- */
function currentChatId() {
  try { return window.app?.currentChatId?.() || null; } catch { return null; }
}

export function applyWallpaper() {
  const box = document.getElementById("messages");
  if (!box) return;
  const chatId = currentChatId();
  const perChat = readPerChat();
  const specific = chatId && perChat[chatId];
  const source = specific || readGlobal();

  WALLPAPERS.forEach((w) => box.classList.remove("wall-" + w.id));
  box.classList.remove("wall-custom", "has-custom-wallpaper");

  const id = validIds.has(source.id) ? source.id : "default";
  box.classList.add("wall-" + id);

  if (source.custom) {
    box.style.backgroundImage = `url("${source.custom}")`;
    box.classList.add("wall-custom", "has-custom-wallpaper");
  } else {
    box.style.backgroundImage = "";
  }
}

/** Gán nền cho riêng một cuộc trò chuyện (null = xoá nền riêng). */
export function setChatWallpaper(chatId, id, custom) {
  if (!chatId) return;
  const map = readPerChat();
  if (id === "default" && !custom) delete map[chatId];
  else map[chatId] = { id: validIds.has(id) ? id : "default", custom: custom || null };
  writePerChat(map);
  applyWallpaper();
}

/** Gán nền mặc định toàn cục. */
export function setGlobalWallpaper(id, custom) {
  writeGlobal(validIds.has(id) ? id : "default", custom || null);
  applyWallpaper();
}

/* ---------- Xử lý ảnh tuỳ chỉnh ---------- */
function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được ảnh."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Ảnh không hợp lệ."));
      img.onload = () => {
        try {
          const maxSide = 1280;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#0a0f18";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let data = canvas.toDataURL("image/jpeg", 0.78);
          if (data.length > MAX_CUSTOM_BYTES) data = canvas.toDataURL("image/jpeg", 0.55);
          if (data.length > MAX_CUSTOM_BYTES) throw new Error("Ảnh quá lớn sau khi nén.");
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- Modal chọn nền ---------- */
let pickerContext = "global";   // "global" | "chat"
let pickerChatId = null;

function modal() { return document.getElementById("wallpaperModal"); }

export function openWallpaperPicker(context = "global", chatId = null) {
  const el = modal();
  if (!el) return;
  pickerContext = context === "chat" && chatId ? "chat" : "global";
  pickerChatId = chatId;

  const source = pickerContext === "chat" && chatId
    ? (readPerChat()[chatId] || readGlobal())
    : readGlobal();

  renderPresetGrid(source.id);
  const hint = document.getElementById("wallpaperHint");
  if (hint) {
    hint.textContent = pickerContext === "chat"
      ? (window.i18n?.t?.("wall.chatHint") || "Chỉ áp dụng cho cuộc trò chuyện hiện tại")
      : (window.i18n?.t?.("wall.forAll") || "Áp dụng cho tất cả trò chuyện");
  }
  const applyAllBtn = document.getElementById("btnWallpaperApplyAll");
  if (applyAllBtn) applyAllBtn.classList.toggle("hidden", pickerContext !== "chat");

  el.classList.remove("hidden", "closing");
  document.body.classList.add("modal-open");
}

function closeWallpaperPicker() {
  const el = modal();
  if (!el || el.classList.contains("hidden") || el.classList.contains("closing")) return;
  el.classList.add("closing");
  document.body.classList.remove("modal-open");
  setTimeout(() => {
    el.classList.add("hidden");
    el.classList.remove("closing");
  }, 190);
}

function renderPresetGrid(activeId) {
  const grid = document.getElementById("wallpaperGrid");
  if (!grid) return;
  grid.innerHTML = "";
  WALLPAPERS.forEach((w) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wallpaper-item" + (w.id === activeId ? " active" : "");
    btn.dataset.wallpaper = w.id;
    btn.style.setProperty("--wp-swatch", w.swatch);
    const label = document.createElement("span");
    label.className = "wallpaper-item-name";
    label.textContent = w.name;
    btn.appendChild(label);
    btn.addEventListener("click", () => chooseWallpaper(w.id, null));
    grid.appendChild(btn);
  });
  document.getElementById("wallpaperCustomCard")?.classList.toggle("active", activeId === "custom");
}

function markActive(id) {
  document.querySelectorAll("#wallpaperGrid .wallpaper-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.wallpaper === id);
  });
  document.getElementById("wallpaperCustomCard")?.classList.toggle("active", id === "custom");
}

function chooseWallpaper(id, custom) {
  if (pickerContext === "chat" && pickerChatId) {
    setChatWallpaper(pickerChatId, id, custom);
  } else {
    setGlobalWallpaper(id, custom);
  }
  markActive(id);
  window.notify?.(window.i18n?.t?.("wall.applied") || "Đã áp dụng hình nền");
}

export function initWallpaper() {
  // Áp dụng ngay khi vào app và mỗi khi mở/chuyển chat.
  applyWallpaper();
  window.addEventListener("chat:opened", applyWallpaper);
  window.addEventListener("chat:closed", applyWallpaper);
  window.addEventListener("i18n:changed", () => {
    const hint = document.getElementById("wallpaperHint");
    if (hint) {
      hint.textContent = pickerContext === "chat"
        ? (window.i18n?.t?.("wall.chatHint") || "Chỉ áp dụng cho cuộc trò chuyện hiện tại")
        : (window.i18n?.t?.("wall.forAll") || "Áp dụng cho tất cả trò chuyện");
    }
    renderPresetGrid(currentSourceId());
  });

  document.getElementById("btnWallpaper")?.addEventListener("click", () => {
    openWallpaperPicker("chat", currentChatId());
  });
  document.getElementById("btnSettingsWallpaper")?.addEventListener("click", () => {
    openWallpaperPicker("global");
  });

  document.getElementById("btnWallpaperClose")?.addEventListener("click", closeWallpaperPicker);
  document.getElementById("btnWallpaperDone")?.addEventListener("click", closeWallpaperPicker);
  document.querySelector('#wallpaperModal [data-close="wallpaper"]')?.addEventListener("click", closeWallpaperPicker);

  document.getElementById("btnWallpaperReset")?.addEventListener("click", () => {
    if (pickerContext === "chat" && pickerChatId) setChatWallpaper(pickerChatId, "default", null);
    else setGlobalWallpaper("default", null);
    markActive("default");
    window.notify?.(window.i18n?.t?.("wall.resetDone") || "Đã đặt lại hình nền mặc định");
  });

  document.getElementById("btnWallpaperApplyAll")?.addEventListener("click", () => {
    const source = pickerChatId ? (readPerChat()[pickerChatId] || readGlobal()) : readGlobal();
    setGlobalWallpaper(source.id, source.custom || null);
    window.notify?.(window.i18n?.t?.("wall.applied") || "Đã áp dụng hình nền");
  });

  document.getElementById("btnWallpaperUpload")?.addEventListener("click", () => {
    document.getElementById("wallpaperFileInput")?.click();
  });

  const input = document.getElementById("wallpaperFileInput");
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = await downscaleImage(file);
      chooseWallpaper("custom", data);
      markActive("custom");
    } catch (err) {
      window.notify?.(err?.message || "Không thể dùng ảnh này.");
    } finally {
      input.value = "";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal()?.classList.contains("hidden")) closeWallpaperPicker();
  });
}

function currentSourceId() {
  const chatId = currentChatId();
  const specific = chatId && readPerChat()[chatId];
  return (specific || readGlobal()).id;
}
