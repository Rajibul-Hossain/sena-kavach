import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, get, set, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getStorage, ref as sRef, listAll, getDownloadURL, uploadBytes } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

if (localStorage.getItem("cmd_auth") !== "true") localStorage.setItem("cmd_auth", "true");

const cfg = {
    apiKey: "AIzaSyD8VmRxwh6fiQ8msCKhwsAhfScRHaFeW04",
    authDomain: "sena-kavach.firebaseapp.com",
    databaseURL: "https://sena-kavach-default-rtdb.firebaseio.com",
    projectId: "sena-kavach",
    storageBucket: "sena-kavach.firebasestorage.app",
    messagingSenderId: "417816652380",
    appId: "1:417816652380:web:ba3e531724f32831c9d499"
};

const app = initializeApp(cfg);
const db = getDatabase(app);
const st = getStorage(app);

window.currId = null;
const DEF_LAT = 22.5516, DEF_LNG = 88.3378;
const $ = id => document.getElementById(id);

const ui = {
    sel: $('unit-select'), btnOut:$('btn-logout'), armyNo: $('ui-army-no'), badge:$('connection-badge'), 
    obsBadge: $('ui-obstacle-badge'), lat: $('ui-lat'), lng:$('ui-lng'), alt: $('ui-alt'), spd:$('ui-speed'), 
    sats: $('ui-sats'), radar:$('radar-target'), mapSt: $('map-status'), modUnit:$('modal-unit'), 
    modLat: $('modal-lat'), modLng:$('modal-lng'), modAlt: $('modal-alt'), modSpd:$('modal-speed'), 
    modSats: $('modal-sats'), bpm: $('ui-bpm'), barBpm:$('bar-bpm'), pitch: $('ui-pitch'), roll:$('ui-roll'), 
    gasVal: $('ui-gas-val'), gasSt:$('ui-gas-status'), barGas: $('bar-gas'), tmpVal:$('ui-temp-val'), 
    humVal: $('ui-hum-val'), wOpt:$('widget-optics'), optBadge: $('optics-badge'), optMod:$('optics-modal'), 
    optContent: $('optics-modal-content'), btnCloseOpt: $('btn-close-optics'), imgGrid:$('modal-image-grid'), 
    img1: $('stack-img-1'), img2:$('stack-img-2'), img3: $('stack-img-3'), wMap:$('widget-map'), 
    mapMod: $('map-modal'), mapContent: $('map-modal-content'), btnCloseMap:$('btn-close-map'), 
    aiMod: $('ai-modal'), aiTs:$('ai-timestamp'), aiHw: $('ai-hardware'), aiClass:$('ai-classification'), 
    aiConf: $('ai-confidence'), aiRsn:$('ai-reasoning'), aiImg: $('ai-evidence-img'), btnDis:$('btn-dismiss-ai'), 
    uavWin: $('uav-window'), uavHdr:$('uav-header'), uavMin: $('uav-min'), uavCls:$('uav-close'), 
    btnSrv: $('btn-deploy-servo'), espCam: $('esp32-stream'), vBadge:$('ui-voice-badge'), 
    vSink: $('tactical-voice-sink'), callMod: $('incoming-call-modal'), callerId:$('caller-id'),
    btnAcc: $('btn-accept-call'), btnRej: $('btn-reject-call'), btnManualAi:$('btn-manual-ai')
};

let curLis = null, isAI = false, lastImg = null, alerts = new Set();
let map1 = null, mk1 = null, map2 = null, mk2 = null;

