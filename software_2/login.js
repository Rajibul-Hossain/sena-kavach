import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
const firebaseConfig = {
  apiKey: "AIzaSyD8VmRxwh6fiQ8msCKhwsAhfScRHaFeW04",
  authDomain: "sena-kavach.firebaseapp.com",
  databaseURL: "https://sena-kavach-default-rtdb.firebaseio.com",
  projectId: "sena-kavach",
  storageBucket: "sena-kavach.firebasestorage.app",
  messagingSenderId: "417816652380",
  appId: "1:417816652380:web:ba3e531724f32831c9d499",
  measurementId: "G-0CFFMT95CY"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const loginForm = document.getElementById('login-form');
const errorBanner = document.getElementById('auth-error');
const cmdIdInput = document.getElementById('commander-id');
const cmdKeyInput = document.getElementById('commander-key');
const submitBtn = document.querySelector('.btn-primary-capsule');
const btnText = submitBtn.querySelector('span'); // Targets the text inside the button
const glassCard = document.querySelector('.tactical-glass-card');

const toggleBtn = document.getElementById('toggle-password');
if (toggleBtn) {
    const eyeIcon = document.getElementById('eye-icon');
    toggleBtn.addEventListener('click', () => {
        const isPassword = cmdKeyInput.getAttribute('type') === 'password';
        cmdKeyInput.setAttribute('type', isPassword ? 'text' : 'password');
        
        eyeIcon.innerHTML = isPassword 
            ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
            : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    });
}
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    errorBanner.classList.add('hidden');

    let rawId = cmdIdInput.value.trim().toLowerCase();
    const cmdKey = cmdKeyInput.value.trim();
    let authEmail = "";
    if (rawId.includes('@')) {
        authEmail = rawId;
    } else {
        let cleanId = rawId.replace('cmd-', '').replace('cmd', '').trim();
        authEmail = `cmd-${cleanId}@sena.mil`;
    }
    btnText.innerText = "DECRYPTING...";
    submitBtn.style.background = "#ffff00";
    submitBtn.style.color = "#000000";
    try {
        console.log(`[SYSTEM] Attempting Auth as: ${authEmail}`);
        
        const userCredential = await signInWithEmailAndPassword(auth, authEmail, cmdKey);
        const user = userCredential.user;
        btnText.innerText = "LINK ESTABLISHED";
        submitBtn.style.background = "#ffffff";
        submitBtn.style.color = "#000000";
        localStorage.setItem("cmd_authenticated", "true");
        localStorage.setItem("cmd_id", authEmail);
        localStorage.setItem("cmd_uid", user.uid);
        setTimeout(() => {
            glassCard.style.opacity = '0';
            glassCard.style.transform = 'translateY(-20px)';
            glassCard.style.transition = 'all 0.5s ease';
            setTimeout(() => {
                window.location.href = "main/index.html"; 
            }, 500);
        }, 600);
    } catch (error) {
        console.error("Auth Error:", error.code);
        const cleanError = error.code.replace('auth/', '').replace(/-/g, ' ').toUpperCase();
        errorBanner.classList.remove('hidden');
        errorBanner.innerHTML = `ERR // ${cleanError}`;
        btnText.innerText = "AUTHENTICATE";
        submitBtn.style.background = ""; 
        submitBtn.style.color = "#ffffff";
        cmdKeyInput.value = ''; 
        cmdKeyInput.focus();
    }});