/**
 * ==============================================================================
 * FOREST GUARD - ADVANCED ENVIRONMENTAL & DISASTER MONITORING SYSTEM
 * Professional Client Controller & Disaster Event Recorder
 * ==============================================================================
 */

// ==============================================================================
// CONFIGURATION & PERSISTENT SETTINGS
// ==============================================================================
const CONFIG = {
    DEFAULT_IP: "192.168.4.1",
    DEFAULT_POLL_INTERVAL: 300,
    QUAKE_THRESHOLD: 0.20,
    GAS_THRESHOLD_FALLBACK: 2000,
    STORAGE_KEY_LOGS: "forest_guard_disaster_logs",
    STORAGE_KEY_SETTINGS: "forest_guard_settings",
};

// Load saved settings or use defaults
let settings = {
    esp32Ip: localStorage.getItem("fg_esp32_ip") || CONFIG.DEFAULT_IP,
    pollInterval: parseInt(localStorage.getItem("fg_poll_interval"), 10) || CONFIG.DEFAULT_POLL_INTERVAL,
    soundEnabled: localStorage.getItem("fg_sound_enabled") !== "false",
};

// ==============================================================================
// APPLICATION STATE
// ==============================================================================
const state = {
    isConnected: false,
    isSimulation: false,
    simScenario: "normal", // 'normal', 'fire', 'quake', 'both'
    pollTimer: null,
    activeFireEvent: null,
    activeQuakeEvent: null,
    disasterLogs: [],
    currentFilter: "all",
    
    // Historical peaks
    peakGasEver: 0,
    peakQuakeEver: 0,
    
    // Seismograph wave data buffer
    waveBuffer: new Array(50).fill(0.015),
    
    // Audio synthesizer
    audioCtx: null,
    activeOscillators: [],
    isAlarmSounding: false
};

// ==============================================================================
// DOM ELEMENTS CACHE
// ==============================================================================
const DOM = {
    // Top emergency bar
    emergencyBar: document.getElementById("emergencyBar"),
    emergencyIcon: document.getElementById("emergencyIcon"),
    emergencyTitle: document.getElementById("emergencyTitle"),
    emergencyDesc: document.getElementById("emergencyDesc"),
    silenceBtn: document.getElementById("silenceBtn"),
    
    // Controls
    soundToggleBtn: document.getElementById("soundToggleBtn"),
    simToggleBtn: document.getElementById("simToggleBtn"),
    simControlsBar: document.getElementById("simControlsBar"),
    settingsBtn: document.getElementById("settingsBtn"),
    connectionPill: document.getElementById("connectionPill"),
    connectionText: document.getElementById("connectionText"),
    
    // Overview bar
    masterStatusCard: document.getElementById("masterStatusCard"),
    masterStatusIcon: document.getElementById("masterStatusIcon"),
    masterStatusText: document.getElementById("masterStatusText"),
    masterStatusSub: document.getElementById("masterStatusSub"),
    fireRiskVal: document.getElementById("fireRiskVal"),
    fireRiskPill: document.getElementById("fireRiskPill"),
    totalEventsCount: document.getElementById("totalEventsCount"),
    totalFiresCount: document.getElementById("totalFiresCount"),
    totalQuakesCount: document.getElementById("totalQuakesCount"),
    uptimeVal: document.getElementById("uptimeVal"),
    lastSyncTime: document.getElementById("lastSyncTime"),
    
    // Gas card
    gasCard: document.getElementById("gasCard"),
    gasBadge: document.getElementById("gasBadge"),
    gasValue: document.getElementById("gasValue"),
    gasThresholdDisplay: document.getElementById("gasThresholdDisplay"),
    gasBar: document.getElementById("gasBar"),
    gasStatusText: document.getElementById("gasStatusText"),
    gasPeakEver: document.getElementById("gasPeakEver"),
    
    // Quake card
    quakeCard: document.getElementById("quakeCard"),
    quakeBadge: document.getElementById("quakeBadge"),
    vibration: document.getElementById("vibration"),
    peakVibration: document.getElementById("peakVibration"),
    quakeStatusText: document.getElementById("quakeStatusText"),
    quakePeakEver: document.getElementById("quakePeakEver"),
    seismographCanvas: document.getElementById("seismographCanvas"),
    
    // Temperature card
    temperature: document.getElementById("temperature"),
    tempBadge: document.getElementById("tempBadge"),
    tempFahrenheit: document.getElementById("tempFahrenheit"),
    heatIndex: document.getElementById("heatIndex"),
    tempRangeFill: document.getElementById("tempRangeFill"),
    
    // Humidity card
    humidity: document.getElementById("humidity"),
    humBadge: document.getElementById("humBadge"),
    dewPoint: document.getElementById("dewPoint"),
    drynessLevel: document.getElementById("drynessLevel"),
    humRangeFill: document.getElementById("humRangeFill"),
    
    // Log section
    logTable: document.getElementById("logTable"),
    logTableBody: document.getElementById("logTableBody"),
    logEmptyState: document.getElementById("logEmptyState"),
    countAll: document.getElementById("countAll"),
    countFires: document.getElementById("countFires"),
    countQuakes: document.getElementById("countQuakes"),
    exportCsvBtn: document.getElementById("exportCsvBtn"),
    clearLogBtn: document.getElementById("clearLogBtn"),
    triggerTestEventBtn: document.getElementById("triggerTestEventBtn"),
    storageSizeDisplay: document.getElementById("storageSizeDisplay"),
    
    // Diagnostics
    diagIp: document.getElementById("diagIp"),
    
    // Settings modal
    settingsModal: document.getElementById("settingsModal"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    ipInput: document.getElementById("ipInput"),
    pollRateInput: document.getElementById("pollRateInput"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    resetSettingsBtn: document.getElementById("resetSettingsBtn"),
    testFireSirenBtn: document.getElementById("testFireSirenBtn"),
    testQuakeSirenBtn: document.getElementById("testQuakeSirenBtn"),
};

// ==============================================================================
// INITIALIZATION
// ==============================================================================
function init() {
    loadDisasterLogs();
    initSeismograph();
    setupEventListeners();
    updateSoundButtonUI();
    updateStorageSizeUI();
    
    DOM.diagIp.textContent = settings.esp32Ip;
    DOM.ipInput.value = settings.esp32Ip;
    DOM.pollRateInput.value = settings.pollInterval;
    
    startPolling();
}

// ==============================================================================
// WEB AUDIO API EMERGENCY SOUND GENERATOR (100% Offline)
// ==============================================================================
function getAudioContext() {
    if (!state.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            state.audioCtx = new AudioContextClass();
        }
    }
    if (state.audioCtx && state.audioCtx.state === "suspended") {
        state.audioCtx.resume();
    }
    return state.audioCtx;
}

function startEmergencyAlarm(type) {
    if (!settings.soundEnabled || state.isAlarmSounding) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;
    
    stopEmergencyAlarm();
    state.isAlarmSounding = true;
    
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        
        if (type === "fire") {
            // Rising and falling emergency siren
            osc.type = "sawtooth";
            const now = ctx.currentTime;
            for (let i = 0; i < 20; i++) {
                osc.frequency.linearRampToValueAtTime(1100, now + i * 0.8 + 0.4);
                osc.frequency.linearRampToValueAtTime(650, now + i * 0.8 + 0.8);
            }
        } else if (type === "quake") {
            // Pulsing seismic rumble alarm
            osc.type = "square";
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            // Staccato pulses
            const lfo = ctx.createOscillator();
            lfo.frequency.setValueAtTime(4, ctx.currentTime);
            const lfoGain = ctx.createGain();
            lfoGain.gain.setValueAtTime(0.2, ctx.currentTime);
            lfo.connect(lfoGain.gain);
            lfo.start();
            state.activeOscillators.push(lfo);
        } else {
            // General high/low beep
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
        }
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        
        state.activeOscillators.push(osc);
    } catch (e) {
        console.warn("Audio alarm warning:", e);
    }
}