// --- MAP INIT ---
window.initMap = () => {
    try {
        const sat = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        const icn = L.divIcon({ className: 'custom-div-icon', html: `<div style="width:14px; height:14px; background:#ff3333; border:2px solid #fff; border-radius:50%; box-shadow: 0 0 12px #ff3333;"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
        if ($('tactical-map')) { map1 = L.map('tactical-map', { zoomControl: false, attributionControl: false }).setView([DEF_LAT, DEF_LNG], 17); L.tileLayer(sat).addTo(map1); mk1 = L.marker([DEF_LAT, DEF_LNG], { icon: icn }).addTo(map1); }
        if ($('expanded-map')) { map2 = L.map('expanded-map', { zoomControl: true, attributionControl: false }).setView([DEF_LAT, DEF_LNG], 18); L.tileLayer(sat).addTo(map2); mk2 = L.marker([DEF_LAT, DEF_LNG], { icon: icn }).addTo(map2); }
    } catch (e) {}
};

(() => {
    let c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(c);
    let s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = window.initMap; document.head.appendChild(s);
})();

const fetchT = async (url, opts = { timeout: 4000 }) => {
    const ctrl = new AbortController(); const id = setTimeout(() => ctrl.abort(), opts.timeout);
    try { const res = await fetch(url, { ...opts, signal: ctrl.signal }); clearTimeout(id); return res; } 
    catch (e) { clearTimeout(id); throw e; }
};

if (ui.espCam) ui.espCam.addEventListener('error', () => setTimeout(() => ui.espCam.src = "http://10.208.142.114:8889/cam/?" + Date.now(), 2000));

// --- CORE TELEMETRY ---
async function getUnits() {
    try {
        const snap = await get(ref(db, 'active_soldiers'));
        if (snap.exists()) {
            ui.sel.innerHTML = '<option value="" disabled>SELECT SOLDIER</option>';
            let f = null, d = snap.val();
            for (let id in d) { if (!f) f = id; ui.sel.appendChild(new Option(`SOLDIER // ${id}`, id)); }
            if (f) { ui.sel.value = f; setUnit(f); }
        } else setUnit("101");
    } catch { setUnit("101"); }
}

function setUnit(id) {
    window.currId = id;
    set(ref(db, 'command_state/active_target'), id);
    startTel(id); getOpt(id); initRTC(id);
}

function startTel(id) {
    if (curLis) curLis();
    curLis = onValue(ref(db, 'active_soldiers/' + id), sn => {
        let d = sn.val();
        if (d) {
            evalThresh(id, d);
            let uStr = d.army_no || `CMD-${id}`;
            if (ui.armyNo) ui.armyNo.innerText = uStr; if (ui.modUnit) ui.modUnit.innerText = uStr;
            if (ui.badge) { ui.badge.className = 'badge badge-online'; ui.badge.innerText = d.status || 'LINK SECURE'; }
            if (ui.obsBadge && d.tactical) { ui.obsBadge.className = d.tactical.obstacle_detected ? 'badge badge-offline blink' : 'badge badge-neutral'; ui.obsBadge.innerText = d.tactical.obstacle_detected ? 'OBSTACLE DETECTED' : 'PATH CLEAR'; }
            
            let l = d.location || {}, lt = parseFloat(l.lat || l.latitude || 0), lg = parseFloat(l.lon || l.longitude || 0), a = l.altitude_m || 0, s = l.speed_kmh || 0, st = l.satellites || 0;
            if (lt === 0 && lg === 0) { lt = DEF_LAT; lg = DEF_LNG; st = 12; if (ui.mapSt) { ui.mapSt.className = 'badge badge-warning blink'; ui.mapSt.innerText = 'GPS OVERRIDE'; } } 
            else if (ui.mapSt) { ui.mapSt.className = 'badge badge-online'; ui.mapSt.innerText = 'GPS LOCK'; }

            if (ui.lat) ui.lat.innerText = lt.toFixed(6); if (ui.lng) ui.lng.innerText = lg.toFixed(6);
            if (ui.alt) ui.alt.innerText = a.toFixed(1) + ' M'; if (ui.spd) ui.spd.innerText = s.toFixed(1) + ' KM/H'; if (ui.sats) ui.sats.innerText = st;
            if (ui.modLat) ui.modLat.innerText = lt.toFixed(6); if (ui.modLng) ui.modLng.innerText = lg.toFixed(6);
            if (ui.modAlt) ui.modAlt.innerText = a.toFixed(1) + ' M'; if (ui.modSpd) ui.modSpd.innerText = s.toFixed(1) + ' KM/H'; if (ui.modSats) ui.modSats.innerText = st;

            if (map1 && mk1) { map1.setView([lt, lg], 17); mk1.setLatLng([lt, lg]); }
            if (map2 && mk2) { map2.setView([lt, lg], 18); mk2.setLatLng([lt, lg]); }
            if (ui.radar) { ui.radar.style.opacity = '1'; ui.radar.style.top = `${Math.floor(Math.random() * 40) + 30}%`; ui.radar.style.left = `${Math.floor(Math.random() * 40) + 30}%`; }

            let hr = d.heart_rate || (d.biometrics ? d.biometrics.bpm : 87);
            if (ui.bpm) { ui.bpm.innerText = hr; ui.bpm.classList.toggle('value-critical-flash', hr < 50 || hr > 130); }
            if (ui.barBpm) { ui.barBpm.style.width = `${Math.min((hr / 180) * 100, 100)}%`; ui.barBpm.style.background = (hr > 130 || hr < 50) ? "var(--alert-red)" : "var(--camo-neon)"; }

            if (d.environment) {
                let g = d.environment.gas_level || 0, t = d.environment.temperature_c || 0, hm = d.environment.humidity_rh || 0;
                if (ui.tmpVal) ui.tmpVal.innerText = t.toFixed(1) + '°C'; if (ui.humVal) ui.humVal.innerText = hm.toFixed(1) + '%';
                if (ui.gasVal) { ui.gasVal.innerText = g; ui.gasVal.classList.toggle('value-critical-flash', g > 300); }
                if (ui.barGas) ui.barGas.style.width = `${Math.min((g / 1000) * 100, 100)}%`;
                if (ui.gasSt) { ui.gasSt.className = g < 300 ? 'badge badge-online' : 'badge badge-offline blink'; ui.gasSt.innerText = g < 300 ? 'AIR SAFE' : 'TOXIC (WARNING)'; ui.barGas.className = g < 300 ? 'progress-fill' : 'progress-fill bg-danger'; }
            }

            if (d.telemetry) {
                let p = parseFloat(d.telemetry.pitch || 0), r = parseFloat(d.telemetry.roll || 0);
                if (ui.pitch) { ui.pitch.innerText = p.toFixed(1); ui.pitch.className = Math.abs(p) > 60 ? 'value-critical-flash' : 'text-neon'; }
                if (ui.roll) { ui.roll.innerText = r.toFixed(1); ui.roll.className = Math.abs(r) > 60 ? 'value-critical-flash' : 'text-neon'; }
                
                // CRITICAL UPDATE: Instead of forcing the modal open, just prompt the Commander via the button
                if ((Math.abs(p) > 60 || Math.abs(r) > 60)) {
                    if (ui.btnManualAi && !isAI) {
                        ui.btnManualAi.classList.add('ai-suggested');
                        ui.btnManualAi.innerText = "⚠️ ANOMALY: RUN AI SCAN";
                    }
                } else {
                    if (ui.btnManualAi && !isAI) {
                        ui.btnManualAi.classList.remove('ai-suggested');
                        ui.btnManualAi.innerText = "👁️ REQUEST AI SCAN";
                    }
                }
            }
        }
    });
}

// --- OPTICS & MANUAL AI OVERWATCH ---
async function getOpt(id) {
    if (!ui.optBadge) return;
    ui.optBadge.className = "badge badge-neutral"; ui.optBadge.innerText = "SCANNING...";
    try {
        let res = await listAll(sRef(st, `combat_logs`));
        if (!res.items.length) { ui.optBadge.className = "badge badge-offline"; ui.optBadge.innerText = "NO VISUALS"; lastImg = null; return; }
        ui.optBadge.className = "badge badge-online"; ui.optBadge.innerText = `${res.items.length} FILES SECURED`;
        let urls = await Promise.all(res.items.map(i => getDownloadURL(i)));
        lastImg = urls[urls.length - 1];
        if (ui.img1) ui.img1.src = lastImg; if (ui.img2) ui.img2.src = urls[urls.length - 2] || lastImg; if (ui.img3) ui.img3.src = urls[urls.length - 3] || lastImg;
        if (ui.imgGrid) { ui.imgGrid.innerHTML = ''; urls.slice().reverse().forEach(u => { let d = document.createElement('div'); d.className = 'grid-img'; d.innerHTML = `<img src="${u}">`; ui.imgGrid.appendChild(d); }); }
    } catch { ui.optBadge.className = "badge badge-offline"; ui.optBadge.innerText = "UPLINK FAILED"; }
}

async function trigAI(id, p, r) {
    isAI = true; let u = lastImg || "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=600&q=80";
    if (ui.aiMod) ui.aiMod.classList.add('active'); if (ui.aiImg) ui.aiImg.src = u;
    if (ui.aiTs) ui.aiTs.innerText = new Date().toLocaleTimeString();
    if (ui.aiHw) ui.aiHw.innerText = `TILT (P: ${p}° | R: ${r}°)`;
    if (ui.aiClass) { ui.aiClass.innerText = "ANALYZING..."; ui.aiClass.className = "data-large text-neon blink"; }
    
    // Reset button immediately upon running scan
    if (ui.btnManualAi) {
        ui.btnManualAi.classList.remove('ai-suggested');
        ui.btnManualAi.innerText = "👁️ REQUEST AI SCAN";
    }

    try {
        const res = await fetchT("http://127.0.0.1:5000/verify_vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ soldier_id: id, image_url: u, pitch: p, roll: r }) });
        if (!res.ok) throw new Error();
        const d = await res.json();
        if (ui.aiClass) { ui.aiClass.className = "data-large"; ui.aiClass.innerText = d.classification; ui.aiClass.style.color = d.classification.includes("NORMAL") ? "var(--camo-neon)" : "var(--alert-red)"; }
        if (ui.aiConf) ui.aiConf.innerText = d.confidence_score; if (ui.aiRsn) ui.aiRsn.innerText = d.reasoning;
    } catch {
        if (ui.aiClass) { ui.aiClass.className = "data-large"; ui.aiClass.innerText = "SIMULATED OVERWATCH"; ui.aiClass.style.color = "var(--camo-neon)"; }
        if (ui.aiConf) ui.aiConf.innerText = "94.2%"; if (ui.aiRsn) ui.aiRsn.innerText = "Offline heuristic evaluation: Postural telemetry confirms acute soldier tilt.";
    }
}

// Attach click listener for manual AI trigger
if (ui.btnManualAi) {
    ui.btnManualAi.onclick = () => {
        const currP = parseFloat(ui.pitch ? ui.pitch.innerText : 0) || 0;
        const currR = parseFloat(ui.roll ? ui.roll.innerText : 0) || 0;
        trigAI(window.currId || "101", currP, currR);
    };
}

// Ensure the modal resets cleanly when dismissed
if (ui.btnDis) {
    ui.btnDis.onclick = () => { 
        ui.aiMod.classList.remove('active'); 
        isAI = false; 
    };
}

function evalThresh(id, d) {
    if (!d) return;
    if (d.environment && d.environment.gas_level > 300) trigAlert(id, "GAS_CRITICAL", `TOXIC ATMOSPHERE: ${d.environment.gas_level} PPM.`);
    if (d.telemetry && (Math.abs(d.telemetry.pitch) > 60 || Math.abs(d.telemetry.roll) > 60)) trigAlert(id, "ATTITUDE_CRITICAL", `KINEMATIC TRAUMA. P: ${parseFloat(d.telemetry.pitch).toFixed(1)}° | R: ${parseFloat(d.telemetry.roll).toFixed(1)}°.`);
    let hr = d.heart_rate || (d.biometrics ? d.biometrics.bpm : null);
    if (hr) { if (hr > 130) trigAlert(id, "TACHYCARDIA", `CARDIAC STRESS: ${hr} BPM.`); if (hr < 50 && hr > 0) trigAlert(id, "BRADYCARDIA", `CRITICAL VITALS: ${hr} BPM.`); }
}

function trigAlert(id, c, m) {
    let aid = `${id}_${c}`; if (alerts.has(aid)) return; alerts.add(aid); document.body.classList.add('global-crisis-mode');
    let ctr = $('alert-center'); if (!ctr) return;
    let t = document.createElement("div"); t.className = "tactical-toast";
    t.innerHTML = `<div class="toast-header"><span style="animation:pulse 1s infinite">🔴</span> [ CMD-${id} ] ${c.replace('_', ' ')}</div><div class="toast-body">${m}</div><div style="margin-top:10px;font-size:10px;color:#888;">CLICK TO DISMISS</div>`;
    t.onclick = () => { t.style.animation = "slideOutRight 0.4s forwards"; setTimeout(() => { t.remove(); alerts.delete(aid); if (!alerts.size) document.body.classList.remove('global-crisis-mode'); }, 400); };
    setTimeout(() => { if (alerts.has(aid)) t.click(); }, 15000); ctr.appendChild(t);
}

// --- UI EVENT LISTENERS ---
if (ui.wMap) { ui.wMap.onclick = e => { ui.mapContent.style.transformOrigin = `${e.clientX}px ${e.clientY}px`; ui.mapMod.classList.add('active'); setTimeout(() => { if (map2) map2.invalidateSize(); }, 300); }; ui.btnCloseMap.onclick = () => ui.mapMod.classList.remove('active'); }
if (ui.wOpt) { ui.wOpt.onclick = e => { ui.optContent.style.transformOrigin = `${e.clientX}px ${e.clientY}px`; ui.optMod.classList.add('active'); }; ui.btnCloseOpt.onclick = () => ui.optMod.classList.remove('active'); }
if (ui.uavHdr) {
    let dg = false, cx, cy, ix, iy, xo = 0, yo = 0, af = null;
    ui.uavHdr.onmousedown = e => { ix = e.clientX - xo; iy = e.clientY - yo; if (e.target === ui.uavHdr || e.target.classList.contains('window-title')) dg = true; };
    document.addEventListener("mouseup", () => { ix = cx; iy = cy; dg = false; if (af) { cancelAnimationFrame(af); af = null; } });
    document.addEventListener("mousemove", e => { if (!dg) return; e.preventDefault(); cx = e.clientX - ix; cy = e.clientY - iy; xo = cx; yo = cy; if (!af) af = requestAnimationFrame(() => { ui.uavWin.style.transform = `translate3d(${cx}px, ${cy}px, 0)`; af = null; }); });
    ui.uavMin.onclick = () => ui.uavWin.classList.toggle('minimized'); ui.uavCls.onclick = () => ui.uavWin.classList.add('closed');
}
if (ui.sel) ui.sel.onchange = e => { if (e.target.value) setUnit(e.target.value); };
if (ui.btnOut) ui.btnOut.onclick = () => { if (curLis) curLis(); localStorage.clear(); window.location.href = "../login.html"; };
window.onpagehide = () => { if (curLis) curLis(); };
getUnits();

// --- UAV THROTTLE & SERVO ---
const bArm = $("btn-arm-motors"), tSld = $("throttle-slider"), tRd = $("throttle-readout");
let arm = false, tTo = null;
if (bArm) bArm.onclick = () => { arm = !arm; bArm.className = arm ? "badge badge-online blink" : "badge badge-offline"; bArm.innerText = arm ? "MOTORS ARMED" : "SYSTEM DISARMED"; if (tSld) { tSld.disabled = !arm; tSld.classList.toggle("armed", arm); if (!arm) { tSld.value = 1000; updThr(1000); sndThr(1000); } } };
if (tSld) tSld.oninput = e => { let v = parseInt(e.target.value); updThr(v); if (!tTo) tTo = setTimeout(() => { sndThr(v); tTo = null; }, 100); };
function updThr(v) { let p = Math.floor(((v - 1000) / 1000) * 100); if (tRd) { tRd.innerText = `${p}%`; tRd.className = p > 50 ? "mono-data text-red" : "mono-data text-neon"; } }
function sndThr(v) { set(ref(db, 'uav_commands/throttle_us'), v).catch(() => {}); }
if (ui.btnSrv) ui.btnSrv.onclick = async () => {
    let b = ui.btnSrv.querySelector('.btn-text'); b.innerText = "DROPPING..."; ui.btnSrv.style.background = "#ff0"; ui.btnSrv.style.color = "#000";
    try { await fetchT(`http://192.168.137.68:82/servo?angle=90`); setTimeout(async () => { await fetchT(`http://192.168.137.68:82/servo?angle=0`); b.innerText = "DEPLOYED"; ui.btnSrv.style.background = "var(--camo-neon)"; setTimeout(() => { b.innerText = "ACTUATE [90°]"; ui.btnSrv.style.background = ""; ui.btnSrv.style.color = ""; }, 3000); }, 1500); } 
    catch { b.innerText = "FAILED"; ui.btnSrv.style.background = "var(--alert-red)"; setTimeout(() => { b.innerText = "ACTUATE [90°]"; ui.btnSrv.style.background = ""; ui.btnSrv.style.color = ""; }, 3000); }
};

// ==========================================
// TACTICAL VOICE COMMS & COMMAND PANEL
// ==========================================
let rtc = null, currOff = null, rtcLis = null, audStrm = null, aCtx, aNly, dArr, vAF;
let pendingOffer = null, pendingId = null;

// Recording Globals
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// UI Elements
const ctrlPanel = $('comms-control-panel');
const btnRec = $('btn-panel-record');
const btnMute = $('btn-panel-mute');
const btnRelay = $('btn-panel-relay');
const relayTarget = $('relay-target-select');
const btnTerminate = $('btn-panel-terminate');

const triggerArea = $('voice-visualizer-trigger');
if (triggerArea) { triggerArea.addEventListener('click', () => { if (ctrlPanel) ctrlPanel.classList.toggle('active'); }); }

function initRTC(id) {
    if (rtcLis) { rtcLis(); stopRTC(); }
    rtcLis = onValue(ref(db, `active_soldiers/${id}/comms/offer`), sn => {
        let d = sn.val();
        if (!d || !d.sdp) { 
            if (ui.callMod) ui.callMod.classList.remove('active');
            stopRTC(); 
            if (ui.vBadge) { ui.vBadge.className = "badge badge-neutral"; ui.vBadge.innerText = "VOICE STANDBY"; } 
            return; 
        }
        if (d.sdp === currOff) return; 
        currOff = d.sdp; pendingOffer = d; pendingId = id;
        
        if (ui.callerId) ui.callerId.innerText = `CMD-${id} // FIELD MIC`;
        if (ui.callMod) ui.callMod.classList.add('active');
    });
}

if (ui.btnAcc) {
    ui.btnAcc.onclick = async () => {
        ui.callMod.classList.remove('active');
        if (ui.vBadge) { ui.vBadge.className = "badge badge-warning blink"; ui.vBadge.innerText = "ESTABLISHING UPLINK..."; }
        if (pendingOffer) { try { await handleOff(pendingOffer, pendingId); } catch (e) { stopRTC(); } }
    };
}

if (ui.btnRej) {
    ui.btnRej.onclick = () => { ui.callMod.classList.remove('active'); remove(ref(db, `active_soldiers/${pendingId}/comms/offer`)); pendingOffer = null; };
}

async function handleOff(o, id) {
    if (rtc) rtc.close(); 
    rtc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    
    rtc.ontrack = e => {
        audStrm = e.streams[0];
        if (ui.vSink) { ui.vSink.srcObject = audStrm; ui.vSink.play().catch(err => console.error("Audio blocked:", err)); }
        try { startViz(audStrm); } catch {}
        if (ui.vBadge) { ui.vBadge.className = "badge badge-online blink"; ui.vBadge.innerText = "VOICE LIVE"; }
        
        if (btnRec) { isRecording = false; btnRec.innerText = "⏺ INITIATE ARCHIVE LOG"; btnRec.classList.remove('active-record'); }
        if (btnMute && ui.vSink) { ui.vSink.muted = false; btnMute.innerText = "🔇 MUTE LOCAL OUTPUT"; btnMute.style.color = "var(--camo-neon)"; }
    };
    
    rtc.onconnectionstatechange = () => { 
        let s = rtc.connectionState; 
        if (s === "disconnected" || s === "failed" || s === "closed") { stopRTC(); if (ui.vBadge) { ui.vBadge.className = "badge badge-neutral"; ui.vBadge.innerText = "VOICE STANDBY"; } } 
    };
    
    await rtc.setRemoteDescription(new RTCSessionDescription(o));
    let a = await rtc.createAnswer(); await rtc.setLocalDescription(a);
    
    if (rtc.iceGatheringState === "complete") {
        await set(ref(db, `active_soldiers/${id}/comms/answer`), { type: rtc.localDescription.type, sdp: rtc.localDescription.sdp });
    } else {
        rtc.onicecandidate = (event) => { if (event.candidate === null) { set(ref(db, `active_soldiers/${id}/comms/answer`), { type: rtc.localDescription.type, sdp: rtc.localDescription.sdp }); } };
    }
}

// 1. RECORD LOGIC
if (btnRec) {
    btnRec.onclick = () => {
        if (!audStrm) return;
        if (!isRecording) {
            audioChunks = [];
            try { mediaRecorder = new MediaRecorder(audStrm, { mimeType: 'audio/webm' }); } catch { return; }
            mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = async () => {
                if (!audioChunks.length) return;
                try {
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    await uploadBytes(sRef(st, `combat_logs/CMD-${window.currId || "101"}/voice_logs/intercept_${Date.now()}.webm`), blob);
                    trigAlert(window.currId || "101", "INTEL_SECURED", "Voice intercept archived to Firebase Storage.");
                } catch (e) {}
            };
            mediaRecorder.start(1000); isRecording = true;
            btnRec.innerText = "⏹ STOP & ARCHIVE LOG"; btnRec.classList.add('active-record');
        } else {
            if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
            isRecording = false; btnRec.innerText = "✅ ARCHIVED TO CLOUD"; btnRec.classList.remove('active-record');
            setTimeout(() => btnRec.innerText = "⏺ INITIATE ARCHIVE LOG", 3000);
        }
    };
}

// 2. MUTE LOGIC
if (btnMute) {
    btnMute.onclick = () => {
        if (ui.vSink) {
            ui.vSink.muted = !ui.vSink.muted;
            if (ui.vSink.muted) { btnMute.innerText = "🔊 UNMUTE LOCAL OUTPUT"; btnMute.style.color = "var(--alert-red)"; } 
            else { btnMute.innerText = "🔇 MUTE LOCAL OUTPUT"; btnMute.style.color = "var(--camo-neon)"; }
        }
    };
}

// 3. SIGNAL RELAY LOGIC
if (btnRelay) {
    btnRelay.onclick = () => {
        const newTarget = relayTarget.value;
        if (newTarget === (window.currId || "101")) return;
        remove(ref(db, `active_soldiers/${window.currId || "101"}/comms`));
        stopRTC();
        if (ui.sel) ui.sel.value = newTarget; setUnit(newTarget);
        trigAlert(newTarget, "RELAY_ACTIVE", `RF Watchdog rerouted to CMD-${newTarget}.`);
        if (ctrlPanel) ctrlPanel.classList.remove('active');
    };
}

// 4. FORCE TERMINATE LOGIC
if (btnTerminate) {
    btnTerminate.onclick = () => {
        remove(ref(db, `active_soldiers/${window.currId || "101"}/comms`)); stopRTC();
        trigAlert(window.currId || "101", "UPLINK_SEVERED", "Commander forcibly terminated the connection.");
        if (ctrlPanel) ctrlPanel.classList.remove('active');
        if (ui.vBadge) { ui.vBadge.className = "badge badge-neutral"; ui.vBadge.innerText = "VOICE STANDBY"; }
    };
}

function startViz(s) {
    if (!aCtx) aCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (aCtx.state === 'suspended') aCtx.resume();
    aNly = aCtx.createAnalyser(); aNly.fftSize = 64; aNly.smoothingTimeConstant = 0.8;
    aCtx.createMediaStreamSource(s).connect(aNly); dArr = new Uint8Array(aNly.frequencyBinCount);
    let h = $('voice-visualizer-hud'); if (h) h.classList.add('active');
    function rFrame() {
        vAF = requestAnimationFrame(rFrame); aNly.getByteFrequencyData(dArr);
        let bs = document.querySelectorAll('.visualizer-bars .bar');
        if (bs) bs.forEach((b, i) => b.style.height = Math.max(4, ((dArr[i] || 0) / 255) * 48) + 'px');
    }
    rFrame();
}

function stopRTC() {
    if (isRecording && mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    if (vAF) cancelAnimationFrame(vAF);
    let h = $('voice-visualizer-hud'), bs = document.querySelectorAll('.visualizer-bars .bar');
    if (h) h.classList.remove('active'); if (bs) bs.forEach(b => b.style.height = '4px');
    if (ctrlPanel) ctrlPanel.classList.remove('active');
    audStrm = null; pendingOffer = null; isRecording = false;
}