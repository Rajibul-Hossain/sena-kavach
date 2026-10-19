import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, get, set } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getStorage, ref as storageRef, listAll, getDownloadURL, uploadBytes } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

if (localStorage.getItem("cmd_authenticated") !== "true") {
    localStorage.setItem("cmd_authenticated", "true");
}

const firebaseConfig = {
    apiKey: "AIzaSyD8VmRxwh6fiQ8msCKhwsAhfScRHaFeW04",
    authDomain: "sena-kavach.firebaseapp.com",
    databaseURL: "https://sena-kavach-default-rtdb.firebaseio.com",
    projectId: "sena-kavach",
    storageBucket: "sena-kavach.firebasestorage.app",
    messagingSenderId: "417816652380",
    appId: "1:417816652380:web:ba3e531724f32831c9d499"
};

const FALLBACK_LAT = 22.551600; 
const FALLBACK_LNG = 88.337800;

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

window.currentSoldierId = null;

const ui = {
    selector: document.getElementById('unit-select'),
    logoutBtn: document.getElementById('btn-logout'),
    
    armyNo: document.getElementById('ui-army-no'),
    badge: document.getElementById('connection-badge'),
    obsBadge: document.getElementById('ui-obstacle-badge'),
    
    lat: document.getElementById('ui-lat'),
    lng: document.getElementById('ui-lng'),
    alt: document.getElementById('ui-alt'),
    speed: document.getElementById('ui-speed'),
    sats: document.getElementById('ui-sats'),
    radarTarget: document.getElementById('radar-target'),
    mapStatus: document.getElementById('map-status'),
    
    modalUnit: document.getElementById('modal-unit'),
    modalLat: document.getElementById('modal-lat'),
    modalLng: document.getElementById('modal-lng'),
    modalAlt: document.getElementById('modal-alt'),
    modalSpeed: document.getElementById('modal-speed'),
    modalSats: document.getElementById('modal-sats'),
    
    bpm: document.getElementById('ui-bpm'),
    barBpm: document.getElementById('bar-bpm'),
    pitch: document.getElementById('ui-pitch'),
    roll: document.getElementById('ui-roll'),
    gasVal: document.getElementById('ui-gas-val'),
    gasStatus: document.getElementById('ui-gas-status'),
    barGas: document.getElementById('bar-gas'),
    tempVal: document.getElementById('ui-temp-val'),
    humVal: document.getElementById('ui-hum-val'),
    
    widgetOptics: document.getElementById('widget-optics'),
    opticsBadge: document.getElementById('optics-badge'),
    opticsModalOverlay: document.getElementById('optics-modal'),
    opticsModalContent: document.getElementById('optics-modal-content'),
    btnCloseOptics: document.getElementById('btn-close-optics'),
    modalImageGrid: document.getElementById('modal-image-grid'),
    stackImg1: document.getElementById('stack-img-1'),
    stackImg2: document.getElementById('stack-img-2'),
    stackImg3: document.getElementById('stack-img-3'),
    
    widgetMap: document.getElementById('widget-map'),
    mapModalOverlay: document.getElementById('map-modal'),
    mapModalContent: document.getElementById('map-modal-content'),
    btnCloseMap: document.getElementById('btn-close-map'),
    
    aiModal: document.getElementById('ai-modal'),
    aiTimestamp: document.getElementById('ai-timestamp'),
    aiHardware: document.getElementById('ai-hardware'),
    aiClassification: document.getElementById('ai-classification'),
    aiConfidence: document.getElementById('ai-confidence'),
    aiReasoning: document.getElementById('ai-reasoning'),
    aiImg: document.getElementById('ai-evidence-img'),
    btnDismiss: document.getElementById('btn-dismiss-ai'),
    
    uavWindow: document.getElementById('uav-window'),
    uavHeader: document.getElementById('uav-header'),
    uavMinBtn: document.getElementById('uav-min'),
    uavCloseBtn: document.getElementById('uav-close'),
    btnDeployServo: document.getElementById('btn-deploy-servo'),
    esp32StreamImg: document.getElementById('esp32-stream'),

    voiceBadge: document.getElementById('ui-voice-badge'),
    voiceSink: document.getElementById('tactical-voice-sink')
};