function stopEmergencyAlarm() {
    state.isAlarmSounding = false;
    state.activeOscillators.forEach(osc => {
        try {
            osc.stop();
            osc.disconnect();
        } catch (e) {}
    });
    state.activeOscillators = [];
}

// ==============================================================================
// DATA POLLING & ESP32 API INTEGRATION
// ==============================================================================
function startPolling() {
    if (state.pollTimer) {
        clearInterval(state.pollTimer);
    }
    
    // First run immediately
    fetchSensorData();
    
    state.pollTimer = setInterval(() => {
        fetchSensorData();
    }, settings.pollInterval);
}

async function fetchSensorData() {
    if (state.isSimulation) {
        processSensorData(getSimulatedData());
        return;
    }
    
    const apiUrl = `http://${settings.esp32Ip}/api/data`;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(apiUrl, {
            cache: "no-store",
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }
        
        const data = await response.json();
        setConnectionState(true);
        processSensorData(data);
    } catch (err) {
        setConnectionState(false);
        handleConnectionFailure(err);
    }
}

function setConnectionState(connected) {
    state.isConnected = connected;
    
    if (state.isSimulation) {
        DOM.connectionPill.className = "connection-pill simulation";
        DOM.connectionText.textContent = "🧪 وضع المحاكاة";
        return;
    }
    
    if (connected) {
        DOM.connectionPill.className = "connection-pill connected";
        DOM.connectionText.textContent = "● متصل بـ ESP32";
    } else {
        DOM.connectionPill.className = "connection-pill disconnected";
        DOM.connectionText.textContent = "● غير متصل";
    }
}

function handleConnectionFailure(err) {
    DOM.masterStatusCard.className = "overview-card status-master-card";
    DOM.masterStatusIcon.textContent = "⚠️";
    DOM.masterStatusText.textContent = "فقد الاتصال بالمتحكم";
    DOM.masterStatusText.style.color = "#f87171";
    DOM.masterStatusSub.textContent = `تعذر الوصول إلى http://${settings.esp32Ip}/api/data. تأكد من الاتصال بشبكة ESP32-Forest-Guard`;
    DOM.lastSyncTime.textContent = `آخر محاولة: ${new Date().toLocaleTimeString("ar-EG")}`;
}

