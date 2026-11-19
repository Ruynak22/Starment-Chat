import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_V0NZ9LV4kufjD3E6Xi23G1Cc-WbE6go",
  authDomain: "starmentchat.firebaseapp.com",
  databaseURL: "https://starmentchat-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "starmentchat",
  storageBucket: "starmentchat.firebasestorage.app",
  messagingSenderId: "871869966380",
  appId: "1:871869966380:web:d6e89903ed60ad86658989"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);


setPersistence(auth, browserLocalPersistence).catch(() => {});

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);

export async function checkConnection() {
  try {
    return !!app;
  } catch (e) {
    console.error("Firebase init failed", e);
    return false;
  }
}