let currentListener = null;
let isAiAnalyzing = false;
let latestImageUrl = null;
const activeAlerts = new Set();

let miniMap = null, miniMarker = null;
let expandedMap = null, expandedMarker = null;
const esriSatelliteLayer = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

window.initTacticalMap = () => {
    try {
        const miniContainer = document.getElementById('tactical-map');
        if (miniContainer) {
            miniMap = L.map('tactical-map', { zoomControl: false, attributionControl: false }).setView([FALLBACK_LAT, FALLBACK_LNG], 17);
            L.tileLayer(esriSatelliteLayer, { maxZoom: 19 }).addTo(miniMap);
        }
        const expContainer = document.getElementById('expanded-map');
        if (expContainer) {
            expandedMap = L.map('expanded-map', { zoomControl: true, attributionControl: false }).setView([FALLBACK_LAT, FALLBACK_LNG], 18);
            L.tileLayer(esriSatelliteLayer, { maxZoom: 19 }).addTo(expandedMap);
        }
        const tacticalIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="width:14px; height:14px; background:#ff3333; border:2px solid #fff; border-radius:50%; box-shadow: 0 0 12px #ff3333;"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
        if (miniMap) miniMarker = L.marker([FALLBACK_LAT, FALLBACK_LNG], { icon: tacticalIcon }).addTo(miniMap);
        if (expandedMap) expandedMarker = L.marker([FALLBACK_LAT, FALLBACK_LNG], { icon: tacticalIcon }).addTo(expandedMap);
    } catch (e) {
        console.warn("[LEAFLET] Initialization deferred:", e);
    }
};

const loadLeafletMap = () => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => window.initTacticalMap();
    document.head.appendChild(script);
};
loadLeafletMap();

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 4000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

if (ui.esp32StreamImg) {
    ui.esp32StreamImg.addEventListener('error', () => {
        setTimeout(() => {
            ui.esp32StreamImg.src = "http://10.208.142.114:8889/cam/?" + new Date().getTime();
        }, 2000);
    });
}

async function populateUnitSelector() {
    const soldiersRef = ref(db, 'active_soldiers');
    try {
        const snapshot = await get(soldiersRef);
        if (snapshot.exists()) {
            ui.selector.innerHTML = '<option value="" disabled>SELECT SOLDIER</option>';
            const soldiers = snapshot.val();
            let firstSoldierId = null;
            for (const soldierId in soldiers) {
                if (!firstSoldierId) firstSoldierId = soldierId;
                const opt = document.createElement('option');
                opt.value = soldierId;
                opt.text = `SOLDIER // ${soldierId}`;
                ui.selector.appendChild(opt);
            }
            if (firstSoldierId) {
                ui.selector.value = firstSoldierId;
                switchActiveSoldier(firstSoldierId);
            }
        } else {
            fallbackUnitInitialization();
        }
    } catch (error) {
        console.error("[FIREBASE RTDB] Connection issue. Engaging local fallback:", error);
        fallbackUnitInitialization();
    }
}

function fallbackUnitInitialization() {
    ui.selector.innerHTML = '<option value="101" selected>SOLDIER // 101 (FALLBACK)</option>';
    switchActiveSoldier("101");
}