// ==============================================================================
// DATA PROCESSING & DISASTER LOGGING CORE
// ==============================================================================
function processSensorData(data) {
    const now = new Date();
    DOM.lastSyncTime.textContent = `آخر استجابة: ${now.toLocaleTimeString("ar-EG")}`;
    
    // 1. Process Gas & Fire (MQ-9)
    const gasVal = typeof data.gas === "number" ? data.gas : 0;
    const gasThresh = data.gasThreshold || CONFIG.GAS_THRESHOLD_FALLBACK;
    const isGasAlert = Boolean(data.gasAlert || gasVal > gasThresh);
    
    DOM.gasValue.textContent = gasVal;
    DOM.gasThresholdDisplay.textContent = `${gasThresh} ADC`;
    
    // Update historical peak
    if (gasVal > state.peakGasEver) {
        state.peakGasEver = gasVal;
        DOM.gasPeakEver.textContent = `أعلى غاز: ${state.peakGasEver} ADC`;
    }
    
    // Gas Progress Bar (0 to 4095 ADC max for ESP32 12-bit ADC)
    const gasPercent = Math.min(Math.round((gasVal / 4095) * 100), 100);
    DOM.gasBar.style.width = `${gasPercent}%`;
    
    if (isGasAlert) {
        DOM.gasCard.classList.add("alert");
        DOM.gasBadge.className = "sensor-badge badge-danger";
        DOM.gasBadge.textContent = "خطر حريق / غاز!";
        DOM.gasStatusText.textContent = "⚠️ تركيز الغاز تجاوز العتبة الآمنة! احتمال نشوب حريق أو تسرب خطير.";
    } else if (gasVal > gasThresh * 0.6) {
        DOM.gasCard.classList.remove("alert");
        DOM.gasBadge.className = "sensor-badge badge-warning";
        DOM.gasBadge.textContent = "تصاعد غاز";
        DOM.gasStatusText.textContent = "مستوى الغاز مرتفع نسبياً. يرجى توخي الحذر ومتابعة الموقع.";
    } else {
        DOM.gasCard.classList.remove("alert");
        DOM.gasBadge.className = "sensor-badge badge-safe";
        DOM.gasBadge.textContent = "طبيعي وآمن";
        DOM.gasStatusText.textContent = "المستشعر مستقر وضمن الحدود الطبيعية.";
    }
    
    // 2. Process Vibration & Earthquake (MPU-6050)
    const vib = typeof data.vibration === "number" ? data.vibration : 0;
    const peakVib = typeof data.peakVibration === "number" ? data.peakVibration : vib;
    const isQuake = Boolean(data.quake || vib > CONFIG.QUAKE_THRESHOLD);
    
    DOM.vibration.textContent = vib.toFixed(3);
    DOM.peakVibration.textContent = `${peakVib.toFixed(3)} g`;
    
    if (vib > state.peakQuakeEver) {
        state.peakQuakeEver = vib;
        DOM.quakePeakEver.textContent = `أقوى هزة: ${state.peakQuakeEver.toFixed(3)} g`;
    }
    
    // Feed wave buffer for seismograph
    updateSeismographBuffer(vib, isQuake);
    
    if (isQuake) {
        DOM.quakeCard.classList.add("alert");
        DOM.quakeBadge.className = "sensor-badge badge-danger";
        DOM.quakeBadge.textContent = "زلزال نشط!";
        DOM.quakeStatusText.textContent = "🚨 تم رصد تسارع واهتزاز عنيف في التربة بواسطة MPU6050!";
    } else if (vib > 0.08) {
        DOM.quakeCard.classList.remove("alert");
        DOM.quakeBadge.className = "sensor-badge badge-warning";
        DOM.quakeBadge.textContent = "اهتزاز خفيف";
        DOM.quakeStatusText.textContent = "اهتزازات أرضية طفيفة تحت عتبة الخطر.";
    } else {
        DOM.quakeCard.classList.remove("alert");
        DOM.quakeBadge.className = "sensor-badge badge-safe";
        DOM.quakeBadge.textContent = "مستقر";
        DOM.quakeStatusText.textContent = "الأرض مستقرة ولا يوجد أي نشاط زلزالي.";
    }
    
    // 3. Process DHT-11 Temperature & Humidity
    const temp = data.temperature;
    const hum = data.humidity;
    
    if (temp !== null && temp !== undefined && !isNaN(temp)) {
        const numTemp = parseFloat(temp);
        DOM.temperature.textContent = numTemp.toFixed(1);
        DOM.tempFahrenheit.textContent = `${((numTemp * 9/5) + 32).toFixed(1)} °F`;
        
        // Heat Index
        if (hum !== null && !isNaN(hum)) {
            const hi = calculateHeatIndex(numTemp, parseFloat(hum));
            DOM.heatIndex.textContent = `${hi.toFixed(1)} °C`;
        }
        
        const tempFill = Math.min(Math.max((numTemp / 50) * 100, 5), 100);
        DOM.tempRangeFill.style.width = `${tempFill}%`;
        
        if (numTemp > 40) {
            DOM.tempBadge.className = "sensor-badge badge-danger";
            DOM.tempBadge.textContent = "حرارة شديدة";
        } else if (numTemp > 30) {
            DOM.tempBadge.className = "sensor-badge badge-warning";
            DOM.tempBadge.textContent = "مرتفع";
        } else {
            DOM.tempBadge.className = "sensor-badge badge-normal";
            DOM.tempBadge.textContent = "معتدل";
        }
    } else {
        DOM.temperature.textContent = "--";
        DOM.tempFahrenheit.textContent = "-- °F";
        DOM.heatIndex.textContent = "-- °C";
        DOM.tempBadge.textContent = "فحص...";
    }
    
    if (hum !== null && hum !== undefined && !isNaN(hum)) {
        const numHum = parseFloat(hum);
        DOM.humidity.textContent = numHum.toFixed(0);
        
        // Dew Point
        if (temp !== null && !isNaN(temp)) {
            const dp = calculateDewPoint(parseFloat(temp), numHum);
            DOM.dewPoint.textContent = `${dp.toFixed(1)} °C`;
        }
        
        DOM.humRangeFill.style.width = `${Math.min(Math.max(numHum, 5), 100)}%`;
        
        if (numHum < 25) {
            DOM.humBadge.className = "sensor-badge badge-danger";
            DOM.humBadge.textContent = "جفاف حاد";
            DOM.drynessLevel.textContent = "جاف جداً (خطر اشتعال)";
        } else if (numHum < 40) {
            DOM.humBadge.className = "sensor-badge badge-warning";
            DOM.humBadge.textContent = "جاف";
            DOM.drynessLevel.textContent = "جاف";
        } else {
            DOM.humBadge.className = "sensor-badge badge-safe";
            DOM.humBadge.textContent = "متوازن";
            DOM.drynessLevel.textContent = "رطب";
        }
    } else {
        DOM.humidity.textContent = "--";
        DOM.dewPoint.textContent = "-- °C";
        DOM.humBadge.textContent = "فحص...";
    }
    
    // 4. Calculate Forest Fire Weather Risk Index (FWI)
    updateFireRiskIndex(temp, hum, gasVal);
    
    // 5. Overall System Status Card & Top Banner
    const isOverallAlarm = Boolean(data.alarm || isGasAlert || isQuake);
    updateMasterStatus(isOverallAlarm, isGasAlert, isQuake, gasVal, vib);
    
    // 6. Uptime Display
    if (data.uptime !== undefined) {
        DOM.uptimeVal.textContent = formatUptime(data.uptime);
    }
    
    // 7. CRITICAL: DISASTER LOGGING & EVENT RECORDING
    recordDisasterEvents({
        isGasAlert,
        gasVal,
        gasThresh,
        isQuake,
        vib,
        peakVib,
        temp,
        hum,
        now
    });
}

