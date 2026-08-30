import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getStorage, ref as storageRef, listAll, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
if (localStorage.getItem("cmd_authenticated") !== "true") {
    window.location.href = "../login.html";
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
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);
const ui = {
    selector: document.getElementById('unit-select'),
    logoutBtn: document.getElementById('btn-logout'),

    // Identity & Tactical Status
    armyNo: document.getElementById('ui-army-no'),
    badge: document.getElementById('connection-badge'),
    obsBadge: document.getElementById('ui-obstacle-badge'),

    // Geolocation, Navigation & Maps
    lat: document.getElementById('ui-lat'),
    lng: document.getElementById('ui-lng'),
    alt: document.getElementById('ui-alt'),
    speed: document.getElementById('ui-speed'),
    sats: document.getElementById('ui-sats'),
    radarTarget: document.getElementById('radar-target'),
    mapStatus: document.getElementById('map-status'),

    // Map Modal Telemetry
    modalUnit: document.getElementById('modal-unit'),
    modalLat: document.getElementById('modal-lat'),
    modalLng: document.getElementById('modal-lng'),
    modalAlt: document.getElementById('modal-alt'),
    modalSpeed: document.getElementById('modal-speed'),
    modalSats: document.getElementById('modal-sats'),

    // Biometrics & Environment & Kinematics
    bpm: document.getElementById('ui-bpm'),
    barBpm: document.getElementById('bar-bpm'),
    pitch: document.getElementById('ui-pitch'), // NEW: Pitch Data Binding
    roll: document.getElementById('ui-roll'),   // NEW: Roll Data Binding
    gasVal: document.getElementById('ui-gas-val'),
    gasStatus: document.getElementById('ui-gas-status'),
    barGas: document.getElementById('bar-gas'),
    tempVal: document.getElementById('ui-temp-val'),
    humVal: document.getElementById('ui-hum-val'),

    // Modals & UI Hooks
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
    esp32StreamImg: document.getElementById('esp32-stream')
};

let currentListener = null;
let isAiAnalyzing = false;
let latestImageUrl = null;

// ==========================================
// 3. DUAL-LEAFLET TACTICAL MAP ENGINE
// ==========================================
let miniMap = null, miniMarker = null;
let expandedMap = null, expandedMarker = null;
const FALLBACK_LAT = 27.020000; // Darjeeling Sector Fallback
const FALLBACK_LNG = 88.250000;

// Esri World Imagery (Satellite Feed)
const esriSatelliteLayer = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

window.initTacticalMap = () => {
    miniMap = L.map('tactical-map', { zoomControl: false, attributionControl: false }).setView([FALLBACK_LAT, FALLBACK_LNG], 17);
    L.tileLayer(esriSatelliteLayer, { maxZoom: 19 }).addTo(miniMap);
    
    expandedMap = L.map('expanded-map', { zoomControl: true, attributionControl: false }).setView([FALLBACK_LAT, FALLBACK_LNG], 18);
    L.tileLayer(esriSatelliteLayer, { maxZoom: 19 }).addTo(expandedMap);

    const tacticalIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="width:14px; height:14px; background:#ff3333; border:2px solid #fff; border-radius:50%; box-shadow: 0 0 12px #ff3333;"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7]
    });

    miniMarker = L.marker([FALLBACK_LAT, FALLBACK_LNG], { icon: tacticalIcon }).addTo(miniMap);
    expandedMarker = L.marker([FALLBACK_LAT, FALLBACK_LNG], { icon: tacticalIcon }).addTo(expandedMap);
};

const loadLeafletMap = () => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => window.initTacticalMap();
    document.head.appendChild(script);
};
loadLeafletMap();

// ==========================================
// 4. NETWORK RESILIENCE HELPER
// ==========================================
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 4000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id); return response;
    } catch (error) {
        clearTimeout(id); throw error;
    }
}