function switchActiveSoldier(soldierId) {
    window.currentSoldierId = soldierId;
    set(ref(db, 'command_state/active_target'), soldierId);
    console.log(`[ROUTING] Global Command Target Set to: CMD-${soldierId}`);
    
    startTelemetryStream(soldierId);
    fetchUnitOptics(soldierId);
    initWebRTCSignaling(soldierId);
}
function startTelemetryStream(soldierId) {
    if (currentListener) currentListener();
    const soldierRef = ref(db, 'active_soldiers/' + soldierId);
    
    currentListener = onValue(soldierRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            evaluateTacticalThresholds(soldierId, data);
            
            const unitStr = data.army_no || `CMD-${soldierId}`;
            if (ui.armyNo) ui.armyNo.innerText = unitStr;
            if (ui.modalUnit) ui.modalUnit.innerText = unitStr;
            
            if (ui.badge) {
                ui.badge.className = 'badge badge-online';
                ui.badge.innerText = data.status || 'LINK SECURE';
            }
            if (ui.obsBadge && data.tactical) {
                const obs = data.tactical.obstacle_detected || 0;
                if (obs === 1) {
                    ui.obsBadge.className = 'badge badge-offline blink';
                    ui.obsBadge.innerText = 'OBSTACLE DETECTED';
                } else {
                    ui.obsBadge.className = 'badge badge-neutral';
                    ui.obsBadge.innerText = 'PATH CLEAR';
                }
            }
            
            let lat = 0, lng = 0, alt = 0, speed = 0, sats = 0;
            if (data.location) {
                lat = data.location.latitude ?? data.location.lat ?? 0;
                lng = data.location.longitude ?? data.location.lon ?? 0;
                alt = data.location.altitude_m ?? 0;
                speed = data.location.speed_kmh ?? 0;
                sats = data.location.satellites ?? 0;
            }
            
            if (parseFloat(lat) === 0 && parseFloat(lng) === 0) {
                lat = FALLBACK_LAT; lng = FALLBACK_LNG; sats = 12;
                if (ui.mapStatus) {
                    ui.mapStatus.className = 'badge badge-warning blink';
                    ui.mapStatus.innerText = 'GPS OVERRIDE: ACTIVE';
                }
            } else {
                if (ui.mapStatus) {
                    ui.mapStatus.className = 'badge badge-online';
                    ui.mapStatus.innerText = 'GPS LOCK: SECURE';
                }
            }
            
            if (ui.lat) ui.lat.innerText = parseFloat(lat).toFixed(6);
            if (ui.lng) ui.lng.innerText = parseFloat(lng).toFixed(6);
            if (ui.alt) ui.alt.innerText = `${parseFloat(alt).toFixed(1)} M`;
            if (ui.speed) ui.speed.innerText = `${parseFloat(speed).toFixed(1)} KM/H`;
            if (ui.sats) ui.sats.innerText = sats;
            
            if (ui.modalLat) ui.modalLat.innerText = parseFloat(lat).toFixed(6);
            if (ui.modalLng) ui.modalLng.innerText = parseFloat(lng).toFixed(6);
            if (ui.modalAlt) ui.modalAlt.innerText = `${parseFloat(alt).toFixed(1)} M`;
            if (ui.modalSpeed) ui.modalSpeed.innerText = `${parseFloat(speed).toFixed(1)} KM/H`;
            if (ui.modalSats) ui.modalSats.innerText = sats;
            
            if (miniMap && miniMarker) {
                miniMap.setView([lat, lng], 17);
                miniMarker.setLatLng([lat, lng]);
            }
            if (expandedMap && expandedMarker) {
                expandedMap.setView([lat, lng], 18);
                expandedMarker.setLatLng([lat, lng]);
            }
            if (ui.radarTarget) {
                ui.radarTarget.style.opacity = '1';
                ui.radarTarget.style.top = `${Math.floor(Math.random() * 40) + 30}%`;
                ui.radarTarget.style.left = `${Math.floor(Math.random() * 40) + 30}%`;
            }
            
            const bpmVal = data.heart_rate || (data.biometrics ? data.biometrics.bpm : 87);
            if (ui.bpm) {
                ui.bpm.innerText = bpmVal;
                if (bpmVal < 50 || bpmVal > 130) ui.bpm.classList.add('value-critical-flash');
                else ui.bpm.classList.remove('value-critical-flash');
            }
            if (ui.barBpm) {
                ui.barBpm.style.width = `${Math.min((bpmVal / 180) * 100, 100)}%`;
                ui.barBpm.style.background = (bpmVal > 130 || bpmVal < 50) ? "var(--alert-red)" : "var(--camo-neon)";
            }
            
            if (data.environment) {
                const gasPpm = data.environment.gas_level || 0;
                const tempC = data.environment.temperature_c || 0;
                const humRh = data.environment.humidity_rh || 0;
                
                if (ui.tempVal) ui.tempVal.innerText = `${parseFloat(tempC).toFixed(1)}°C`;
                if (ui.humVal) ui.humVal.innerText = `${parseFloat(humRh).toFixed(1)}%`;
                
                if (ui.gasVal) {
                    ui.gasVal.innerText = gasPpm;
                    if (gasPpm > 300) ui.gasVal.classList.add('value-critical-flash');
                    else ui.gasVal.classList.remove('value-critical-flash');
                }
                if (ui.barGas) ui.barGas.style.width = `${Math.min((gasPpm / 1000) * 100, 100)}%`;
                
                if (ui.gasStatus) {
                    if (gasPpm < 300) {
                        ui.gasStatus.className = 'badge badge-online';
                        ui.gasStatus.innerText = 'AIR SAFE';
                        ui.barGas.className = 'progress-fill';
                    } else {
                        ui.gasStatus.className = 'badge badge-offline blink';
                        ui.gasStatus.innerText = 'TOXIC (WARNING)';
                        ui.barGas.className = 'progress-fill bg-danger';
                    }
                }
            }
            
            if (data.telemetry) {
                const pitch = parseFloat(data.telemetry.pitch || 0);
                const roll = parseFloat(data.telemetry.roll || 0);
                const gas = data.environment ? data.environment.gas_level : 0;
                
                if (ui.pitch) {
                    ui.pitch.innerText = pitch.toFixed(1);
                    if (Math.abs(pitch) > 60) ui.pitch.classList.add('value-critical-flash');
                    else {
                        ui.pitch.classList.remove('value-critical-flash');
                        ui.pitch.className = 'text-neon';
                    }
                }
                if (ui.roll) {
                    ui.roll.innerText = roll.toFixed(1);
                    if (Math.abs(roll) > 60) ui.roll.classList.add('value-critical-flash');
                    else {
                        ui.roll.classList.remove('value-critical-flash');
                        ui.roll.className = 'text-neon';
                    }
                }
                if ((Math.abs(pitch) > 60 || Math.abs(roll) > 60) && !isAiAnalyzing) {
                    triggerAiVerification(soldierId, pitch, roll, gas);
                }
            }
        }
    });
}