// ==============================================================================
// DISASTER LOGGING ENGINE (تسجيل الزلازل والحرائق)
// ==============================================================================
function recordDisasterEvents(ctx) {
    const { isGasAlert, gasVal, isQuake, vib, peakVib, temp, hum, now } = ctx;
    let logsChanged = false;
    
    // --- A. FIRE EVENT TRACKING ---
    if (isGasAlert) {
        if (!state.activeFireEvent) {
            // New Fire Incident Started!
            state.activeFireEvent = {
                id: `FIRE-${Date.now().toString(36).toUpperCase()}`,
                type: "fire",
                title: "إنذار حريق / كثافة غاز مرتفعة (MQ-9)",
                startTime: now.toISOString(),
                startTimeFormatted: now.toLocaleString("ar-EG"),
                endTime: null,
                durationSeconds: 0,
                peakIntensity: gasVal,
                peakUnit: "ADC",
                conditions: `الحرارة: ${temp !== null ? temp + "°C" : "--"} | الرطوبة: ${hum !== null ? hum + "%" : "--"}`,
                status: "active"
            };
            
            state.disasterLogs.unshift(state.activeFireEvent);
            logsChanged = true;
            startEmergencyAlarm("fire");
        } else {
            // Update ongoing fire peak and duration
            const currentEvent = state.activeFireEvent;
            if (gasVal > currentEvent.peakIntensity) {
                currentEvent.peakIntensity = gasVal;
                logsChanged = true;
            }
            const duration = Math.max(1, Math.round((now.getTime() - new Date(currentEvent.startTime).getTime()) / 1000));
            if (duration !== currentEvent.durationSeconds) {
                currentEvent.durationSeconds = duration;
                logsChanged = true;
            }
        }
    } else {
        // Fire condition cleared
        if (state.activeFireEvent) {
            state.activeFireEvent.endTime = now.toISOString();
            state.activeFireEvent.durationSeconds = Math.max(1, Math.round((now.getTime() - new Date(state.activeFireEvent.startTime).getTime()) / 1000));
            state.activeFireEvent.status = "resolved";
            state.activeFireEvent = null;
            logsChanged = true;
            if (!state.activeQuakeEvent) {
                stopEmergencyAlarm();
            }
        }
    }
    
    // --- B. EARTHQUAKE EVENT TRACKING ---
    if (isQuake) {
        const effectiveVib = Math.max(vib, peakVib);
        if (!state.activeQuakeEvent) {
            // New Earthquake Incident Started!
            state.activeQuakeEvent = {
                id: `QUAKE-${Date.now().toString(36).toUpperCase()}`,
                type: "quake",
                title: "رصد هزة أرضية ونشاط زلزالي (MPU-6050)",
                startTime: now.toISOString(),
                startTimeFormatted: now.toLocaleString("ar-EG"),
                endTime: null,
                durationSeconds: 0,
                peakIntensity: effectiveVib.toFixed(3),
                peakUnit: "g",
                conditions: `تسارع لحظي: ${vib.toFixed(3)}g | الذروة: ${peakVib.toFixed(3)}g`,
                status: "active"
            };
            
            state.disasterLogs.unshift(state.activeQuakeEvent);
            logsChanged = true;
            startEmergencyAlarm("quake");
        } else {
            // Update ongoing quake peak and duration
            const currentEvent = state.activeQuakeEvent;
            const currentMax = parseFloat(currentEvent.peakIntensity) || 0;
            if (effectiveVib > currentMax) {
                currentEvent.peakIntensity = effectiveVib.toFixed(3);
                logsChanged = true;
            }
            const duration = Math.max(1, Math.round((now.getTime() - new Date(currentEvent.startTime).getTime()) / 1000));
            if (duration !== currentEvent.durationSeconds) {
                currentEvent.durationSeconds = duration;
                logsChanged = true;
            }
        }
    } else {
        // Quake condition cleared
        if (state.activeQuakeEvent) {
            state.activeQuakeEvent.endTime = now.toISOString();
            state.activeQuakeEvent.durationSeconds = Math.max(1, Math.round((now.getTime() - new Date(state.activeQuakeEvent.startTime).getTime()) / 1000));
            state.activeQuakeEvent.status = "resolved";
            state.activeQuakeEvent = null;
            logsChanged = true;
            if (!state.activeFireEvent) {
                stopEmergencyAlarm();
            }
        }
    }
    
    if (logsChanged) {
        saveDisasterLogs();
        renderDisasterLogs();
    }
}