if (ui.esp32StreamImg) {
    ui.esp32StreamImg.addEventListener('error', () => {
        ui.esp32StreamImg.onerror = null;
        ui.esp32StreamImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='380' height='220' viewBox='0 0 380 220'><rect width='100%' height='100%' fill='%230a0c0a'/><path d='M0 0l380 220M380 0L0 220' stroke='%23121a12' stroke-width='2'/><text x='50%' y='50%' fill='%23ff3333' font-family='monospace' font-size='14' font-weight='bold' text-anchor='middle'>[ UAV LINK TIMED OUT ]</text></svg>";
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
                if (!firstSoldierId) firstSoldierId = soldierId; // Capture the first unit
                const opt = document.createElement('option');
                opt.value = soldierId; opt.text = `SOLDIER // ${soldierId}`;
                ui.selector.appendChild(opt);
            }

            if (firstSoldierId) {
                ui.selector.value = firstSoldierId;
                startTelemetryStream(firstSoldierId);
                fetchUnitOptics(firstSoldierId);
            }
        }
    } catch (error) { console.error(error); }
}

// ==========================================
// 6. DATABASE: REALTIME TELEMETRY ENGINE
// ==========================================
function startTelemetryStream(soldierId) {
    if (currentListener) currentListener();
    console.log(`[SYSTEM] Locking telemetry onto Soldier: ${soldierId}`);

    const soldierRef = ref(db, 'active_soldiers/' + soldierId);
    currentListener = onValue(soldierRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // --- Identity ---
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

            // --- Geolocation, Speed, Altitude & Dual-Map Fallback ---
            if (data.location) {
                let lat = data.location.latitude || 0;
                let lng = data.location.longitude || 0;
                const alt = data.location.altitude_m || 0;
                const speed = data.location.speed_kmh || 0;
                const sats = data.location.satellites || 0;
                
                // FALLBACK OVERRIDE
                if (parseFloat(lat) === 0 && parseFloat(lng) === 0) {
                    lat = FALLBACK_LAT; lng = FALLBACK_LNG;
                    if (ui.mapStatus) { ui.mapStatus.className = 'badge badge-warning blink'; ui.mapStatus.innerText = 'GPS OVERRIDE: ACTIVE'; }
                } else {
                    if (ui.mapStatus) { ui.mapStatus.className = 'badge badge-online'; ui.mapStatus.innerText = 'GPS LOCK: SECURE'; }
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

                if (ui.radarTarget && parseFloat(lat) !== 0) {
                    ui.radarTarget.style.opacity = '1';
                    ui.radarTarget.style.top = `${Math.floor(Math.random() * 50) + 25}%`;
                    ui.radarTarget.style.left = `${Math.floor(Math.random() * 50) + 25}%`;
                }
            }

            // --- Biometrics ---
            const bpmVal = data.heart_rate || 0;
            if (ui.bpm) ui.bpm.innerText = bpmVal;
            if (ui.barBpm) {
                ui.barBpm.style.width = `${Math.min((bpmVal / 180) * 100, 100)}%`;
                ui.barBpm.style.background = bpmVal > 120 ? "var(--alert-red)" : "var(--camo-neon)";
            }

            // --- Environment ---
            if (data.environment) {
                const gasPpm = data.environment.gas_level || 0;
                const tempC = data.environment.temperature_c || 0;
                const humRh = data.environment.humidity_rh || 0;

                if (ui.tempVal) ui.tempVal.innerText = `${parseFloat(tempC).toFixed(1)}°C`;
                if (ui.humVal) ui.humVal.innerText = `${parseFloat(humRh).toFixed(1)}%`;
                if (ui.gasVal) ui.gasVal.innerText = gasPpm;
                if (ui.barGas) ui.barGas.style.width = `${Math.min((gasPpm / 1000) * 100, 100)}%`;

                if (ui.gasStatus) {
                    if (gasPpm < 300) {
                        ui.gasStatus.className = 'badge badge-online'; ui.gasStatus.innerText = 'AIR SAFE';
                        ui.barGas.className = 'progress-fill';
                    } else {
                        ui.gasStatus.className = 'badge badge-offline blink'; ui.gasStatus.innerText = 'TOXIC (WARNING)';
                        ui.barGas.className = 'progress-fill bg-danger';
                    }
                }
            }

            // --- Telemetry Tripwire & Attitude Widget ---
            if (data.telemetry) {
                const pitch = parseFloat(data.telemetry.pitch || 0);
                const roll = parseFloat(data.telemetry.roll || 0);
                const gas = data.environment ? data.environment.gas_level : 0;

                // Update UI Pitch/Roll Widget
                if (ui.pitch) {
                    ui.pitch.innerText = pitch.toFixed(1);
                    ui.pitch.className = Math.abs(pitch) > 60 ? 'text-red blink' : 'text-neon';
                }
                if (ui.roll) {
                    ui.roll.innerText = roll.toFixed(1);
                    ui.roll.className = Math.abs(roll) > 60 ? 'text-red blink' : 'text-neon';
                }

                if ((Math.abs(pitch) > 60 || Math.abs(roll) > 60) && !isAiAnalyzing) {
                    triggerAiVerification(soldierId, pitch, roll, gas);
                }
            }
        }
    });
}