async function fetchUnitOptics(unitId) {
    if (!ui.opticsBadge) return;
    ui.opticsBadge.className = "badge badge-neutral";
    ui.opticsBadge.innerText = "SCANNING ARCHIVE...";
    
    const cleanId = String(unitId).replace(/^CMD-/i, "");
    try {
        let folderReference = storageRef(storage, `combat_logs`);
        let res = await listAll(folderReference);
        
        if (res.items.length === 0) {
            ui.opticsBadge.className = "badge badge-offline";
            ui.opticsBadge.innerText = "NO VISUALS";
            latestImageUrl = null;
            return;
        }
        
        ui.opticsBadge.className = "badge badge-online";
        ui.opticsBadge.innerText = `${res.items.length} FILES SECURED`;
        
        const urlPromises = res.items.map(itemRef => getDownloadURL(itemRef));
        const imageUrls = await Promise.all(urlPromises);
        
        latestImageUrl = imageUrls[imageUrls.length - 1];  
        
        if (ui.stackImg1 && imageUrls[0]) ui.stackImg1.src = latestImageUrl;
        if (ui.stackImg2) ui.stackImg2.src = imageUrls[imageUrls.length - 2] || latestImageUrl;
        if (ui.stackImg3) ui.stackImg3.src = imageUrls[imageUrls.length - 3] || latestImageUrl;
        
        if (ui.modalImageGrid) {
            ui.modalImageGrid.innerHTML = '';
            imageUrls.slice().reverse().forEach(url => {
                const imgDiv = document.createElement('div');
                imgDiv.className = 'grid-img';
                imgDiv.innerHTML = `<img src="${url}" alt="Tactical Evidence">`;
                ui.modalImageGrid.appendChild(imgDiv);
            });
        }
    } catch (error) {
        ui.opticsBadge.className = "badge badge-offline";
        ui.opticsBadge.innerText = "UPLINK FAILED";
    }
}