// ==============================================================================
// DISASTER LOG PERSISTENCE & TABLE RENDERING
// ==============================================================================
function loadDisasterLogs() {
    try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY_LOGS);
        state.disasterLogs = raw ? JSON.parse(raw) : [];
        renderDisasterLogs();
    } catch (e) {
        console.error("Error reading saved disaster logs:", e);
        state.disasterLogs = [];
    }
}

function saveDisasterLogs() {
    try {
        // Keep up to 300 recent records
        if (state.disasterLogs.length > 300) {
            state.disasterLogs = state.disasterLogs.slice(0, 300);
        }
        localStorage.setItem(CONFIG.STORAGE_KEY_LOGS, JSON.stringify(state.disasterLogs));
        updateStorageSizeUI();
    } catch (e) {
        console.error("Error saving disaster logs:", e);
    }
}

function renderDisasterLogs() {
    // 1. Update counters
    const fires = state.disasterLogs.filter(e => e.type === "fire").length;
    const quakes = state.disasterLogs.filter(e => e.type === "quake").length;
    const total = state.disasterLogs.length;
    
    DOM.countAll.textContent = total;
    DOM.countFires.textContent = fires;
    DOM.countQuakes.textContent = quakes;
    
    DOM.totalEventsCount.textContent = total;
    DOM.totalFiresCount.textContent = `🔥 ${fires} حريق`;
    DOM.totalQuakesCount.textContent = `🌋 ${quakes} زلزال`;
    
    // 2. Filter logs
    const filtered = state.disasterLogs.filter(item => {
        if (state.currentFilter === "all") return true;
        return item.type === state.currentFilter;
    });
    
    // 3. Render table
    if (filtered.length === 0) {
        DOM.logTable.style.display = "none";
        DOM.logEmptyState.classList.remove("hidden");
        DOM.logTableBody.innerHTML = "";
        return;
    }
    
    DOM.logTable.style.display = "table";
    DOM.logEmptyState.classList.add("hidden");
    
    DOM.logTableBody.innerHTML = filtered.map((event, index) => {
        const isFire = event.type === "fire";
        const icon = isFire ? "🔥" : "🌋";
        const typeClass = isFire ? "event-type-fire" : "event-type-quake";
        const typeLabel = isFire ? "إنذار حريق / غاز" : "نشاط زلزالي";
        
        const isActive = event.status === "active";
        const rowClass = isActive ? "row-active" : "";
        
        const statusBadge = isActive
            ? `<span class="event-status-pill status-active-pill">● نشط الآن</span>`
            : `<span class="event-status-pill status-resolved-pill">✓ منتهي ومستقر</span>`;
            
        const durationText = formatDuration(event.durationSeconds, isActive);
        
        return `
            <tr class="${rowClass}">
                <td class="font-mono text-muted">#${filtered.length - index}</td>
                <td>
                    <span class="event-type-badge ${typeClass}">
                        ${icon} ${typeLabel}
                    </span>
                </td>
                <td class="font-mono">${escapeHtml(event.startTimeFormatted || event.startTime)}</td>
                <td class="font-mono">${durationText}</td>
                <td>
                    <strong class="font-mono ${isFire ? 'text-danger' : 'text-warning'}">
                        ${event.peakIntensity} ${event.peakUnit}
                    </strong>
                </td>
                <td class="text-secondary" style="font-size: 0.82rem;">
                    ${escapeHtml(event.conditions || "--")}
                </td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join("");
}

function formatDuration(seconds, isActive) {
    if (isActive) {
        return `مستمر (${seconds} ث)`;
    }
    if (seconds < 60) {
        return `${seconds} ثانية`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} د ${secs} ث`;
}

function updateStorageSizeUI() {
    try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY_LOGS) || "";
        const bytes = new Blob([data]).size;
        const kb = (bytes / 1024).toFixed(1);
        DOM.storageSizeDisplay.textContent = `الذاكرة المستخدمة: ${kb} KB (${state.disasterLogs.length} سجل)`;
    } catch (e) {}
}

