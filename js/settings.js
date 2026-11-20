import { auth } from "./firebase-config.js";
import { resetPassword, friendlyError } from "./auth.js";

/* ============================================================
   CÀI ĐẶT NGƯỜI DÙNG
   - Lưu trong localStorage (dùng chung cho mọi tài khoản trên máy).
   - Gồm: chủ đề, màu nhấn, giao diện gọn, thông báo, cách gửi tin.
   ============================================================ */

const STORAGE_KEY = "starment_settings";
const THEMES = ["dark", "light", "system"];
const ACCENTS = ["blue", "purple", "green", "orange", "pink"];

const DEFAULTS = {
  theme: "dark",
  accent: "blue",
  notifInApp: true,
  notifSound: true,
  notifDesktop: false,
  notifPreview: true,
  enterToSend: true,
  compact: false,
  readReceipts: true,
  typingIndicator: true
};

const BOOL_KEYS = ["notifInApp", "notifSound", "notifDesktop", "notifPreview", "enterToSend", "compact", "readReceipts", "typingIndicator"];

let settings = { ...DEFAULTS };
let systemQuery = null;
let initialized = false;

function loadSettings() {
  let raw = {};
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    raw = {};
  }
  if (!raw || typeof raw !== "object") raw = {};
  settings = { ...DEFAULTS, ...raw };
  if (!THEMES.includes(settings.theme)) settings.theme = DEFAULTS.theme;
  if (!ACCENTS.includes(settings.accent)) settings.accent = DEFAULTS.accent;
  BOOL_KEYS.forEach((key) => {
    if (typeof settings[key] !== "boolean") settings[key] = DEFAULTS[key];
  });
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function resolveTheme() {
  if (settings.theme !== "system") return settings.theme;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme();
  root.dataset.accent = settings.accent;
  document.body?.classList.toggle("compact", !!settings.compact);
}

export function getSettings() {
  return { ...settings };
}

export function updateSetting(key, value) {
  if (!(key in DEFAULTS)) return;
  settings = { ...settings, [key]: value };
  persist();
  applySettings();
  syncControls();
  window.dispatchEvent(
    new CustomEvent("settings:changed", {
      detail: { key, value, settings: getSettings() }
    })
  );
}

function resetSettings() {
  settings = { ...DEFAULTS };
  persist();
  applySettings();
  syncControls();
  window.notify?.("Đã đặt lại cài đặt mặc định");
  window.dispatchEvent(
    new CustomEvent("settings:changed", {
      detail: { key: null, value: null, settings: getSettings() }
    })
  );
}

/* ---------- Modal ---------- */
const settingsModal = () => document.getElementById("settingsModal");

export function openSettings() {
  const modal = settingsModal();
  if (!modal) return;
  const emailEl = document.getElementById("settingsEmail");
  if (emailEl) emailEl.textContent = auth.currentUser?.email || "Chưa đăng nhập";
  syncControls();
  modal.classList.remove("hidden", "closing");
  document.body.classList.add("modal-open");
}

function closeSettings() {
  const modal = settingsModal();
  if (!modal || modal.classList.contains("hidden") || modal.classList.contains("closing")) return;
  modal.classList.add("closing");
  document.body.classList.remove("modal-open");
  setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("closing");
  }, 190);
}

/* ---------- Đồng bộ trạng thái điều khiển ---------- */
function syncControls() {
  document.querySelectorAll("[data-theme-option]").forEach((btn) => {
    const active = btn.dataset.themeOption === settings.theme;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-accent-option]").forEach((btn) => {
    const active = btn.dataset.accentOption === settings.accent;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-setting]").forEach((input) => {
    const key = input.dataset.setting;
    if (key in settings) input.checked = !!settings[key];
  });
}

/* ---------- Quyền thông báo hệ thống ---------- */
async function requestDesktopPermission() {
  if (!("Notification" in window)) {
    window.notify?.("Trình duyệt không hỗ trợ thông báo hệ thống.");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    window.notify?.("Thông báo đang bị chặn. Hãy mở khoá trong cài đặt trình duyệt.");
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") window.notify?.("Bạn chưa cho phép hiển thị thông báo.");
    return permission === "granted";
  } catch {
    return false;
  }
}

/* ---------- Gửi email đổi mật khẩu ---------- */
async function sendPasswordReset(btn) {
  const email = auth.currentUser?.email;
  if (!email) {
    window.notify?.("Bạn cần đăng nhập lại để đổi mật khẩu.");
    return;
  }
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang gửi…";
  try {
    await resetPassword(email);
    window.notify?.(`Đã gửi email đặt lại mật khẩu tới ${email}`);
  } catch (err) {
    window.notify?.(friendlyError(err, "reset"));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/* ---------- Khởi tạo ---------- */
export function initSettings() {
  if (initialized) return;
  initialized = true;

  loadSettings();
  applySettings();

  document.getElementById("btnSettings")?.addEventListener("click", openSettings);
  document.getElementById("btnSettingsClose")?.addEventListener("click", closeSettings);
  document.getElementById("btnSettingsDone")?.addEventListener("click", closeSettings);
  document.querySelector('#settingsModal [data-close="settings"]')?.addEventListener("click", closeSettings);

  document.getElementById("btnSettingsReset")?.addEventListener("click", resetSettings);
  document.getElementById("btnSettingsPassword")?.addEventListener("click", (e) => sendPasswordReset(e.currentTarget));

  document.querySelectorAll("[data-theme-option]").forEach((btn) => {
    btn.addEventListener("click", () => updateSetting("theme", btn.dataset.themeOption));
  });
  document.querySelectorAll("[data-accent-option]").forEach((btn) => {
    btn.addEventListener("click", () => updateSetting("accent", btn.dataset.accentOption));
  });
  document.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.dataset.setting;
      if (key === "notifDesktop" && input.checked) {
        const allowed = await requestDesktopPermission();
        if (!allowed) {
          input.checked = false;
          return;
        }
      }
      updateSetting(key, input.checked);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsModal()?.classList.contains("hidden")) closeSettings();
  });

  // Chủ đề "Hệ thống" thay đổi theo cài đặt của máy.
  systemQuery = window.matchMedia?.("(prefers-color-scheme: light)");
  systemQuery?.addEventListener?.("change", () => {
    if (settings.theme === "system") applySettings();
  });
}