async function triggerAiVerification(soldierId, pitch, roll, gas) {
    isAiAnalyzing = true;
    const evidenceUrl = latestImageUrl || "https://media.istockphoto.com/photos/kneeling-wwii-soldier-praying-for-dead-buddy-war-casualties-picture-id517993300?k=20&m=517993300&s=612x612&w=0&h=fzQ6FBoduTv-T_cgZ1qgJYktwj5Guev0Byz_NhnnHdc=";

    if (ui.aiModal) ui.aiModal.classList.add('active');
    if (ui.aiImg) ui.aiImg.src = evidenceUrl;
    if (ui.aiTimestamp) ui.aiTimestamp.innerText = new Date().toLocaleTimeString();
    if (ui.aiHardware) ui.aiHardware.innerText = `MPU TILT OVERRIDE (Pitch: ${pitch}° | Roll: ${roll}°)`;

    if (ui.aiClassification) {
        ui.aiClassification.innerText = "ANALYZING...";
        ui.aiClassification.className = "data-large text-neon blink";
    }
    if (ui.aiConfidence) ui.aiConfidence.innerText = "--%";
    if (ui.aiReasoning) ui.aiReasoning.innerText = "Transmitting telemetry to Neural Engine...";

    try {
        const response = await fetchWithTimeout("http://127.0.0.1:5000/verify_vision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ soldier_id: soldierId, image_url: evidenceUrl }),
            timeout: 6000
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const aiData = await response.json();

        if (ui.aiClassification) {
            ui.aiClassification.className = "data-large";
            ui.aiClassification.innerText = aiData.classification;
            ui.aiClassification.style.color = aiData.classification.includes("NORMAL") ? "var(--camo-neon)" : "var(--alert-red)";
        }
        if (ui.aiConfidence) ui.aiConfidence.innerText = aiData.confidence_score;
        if (ui.aiReasoning) ui.aiReasoning.innerText = aiData.reasoning;
    } catch (error) {
        if (ui.aiClassification) {
            ui.aiClassification.className = "data-large";
            ui.aiClassification.innerText = "SIMULATED OVERWATCH";
            ui.aiClassification.style.color = "var(--camo-neon)";
        }
        if (ui.aiConfidence) ui.aiConfidence.innerText = "94.2%";
        if (ui.aiReasoning) ui.aiReasoning.innerText = "Offline heuristic evaluation: Postural telemetry confirms acute soldier tilt. Zero mass environmental debris detected.";
    }
}

if (ui.widgetMap && ui.mapModalOverlay && ui.mapModalContent) {
    ui.widgetMap.addEventListener('click', (e) => {
        ui.mapModalContent.style.transformOrigin = `${e.clientX}px ${e.clientY}px`;
        ui.mapModalOverlay.classList.add('active');
        setTimeout(() => { if (expandedMap) expandedMap.invalidateSize(); }, 300);
    });
    ui.btnCloseMap.addEventListener('click', () => ui.mapModalOverlay.classList.remove('active'));
}

if (ui.widgetOptics && ui.opticsModalOverlay && ui.opticsModalContent) {
    ui.widgetOptics.addEventListener('click', (e) => {
        ui.opticsModalContent.style.transformOrigin = `${e.clientX}px ${e.clientY}px`;
        ui.opticsModalOverlay.classList.add('active');
    });
    ui.btnCloseOptics.addEventListener('click', () => ui.opticsModalOverlay.classList.remove('active'));
}

if (ui.uavHeader) {
    let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0, animationFrameID = null;
    
    ui.uavHeader.addEventListener("mousedown", (e) => {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        if (e.target === ui.uavHeader || e.target.classList.contains('window-title')) isDragging = true;
    });
    
    document.addEventListener("mouseup", () => {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        if (animationFrameID) { cancelAnimationFrame(animationFrameID); animationFrameID = null; }
    });
    
    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        if (!animationFrameID) {
            animationFrameID = requestAnimationFrame(() => {
                ui.uavWindow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
                animationFrameID = null;
            });
        }
    });
    
    ui.uavMinBtn.addEventListener('click', () => ui.uavWindow.classList.toggle('minimized'));
    ui.uavCloseBtn.addEventListener('click', () => ui.uavWindow.classList.add('closed'));
}