// ==============================================================================
// MASTER STATUS & TOP BANNER
// ==============================================================================
function updateMasterStatus(isAlarm, isGasAlert, isQuake, gasVal, vib) {
    if (isAlarm) {
        DOM.masterStatusCard.className = "overview-card status-master-card state-danger";
        DOM.emergencyBar.classList.remove("hidden");
        
        if (isGasAlert && isQuake) {
            DOM.masterStatusIcon.textContent = "💥";
            DOM.masterStatusText.textContent = "إنذار مزدوج: زلزال وحريق!";
            DOM.masterStatusSub.textContent = `غاز: ${gasVal} ADC | اهتزاز: ${vib.toFixed(3)}g - اتخاذ تدابير الإخلاء الفوري!`;
            
            DOM.emergencyIcon.textContent = "💥";
            DOM.emergencyTitle.textContent = "إنذار طوارئ مزدوج: زلزال وحريق متزامنان!";
            DOM.emergencyDesc.textContent = "تسجيل قيم خطيرة في حساس MPU6050 وحساس الغاز MQ-9.";
        } else if (isGasAlert) {
            DOM.masterStatusIcon.textContent = "🔥";
            DOM.masterStatusText.textContent = "خطر حريق / غاز مرتفع!";
            DOM.masterStatusSub.textContent = `تركيز الغاز ${gasVal} ADC تجاوز عتبة الأمان - تفعيل نظام مكافحة الحرائق!`;
            
            DOM.emergencyIcon.textContent = "🔥";
            DOM.emergencyTitle.textContent = "تحذير حريق: رصد تركيز كثيف للغاز والأدخنة!";
            DOM.emergencyDesc.textContent = `قراءة الغاز: ${gasVal} ADC (العتبة: 2000). يتم التوثيق الآلي في السجل.`;
        } else {
            DOM.masterStatusIcon.textContent = "🌋";
            DOM.masterStatusText.textContent = "رصد نشاط زلزالي نشط!";
            DOM.masterStatusSub.textContent = `تسارع الاهتزاز ${vib.toFixed(3)}g تجاوز عتبة الأمان (0.20g)!`;
            
            DOM.emergencyIcon.textContent = "🌋";
            DOM.emergencyTitle.textContent = "تحذير زلزال: رصد اهتزازات أرضية عنيفة!";
            DOM.emergencyDesc.textContent = `تسارع الاهتزاز: ${vib.toFixed(3)} g. يتم التوثيق الآلي في السجل.`;
        }
    } else {
        DOM.masterStatusCard.className = "overview-card status-master-card";
        DOM.emergencyBar.classList.add("hidden");
        DOM.masterStatusIcon.textContent = "🛡️";
        DOM.masterStatusText.textContent = "النظام في حالة رصد آمنة ومستقرة";
        DOM.masterStatusText.style.color = "var(--color-safe)";
        DOM.masterStatusSub.textContent = "كافة المستشعرات ضمن النطاق الطبيعي ولا توجد أي مخاطر بيئية.";
    }
}

// ==============================================================================
// ENVIRONMENTAL CALCULATIONS (FWI, HEAT INDEX, DEW POINT)
// ==============================================================================
function updateFireRiskIndex(temp, hum, gasVal) {
    if (temp === null || hum === null || isNaN(temp) || isNaN(hum)) {
        DOM.fireRiskVal.textContent = "غير متاح";
        DOM.fireRiskPill.textContent = "--";
        DOM.fireRiskPill.className = "metric-pill";
        return;
    }
    
    // Simple Forest Fire Weather Index (FWI) proxy:
    // Higher temp + Lower humidity + Higher gas = higher risk
    let riskScore = (temp * 1.5) - (hum * 0.8) + (gasVal / 100);
    
    if (riskScore > 45 || gasVal > 2000) {
        DOM.fireRiskVal.textContent = "شديد الخطورة";
        DOM.fireRiskVal.className = "metric-val text-danger";
        DOM.fireRiskPill.textContent = "خطر حريق!";
        DOM.fireRiskPill.className = "metric-pill danger";
    } else if (riskScore > 25 || hum < 30) {
        DOM.fireRiskVal.textContent = "مرتفع";
        DOM.fireRiskVal.className = "metric-val text-warning";
        DOM.fireRiskPill.textContent = "تحذير";
        DOM.fireRiskPill.className = "metric-pill warning";
    } else {
        DOM.fireRiskVal.textContent = "منخفض وآمن";
        DOM.fireRiskVal.className = "metric-val text-success";
        DOM.fireRiskPill.textContent = "آمن";
        DOM.fireRiskPill.className = "metric-pill safe";
    }
}

function calculateHeatIndex(T, RH) {
    // Simplified Steadman's formula for Heat Index
    return 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094));
}

function calculateDewPoint(T, RH) {
    // Magnus-Tetens approximation
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * T) / (b + T)) + Math.log(RH / 100.0);
    return (b * alpha) / (a - alpha);
}

function formatUptime(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    
    return [
        hours.toString().padStart(2, "0"),
        minutes.toString().padStart(2, "0"),
        seconds.toString().padStart(2, "0")
    ].join(":");
}

// ==============================================================================
// REAL-TIME SEISMOGRAPH VISUALIZER (HTML5 Canvas)
// ==============================================================================
function initSeismograph() {
    const canvas = DOM.seismographCanvas;
    if (!canvas) return;
    
    // Set internal resolution based on devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = (rect.width || 480) * dpr;
    canvas.height = (rect.height || 90) * dpr;
    
    drawSeismograph();
}

function updateSeismographBuffer(vib, isQuake) {
    state.waveBuffer.shift();
    
    // Add jitter if active quake
    let sample = vib;
    if (isQuake) {
        sample += (Math.random() - 0.5) * 0.15;
    } else {
        // Natural micro-vibrations
        sample += (Math.random() - 0.5) * 0.005;
    }
    
    state.waveBuffer.push(Math.max(0, sample));
    drawSeismograph();
}