// ==========================================
// 7. STORAGE: FETCH OPTICS
// ==========================================
async function fetchUnitOptics(unitId) {
    if (!ui.opticsBadge) return;
    ui.opticsBadge.className = "badge badge-neutral"; ui.opticsBadge.innerText = "SCANNING ARCHIVE...";
    
    const folderReference = storageRef(storage, `combat_logs/CMD-${unitId}`);
    try {
        const res = await listAll(folderReference);
        if (res.items.length === 0) {
            ui.opticsBadge.className = "badge badge-offline"; ui.opticsBadge.innerText = "NO VISUAL INTEL";
            latestImageUrl = null; return;
        }

        ui.opticsBadge.className = "badge badge-online"; ui.opticsBadge.innerText = `${res.items.length} FILES SECURED`;
        const urlPromises = res.items.map(itemRef => getDownloadURL(itemRef));
        const imageUrls = await Promise.all(urlPromises);
        latestImageUrl = imageUrls[imageUrls.length - 1];

        if (ui.stackImg1 && imageUrls[0]) ui.stackImg1.src = latestImageUrl;
        if (ui.stackImg2 && imageUrls[1]) ui.stackImg2.src = imageUrls[imageUrls.length - 2] || imageUrls[0];
        if (ui.stackImg3 && imageUrls[2]) ui.stackImg3.src = imageUrls[imageUrls.length - 3] || imageUrls[0];

        if (ui.modalImageGrid) {
            ui.modalImageGrid.innerHTML = '';
            imageUrls.slice().reverse().forEach(url => {
                const imgDiv = document.createElement('div');
                imgDiv.className = 'grid-img'; imgDiv.innerHTML = `<img src="${url}" alt="Intel">`;
                ui.modalImageGrid.appendChild(imgDiv);
            });
        }
    } catch (error) {
        ui.opticsBadge.className = "badge badge-offline"; ui.opticsBadge.innerText = "UPLINK FAILED";
    }
}

// ==========================================
// 8. TENSORFLOW AI TRIGGER
// ==========================================
async function triggerAiVerification(soldierId, pitch, roll, gas) {
    if (!latestImageUrl) return;

    isAiAnalyzing = true;
    if (ui.aiModal) ui.aiModal.classList.add('active');
    if (ui.aiImg) ui.aiImg.src = latestImageUrl;
    if (ui.aiTimestamp) ui.aiTimestamp.innerText = new Date().toLocaleTimeString();
    if (ui.aiHardware) ui.aiHardware.innerText = `MPU TILT OVERRIDE (Pitch: ${pitch}° | Roll: ${roll}°)`;
    
    if (ui.aiClassification) {
        ui.aiClassification.innerText = "ANALYZING...";
        ui.aiClassification.className = "data-large text-neon blink";
    }
    if (ui.aiConfidence) ui.aiConfidence.innerText = "--%";

    try {
        const response = await fetchWithTimeout("http://localhost:5000/verify_vision", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ soldier_id: soldierId, image_url: latestImageUrl })
        });
        const aiData = await response.json();
        if (ui.aiClassification) {
            ui.aiClassification.className = "data-large"; ui.aiClassification.innerText = aiData.classification;
            ui.aiClassification.style.color = aiData.classification.includes("NORMAL") ? "var(--camo-neon)" : "var(--alert-red)";
        }
        if (ui.aiConfidence) ui.aiConfidence.innerText = aiData.confidence_score;
        if (ui.aiReasoning) ui.aiReasoning.innerText = aiData.reasoning;

    } catch (error) {
        if (ui.aiClassification) { ui.aiClassification.innerText = "AI LINK FAILED"; ui.aiClassification.style.color = "var(--alert-red)"; }
    }
}