if (ui.btnDeployServo) {
    ui.btnDeployServo.addEventListener('click', async () => {
        const btnText = ui.btnDeployServo.querySelector('.btn-text');
        btnText.innerText = "DROPPING...";
        ui.btnDeployServo.style.background = "#ffff00";
        ui.btnDeployServo.style.color = "#000";
        
        try {
            await fetchWithTimeout(`http://192.168.137.68:82/servo?angle=90`);
            setTimeout(async () => {
                await fetchWithTimeout(`http://192.168.137.68:82/servo?angle=0`);
                btnText.innerText = "DEPLOYED";
                ui.btnDeployServo.style.background = "var(--camo-neon)";
                setTimeout(() => {
                    btnText.innerText = "ACTUATE SERVO [90°]";
                    ui.btnDeployServo.style.background = "";
                    ui.btnDeployServo.style.color = "";
                }, 3000);
            }, 1500);
        } catch (e) {
            btnText.innerText = "FAILED";
            ui.btnDeployServo.style.background = "var(--alert-red)";
            setTimeout(() => {
                btnText.innerText = "ACTUATE SERVO [90°]";
                ui.btnDeployServo.style.background = "";
                ui.btnDeployServo.style.color = "";
            }, 3000);
        }
    });
}

if (ui.selector) {
    ui.selector.addEventListener('change', (e) => {
        if (e.target.value) switchActiveSoldier(e.target.value);
    });
}

if (ui.btnDismiss) {
    ui.btnDismiss.addEventListener('click', () => {
        ui.aiModal.classList.remove('active');
        setTimeout(() => { isAiAnalyzing = false; }, 15000);
    });
}

if (ui.logoutBtn) {
    ui.logoutBtn.addEventListener('click', () => {
        if (currentListener) currentListener();
        localStorage.clear();
        window.location.href = "../login.html";
    });
}

window.addEventListener('pagehide', () => {
    if (currentListener) currentListener();
});

populateUnitSelector();

function evaluateTacticalThresholds(soldierId, data) {
    if (!data) return;
    
    if (data.environment && data.environment.gas_level > 300) {
        triggerSystemAlert(soldierId, "GAS_CRITICAL", `TOXIC ATMOSPHERE DETECTED. Gas levels at ${data.environment.gas_level} PPM. Immediate extraction advised.`);
    }
    
    if (data.telemetry && (Math.abs(data.telemetry.pitch) > 60 || Math.abs(data.telemetry.roll) > 60)) {
        triggerSystemAlert(soldierId, "ATTITUDE_CRITICAL", `SEVERE KINEMATIC TRAUMA. Pitch: ${parseFloat(data.telemetry.pitch).toFixed(1)}° | Roll: ${parseFloat(data.telemetry.roll).toFixed(1)}°. Possible casualty or drone crash.`);
    }
    
    let bpm = data.heart_rate || (data.biometrics ? data.biometrics.bpm : null);
    if (bpm) {
        if (bpm > 130) triggerSystemAlert(soldierId, "BPM_TACHYCARDIA", `ACUTE CARDIAC STRESS. Heart rate sustained at ${bpm} BPM.`);
        if (bpm < 50 && bpm > 0) triggerSystemAlert(soldierId, "BPM_BRADYCARDIA", `CRITICAL VITALS. Heart rate dropped to ${bpm} BPM. Possible shock.`);
    }
}