function drawSeismograph() {
    const canvas = DOM.seismographCanvas;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    // Background Grid lines
    ctx.strokeStyle = "rgba(30, 48, 80, 0.4)";
    ctx.lineWidth = 1;
    for (let y = 15; y < h; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    
    // Threshold line (0.20g)
    // Scale: 0g is at h - 10, 0.5g is at 10
    const threshY = h - 10 - ((CONFIG.QUAKE_THRESHOLD / 0.5) * (h - 20));
    ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Waveform line
    const data = state.waveBuffer;
    const stepX = w / (data.length - 1);
    
    ctx.beginPath();
    ctx.lineWidth = 2.2;
    
    const lastSample = data[data.length - 1];
    const isOverThresh = lastSample >= CONFIG.QUAKE_THRESHOLD;
    
    ctx.strokeStyle = isOverThresh ? "#ef4444" : "#06b6d4";
    ctx.shadowBlur = isOverThresh ? 10 : 5;
    ctx.shadowColor = isOverThresh ? "#ef4444" : "#06b6d4";
    
    for (let i = 0; i < data.length; i++) {
        const val = Math.min(data[i], 0.6);
        const y = h - 10 - ((val / 0.5) * (h - 20));
        const x = i * stepX;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    ctx.shadowBlur = 0; // reset
}

// Resize canvas cleanly when window resizes
window.addEventListener("resize", () => {
    initSeismograph();
});

// ==============================================================================
// SIMULATION ENGINE (FOR TESTING & DEMO)
// ==============================================================================
let simStep = 0;

function getSimulatedData() {
    simStep++;
    const nowUptime = Date.now() % 86400000;
    
    switch (state.simScenario) {
        case "fire":
            return {
                gas: 2750 + Math.floor(Math.sin(simStep * 0.3) * 300),
                gasThreshold: 2000,
                temperature: 41.5 + (Math.sin(simStep * 0.1) * 2),
                humidity: 19.0,
                vibration: 0.012 + (Math.random() * 0.005),
                peakVibration: 0.035,
                quake: false,
                gasAlert: true,
                alarm: true,
                uptime: nowUptime
            };
            
        case "quake":
            const qVib = 0.38 + (Math.abs(Math.sin(simStep * 0.5)) * 0.35);
            return {
                gas: 420 + Math.floor(Math.random() * 30),
                gasThreshold: 2000,
                temperature: 24.2,
                humidity: 48.0,
                vibration: qVib,
                peakVibration: 0.730,
                quake: true,
                gasAlert: false,
                alarm: true,
                uptime: nowUptime
            };
            
        case "both":
            const bVib = 0.42 + (Math.abs(Math.sin(simStep * 0.5)) * 0.3);
            return {
                gas: 3100 + Math.floor(Math.random() * 200),
                gasThreshold: 2000,
                temperature: 44.0,
                humidity: 16.0,
                vibration: bVib,
                peakVibration: 0.810,
                quake: true,
                gasAlert: true,
                alarm: true,
                uptime: nowUptime
            };
            
        case "normal":
        default:
            return {
                gas: 450 + Math.floor(Math.sin(simStep * 0.2) * 50),
                gasThreshold: 2000,
                temperature: 23.5 + (Math.sin(simStep * 0.05) * 1.5),
                humidity: 52.0 + (Math.cos(simStep * 0.05) * 3),
                vibration: 0.014 + (Math.random() * 0.008),
                peakVibration: 0.045,
                quake: false,
                gasAlert: false,
                alarm: false,
                uptime: nowUptime
            };
    }
}

// ==============================================================================
// CSV EXPORT ENGINE (Arabic UTF-8 BOM Supported)
// ==============================================================================
function exportLogsToCSV() {
    if (state.disasterLogs.length === 0) {
        alert("لا توجد أحداث مسجلة لتصديرها حالياً.");
        return;
    }
    
    // Headers in Arabic
    const headers = ["المعرف", "النوع", "تاريخ ووقت البداية", "تاريخ الانتهاء", "المدة (ثانية)", "أقصى شدة", "الوحدة", "البيئة والشروط", "الحالة"];
    
    const rows = state.disasterLogs.map(item => [
        `"${item.id}"`,
        `"${item.type === 'fire' ? 'إنذار حريق / غاز' : 'نشاط زلزالي'}"`,
        `"${item.startTimeFormatted || item.startTime}"`,
        `"${item.endTime ? new Date(item.endTime).toLocaleString('ar-EG') : 'نشط'}"`,
        `"${item.durationSeconds || 0}"`,
        `"${item.peakIntensity}"`,
        `"${item.peakUnit}"`,
        `"${item.conditions || ''}"`,
        `"${item.status === 'active' ? 'نشط' : 'منتهي'}"`
    ]);
    
    // UTF-8 Byte Order Mark for Excel Arabic compatibility
    const BOM = "\uFEFF";
    const csvContent = BOM + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `سجل_كوارث_حارس_الغابة_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==============================================================================
// EVENT LISTENERS & USER INTERACTIONS
// ==============================================================================
function setupEventListeners() {
    // Sound Toggle
    DOM.soundToggleBtn.addEventListener("click", () => {
        settings.soundEnabled = !settings.soundEnabled;
        localStorage.setItem("fg_sound_enabled", settings.soundEnabled);
        updateSoundButtonUI();
        if (!settings.soundEnabled) {
            stopEmergencyAlarm();
        } else {
            getAudioContext();
        }
    });
    
    // Silence button in top bar
    DOM.silenceBtn.addEventListener("click", () => {
        stopEmergencyAlarm();
    });
    
    // Simulation Mode Toggle
    DOM.simToggleBtn.addEventListener("click", () => {
        state.isSimulation = !state.isSimulation;
        if (state.isSimulation) {
            DOM.simToggleBtn.classList.add("active");
            DOM.simToggleBtn.querySelector(".ctrl-label").textContent = "وضع المحاكاة: مفعّل";
            DOM.simControlsBar.classList.remove("hidden");
            setConnectionState(true);
        } else {
            DOM.simToggleBtn.classList.remove("active");
            DOM.simToggleBtn.querySelector(".ctrl-label").textContent = "وضع المحاكاة: معطّل";
            DOM.simControlsBar.classList.add("hidden");
            fetchSensorData();
        }
    });
    
    // Simulation Scenario Buttons
    document.querySelectorAll(".sim-action-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            state.simScenario = btn.dataset.sim;
        });
    });
    
    // Log Filters
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.currentFilter = btn.dataset.filter;
            renderDisasterLogs();
        });
    });
    
    // Export CSV
    DOM.exportCsvBtn.addEventListener("click", exportLogsToCSV);
    
    // Clear Logs
    DOM.clearLogBtn.addEventListener("click", () => {
        if (confirm("هل أنت متأكد من مسح كافة سجلات الكوارث والإنذارات؟")) {
            state.disasterLogs = [];
            state.activeFireEvent = null;
            state.activeQuakeEvent = null;
            saveDisasterLogs();
            renderDisasterLogs();
        }
    });
    
    // Trigger test event from empty state
    DOM.triggerTestEventBtn.addEventListener("click", () => {
        const testEvent = {
            id: `TEST-${Date.now().toString(36).toUpperCase()}`,
            type: Math.random() > 0.5 ? "fire" : "quake",
            title: "حدث اختباري يدوي للتجربة",
            startTime: new Date().toISOString(),
            startTimeFormatted: new Date().toLocaleString("ar-EG"),
            endTime: new Date().toISOString(),
            durationSeconds: 12,
            peakIntensity: "2450",
            peakUnit: "ADC",
            conditions: "اختبار يدوي من لوحة التحكم",
            status: "resolved"
        };
        state.disasterLogs.unshift(testEvent);
        saveDisasterLogs();
        renderDisasterLogs();
    });
    
    // Settings Modal
    DOM.settingsBtn.addEventListener("click", () => {
        DOM.settingsModal.classList.remove("hidden");
    });
    
    DOM.closeModalBtn.addEventListener("click", () => {
        DOM.settingsModal.classList.add("hidden");
    });
    
    DOM.settingsModal.addEventListener("click", (e) => {
        if (e.target === DOM.settingsModal) {
            DOM.settingsModal.classList.add("hidden");
        }
    });
    
    DOM.saveSettingsBtn.addEventListener("click", () => {
        const newIp = DOM.ipInput.value.trim() || CONFIG.DEFAULT_IP;
        const newRate = parseInt(DOM.pollRateInput.value, 10) || CONFIG.DEFAULT_POLL_INTERVAL;
        
        settings.esp32Ip = newIp;
        settings.pollInterval = Math.max(100, newRate);
        
        localStorage.setItem("fg_esp32_ip", settings.esp32Ip);
        localStorage.setItem("fg_poll_interval", settings.pollInterval);
        
        DOM.diagIp.textContent = settings.esp32Ip;
        DOM.settingsModal.classList.add("hidden");
        
        startPolling();
    });
    
    DOM.resetSettingsBtn.addEventListener("click", () => {
        DOM.ipInput.value = CONFIG.DEFAULT_IP;
        DOM.pollRateInput.value = CONFIG.DEFAULT_POLL_INTERVAL;
    });
    
    // Audio siren test buttons in modal
    DOM.testFireSirenBtn.addEventListener("click", () => {
        getAudioContext();
        startEmergencyAlarm("fire");
        setTimeout(stopEmergencyAlarm, 2500);
    });
    
    DOM.testQuakeSirenBtn.addEventListener("click", () => {
        getAudioContext();
        startEmergencyAlarm("quake");
        setTimeout(stopEmergencyAlarm, 2500);
    });
    
    // Unlock Audio Context on any user interaction
    document.addEventListener("click", () => {
        if (settings.soundEnabled && !state.audioCtx) {
            getAudioContext();
        }
    }, { once: true });
}

function updateSoundButtonUI() {
    if (settings.soundEnabled) {
        DOM.soundToggleBtn.className = "ctrl-btn active-state";
        DOM.soundToggleBtn.querySelector(".ctrl-icon").textContent = "🔊";
        DOM.soundToggleBtn.querySelector(".ctrl-label").textContent = "الصوت: مفعّل";
    } else {
        DOM.soundToggleBtn.className = "ctrl-btn muted-state";
        DOM.soundToggleBtn.querySelector(".ctrl-icon").textContent = "🔇";
        DOM.soundToggleBtn.querySelector(".ctrl-label").textContent = "الصوت: صامت";
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Start app
document.addEventListener("DOMContentLoaded", init);