// ==========================================
// 9. MODAL LOGIC & GPU PHYSICS
// ==========================================
// Map Modal Expanding Logic
if (ui.widgetMap && ui.mapModalOverlay && ui.mapModalContent) {
    ui.widgetMap.addEventListener('click', (e) => {
        ui.mapModalContent.style.transformOrigin = `${e.clientX}px ${e.clientY}px`;
        ui.mapModalOverlay.classList.add('active');
        setTimeout(() => { if (expandedMap) expandedMap.invalidateSize(); }, 300);
    });
    ui.btnCloseMap.addEventListener('click', () => ui.mapModalOverlay.classList.remove('active'));
}

// Optics Modal
if (ui.widgetOptics) {
    ui.widgetOptics.addEventListener('click', (e) => {
        ui.opticsModalContent.style.transformOrigin = `${e.clientX}px ${e.clientY}px`;
        ui.opticsModalOverlay.classList.add('active');
    });
    ui.btnCloseOptics.addEventListener('click', () => ui.opticsModalOverlay.classList.remove('active'));
}

// UAV Window Logic (60FPS Throttle)
if (ui.uavHeader) {
    let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0, animationFrameID = null;
    ui.uavHeader.addEventListener("mousedown", (e) => {
        initialX = e.clientX - xOffset; initialY = e.clientY - yOffset;
        if (e.target === ui.uavHeader || e.target.classList.contains('window-title')) isDragging = true;
    });
    document.addEventListener("mouseup", () => {
        initialX = currentX; initialY = currentY; isDragging = false;
        if (animationFrameID) { cancelAnimationFrame(animationFrameID); animationFrameID = null; }
    });
    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return; e.preventDefault();
        currentX = e.clientX - initialX; currentY = e.clientY - initialY;
        xOffset = currentX; yOffset = currentY;
        if (!animationFrameID) {
            animationFrameID = requestAnimationFrame(() => {
                ui.uavWindow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`; animationFrameID = null;
            });
        }
    });
    ui.uavMinBtn.addEventListener('click', () => ui.uavWindow.classList.toggle('minimized'));
    ui.uavCloseBtn.addEventListener('click', () => ui.uavWindow.classList.add('closed'));
}

// Hardware Drop Servo
if (ui.btnDeployServo) {
    ui.btnDeployServo.addEventListener('click', async () => {
        const btnText = ui.btnDeployServo.querySelector('.btn-text');
        btnText.innerText = "DROPPING..."; ui.btnDeployServo.style.background = "#ffff00"; ui.btnDeployServo.style.color = "#000";
        try {
            await fetchWithTimeout(`http://192.168.137.68:82/servo?angle=90`);
            setTimeout(async () => {
                await fetchWithTimeout(`http://192.168.137.68:82/servo?angle=0`);
                btnText.innerText = "DEPLOYED"; ui.btnDeployServo.style.background = "var(--camo-neon)";
                setTimeout(() => { btnText.innerText = "ACTUATE SERVO [90°]"; ui.btnDeployServo.style.background = ""; ui.btnDeployServo.style.color = ""; }, 3000);
            }, 1500);
        } catch (e) {
            btnText.innerText = "FAILED"; ui.btnDeployServo.style.background = "var(--alert-red)";
            setTimeout(() => { btnText.innerText = "ACTUATE SERVO [90°]"; ui.btnDeployServo.style.background = ""; ui.btnDeployServo.style.color = ""; }, 3000);
        }
    });
}

// App Lifecycles
ui.selector.addEventListener('change', (e) => {
    if (e.target.value) { startTelemetryStream(e.target.value); fetchUnitOptics(e.target.value); }
});
ui.btnDismiss.addEventListener('click', () => {
    ui.aiModal.classList.remove('active'); setTimeout(() => { isAiAnalyzing = false; }, 15000); 
});
ui.logoutBtn.addEventListener('click', () => {
    if (currentListener) currentListener(); localStorage.clear(); window.location.href = "../login.html";
});
window.addEventListener('pagehide', () => { if (currentListener) currentListener(); });

populateUnitSelector();