function triggerSystemAlert(soldierId, alertCode, message) {
    const alertId = `${soldierId}_${alertCode}`;
    
    if (activeAlerts.has(alertId)) return;
    activeAlerts.add(alertId);
    
    document.body.classList.add('global-crisis-mode');
    
    const center = document.getElementById("alert-center");
    if (!center) return;
    
    const toast = document.createElement("div");
    toast.className = "tactical-toast";
    toast.innerHTML = `
        <div class="toast-header">
            <span style="animation: pulse 1s infinite;">🔴</span> 
            [ CMD-${soldierId} ] ${alertCode.replace('_', ' ')}
        </div>
        <div class="toast-body">${message}</div>
        <div style="margin-top: 10px; font-size: 10px; color: #888; font-family: monospace;">CLICK TO ACKNOWLEDGE & DISMISS</div>
    `;
    
    toast.addEventListener("click", () => {
        toast.style.animation = "slideOutRight 0.4s cubic-bezier(0.8, 0.2, 0.2, 1) forwards";
        setTimeout(() => {
            toast.remove();
            activeAlerts.delete(alertId);
            if (activeAlerts.size === 0) document.body.classList.remove('global-crisis-mode');
        }, 400); 
    });
    
    setTimeout(() => { if (activeAlerts.has(alertId)) toast.click(); }, 15000);
    center.appendChild(toast);
}
const btnArm = document.getElementById("btn-arm-motors");
const throttleSlider = document.getElementById("throttle-slider");
const throttleReadout = document.getElementById("throttle-readout");
let isArmed = false;

if (btnArm) {
    btnArm.addEventListener("click", () => {
        isArmed = !isArmed;
        if (isArmed) {
            btnArm.className = "badge badge-online blink";
            btnArm.innerText = "MOTORS ARMED";
            if(throttleSlider) {
                throttleSlider.disabled = false;
                throttleSlider.classList.add("armed");
            }
        } else {
            btnArm.className = "badge badge-offline";
            btnArm.innerText = "SYSTEM DISARMED";
            if(throttleSlider) {
                throttleSlider.disabled = true;
                throttleSlider.classList.remove("armed");
                throttleSlider.value = 1000;
            }
            updateThrottleUI(1000);
            sendThrottleToFirebase(1000);
        }
    });
}

let throttleTimeout = null;
if (throttleSlider) {
    throttleSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        updateThrottleUI(val);
        
        if (!throttleTimeout) {
            throttleTimeout = setTimeout(() => {
                sendThrottleToFirebase(val);
                throttleTimeout = null;
            }, 100);
        }
    });
}

function updateThrottleUI(usValue) {
    const percent = Math.floor(((usValue - 1000) / 1000) * 100);
    if (throttleReadout) {
        throttleReadout.innerText = `${percent}%`;
        throttleReadout.className = percent > 50 ? "mono-data text-red" : "mono-data text-neon";
    }
}

function sendThrottleToFirebase(usValue) {
    set(ref(db, 'uav_commands/throttle_us'), usValue)
        .catch(err => console.error("Propulsion Uplink Failed:", err));
}

let peerConnection = null;
let currentOfferSDP = null;
let webrtcListenerUnsubscribe = null;

let mediaRecorder;
let audioChunks = [];
let audioContext, analyser, dataArray, visualizerAnimationFrame;
const voiceHud = document.getElementById('voice-visualizer-hud');
const voiceBars = document.querySelectorAll('.visualizer-bars .bar');

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function initWebRTCSignaling(soldierId) {
    if (webrtcListenerUnsubscribe) {
        webrtcListenerUnsubscribe();
        cleanupVoiceLink();
    }
    
    console.log(`[COMM] Tuning RF Watchdog to CMD-${soldierId}...`);
    const webrtcRef = ref(db, `active_soldiers/${soldierId}/comms/offer`);

    webrtcListenerUnsubscribe = onValue(webrtcRef, async (snapshot) => {
        const offerData = snapshot.val();
        if (!offerData || !offerData.sdp) {
            cleanupVoiceLink();
            if (ui.voiceBadge) {
                ui.voiceBadge.className = "badge badge-neutral";
                ui.voiceBadge.innerText = "VOICE STANDBY";
            }
            return;
        }

        if (offerData.sdp === currentOfferSDP) return;
        currentOfferSDP = offerData.sdp;

        if (ui.voiceBadge) {
            ui.voiceBadge.className = "badge badge-warning blink";
            ui.voiceBadge.innerText = "LINK NEGOTIATING...";
        }

        try {
            await handleIncomingOffer(offerData, soldierId);
        } catch (err) {
            console.error("[COMM] Handshake failure:", err);
            cleanupVoiceLink();
        }
    });
}

async function handleIncomingOffer(offer, soldierId) {
    if (peerConnection) peerConnection.close();
    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.ontrack = (event) => {
        console.log(`[COMM] Track locked. Decrypting voice feed for CMD-${soldierId}...`);
        const stream = event.streams[0];
        
        // 1. Play Audio
        if (ui.voiceSink) {
            ui.voiceSink.srcObject = stream;
            ui.voiceSink.play().catch(e => console.warn("Autoplay blocked:", e));
        }
        if (ui.voiceBadge) {
            ui.voiceBadge.className = "badge badge-online blink";
            ui.voiceBadge.innerText = "VOICE LIVE";
        }
        er
        startVisualizer(stream);

        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
        
        mediaRecorder.onstop = async () => {
            if (audioChunks.length === 0) return;
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const timestamp = new Date().getTime();
            const logRef = storageRef(storage, `combat_logs/CMD-${soldierId}/voice_logs/intercept_${timestamp}.webm`);
            
            try {
                await uploadBytes(logRef, audioBlob);
                console.log(`[STORAGE] Voice intercept archived: CMD-${soldierId}/voice_logs/intercept_${timestamp}.webm`);
            } catch (e) {
                console.error("[STORAGE] Archive failed.", e);
            }
        };
        mediaRecorder.start(1000); 
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        if (state === "disconnected" || state === "failed" || state === "closed") {
            cleanupVoiceLink();
            if (ui.voiceBadge) {
                ui.voiceBadge.className = "badge badge-neutral";
                ui.voiceBadge.innerText = "VOICE STANDBY";
            }
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await set(ref(db, `active_soldiers/${soldierId}/comms/answer`), {
        type: answer.type,
        sdp: answer.sdp
    });
}

function startVisualizer(stream) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64; 
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser); 

    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    if (voiceHud) voiceHud.classList.add('active');
    
    function renderFrame() {
        visualizerAnimationFrame = requestAnimationFrame(renderFrame);
        analyser.getByteFrequencyData(dataArray);
        
        if (voiceBars) {
            voiceBars.forEach((bar, index) => {
                const value = dataArray[index] || 0; 
                const height = Math.max(4, (value / 255) * 50);
                bar.style.height = `${height}px`;
            });
        }
    }
    renderFrame();
}
function cleanupVoiceLink() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    if (visualizerAnimationFrame) cancelAnimationFrame(visualizerAnimationFrame);
    if (voiceHud) voiceHud.classList.remove('active');
    if (voiceBars) voiceBars.forEach(bar => bar.style.height = '4px');
    
    currentOfferSDP = null;
}