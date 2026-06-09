/**
 * 香港長者交通優惠助手 - app.js (Point-to-Point Transit Engine)
 * Version: 20260605-fixed-zero-coordinates
 */
console.log("💎 [APP] app.js v20260605-fixed-zero-coordinates is LOADING...");

// --- 1. 全局數據存儲 ---
let GLOBAL_BUS = [];
let GLOBAL_GMB = [];
let GLOBAL_TRAM = [];
let GLOBAL_MTR_STATIONS = [];
let GLOBAL_MTR_EXITS = [];
let GLOBAL_MTR_FARES = [];
let GLOBAL_MTR_BUS_ROUTES = [];
let GLOBAL_MTR_BUS_FARES = [];
let GLOBAL_MTR_BUS_STOPS = [];

let currentRoutes = [];

// 哈弗辛公式 (Haversine Formula) 計算兩點間的真實球面距離 (單位：公里)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球半徑 (KM)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// 計算路徑總距離 (單位：公里)
function calculatePathDistance(coords) {
    let total = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        total += calculateHaversineDistance(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0]);
    }
    return total;
}

// --- 2. 應用程序初始化 ---
// 全局錯誤捕獲
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error(`🚨 [GLOBAL ERROR] ${msg} at ${lineNo}:${columnNo}`);
    return false;
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("DOM loading, waiting for DOMContentLoaded");
        initApp();
    });
} else {
    console.log("DOM already loaded, running initApp immediately");
    initApp();
}

let isAppInitialized = false;

async function initApp() {
    if (isAppInitialized) {
        console.log("⚠️ [INIT] App already initialized, skipping...");
        return;
    }
    console.log("🚀 [INIT] initApp START (CSV Mode)...");
    isAppInitialized = true;
    
    // 先綁定事件監聽器，確保 UI 即使數據沒加載完也能有反應
    console.log("🛠️ [INIT] Step 1: Setting up UI components...");
    try {
        setupEventListeners();
        console.log("✅ [INIT] Event listeners attached");
    } catch (e) {
        console.error("❌ [INIT ERROR] setupEventListeners failed:", e);
    }

    try {
        initAutocomplete();
        console.log("✅ [INIT] Autocomplete ready");
    } catch (e) {
        console.error("❌ [INIT ERROR] initAutocomplete failed:", e);
    }

    try {
        loadHomeStation();
        console.log("✅ [INIT] Home station loaded");
    } catch (e) {
        console.error("❌ [INIT ERROR] loadHomeStation failed:", e);
    }

    // 2. 加載數據 (Data Loading)
    try {
        console.log("📥 [INIT] Step 2: Fetching CSV files...");
        
        const fetchCSV = async (url) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
            return res.text();
        };

        const [mtrStationsRaw, mtrExitsRaw, mtrFaresRaw, mtrBusRoutesRaw, mtrBusFaresRaw, mtrBusStopsRaw] = await Promise.all([
            fetchCSV('mtr_lines_and_stations.csv'),
            fetchCSV('mtr_exits.csv'),
            fetchCSV('mtr_lines_fares.csv'),
            fetchCSV('mtr_bus_routes.csv'),
            fetchCSV('mtr_bus_fares.csv'),
            fetchCSV('mtr_bus_stops.csv')
        ]);

        console.log("📄 [INIT] Step 3: Parsing CSV content...");
        GLOBAL_MTR_STATIONS = parseCSV(mtrStationsRaw);
        GLOBAL_MTR_EXITS = parseCSV(mtrExitsRaw);
        GLOBAL_MTR_FARES = parseCSV(mtrFaresRaw);
        GLOBAL_MTR_BUS_ROUTES = parseCSV(mtrBusRoutesRaw);
        GLOBAL_MTR_BUS_FARES = parseCSV(mtrBusFaresRaw);
        GLOBAL_MTR_BUS_STOPS = parseCSV(mtrBusStopsRaw);

        console.log("🔄 [INIT] Step 4: Building bus data...");
        processMtrBusData();

        console.log("✅ [INIT] Data engine ready!");
        console.log(`- Stations: ${GLOBAL_MTR_STATIONS.length}`);
        console.log(`- Exits: ${GLOBAL_MTR_EXITS.length}`);
        console.log(`- MTR Fare records: ${GLOBAL_MTR_FARES.length}`);
        console.log(`- Bus Routes built: ${GLOBAL_BUS.length}`);
    } catch (error) {
        console.error("❌ [INIT ERROR] Data loading failed:", error);
    }

    console.log("🏁 [INIT] initApp FINISHED");
}

/**
 * 從 CSV 數據構建巴士路由對象 (取代原有的 JSON 加載)
 */
function processMtrBusData() {
    console.log("🔄 正在從 CSV 構建巴士路由數據...");
    
    // 1. 按順序整理站點
    const sortedStops = [...GLOBAL_MTR_BUS_STOPS].sort((a, b) => {
        if (a.ROUTE_ID !== b.ROUTE_ID) return a.ROUTE_ID.localeCompare(b.ROUTE_ID);
        if (a.DIRECTION !== b.DIRECTION) return a.DIRECTION.localeCompare(b.DIRECTION);
        return parseInt(a.STATION_SEQNO) - parseInt(b.STATION_SEQNO);
    });

    // 2. 按 路線+方向 分組
    const grouped = {};
    sortedStops.forEach(stop => {
        const key = `${stop.ROUTE_ID}_${stop.DIRECTION}`;
        const lat = parseFloat(stop.STATION_LATITUDE);
        const lon = parseFloat(stop.STATION_LONGITUDE);
        
        if (!grouped[key]) {
            const routeInfo = GLOBAL_MTR_BUS_ROUTES.find(r => r.ROUTE_ID === stop.ROUTE_ID) || {};
            grouped[key] = {
                id: stop.ROUTE_ID,
                direction: stop.DIRECTION,
                nameZH: routeInfo.ROUTE_NAME_CHI || stop.ROUTE_ID,
                stops: [],
                coords: [],
                fare: 0
            };
        }
        grouped[key].stops.push({
            name: stop.STATION_NAME_CHI,
            lat: lat,
            lon: lon
        });
        if (!isNaN(lat) && !isNaN(lon)) {
            grouped[key].coords.push([lon, lat]);
        }
    });

    // 3. 填充票價並構建最終的 GLOBAL_BUS 數組
    const finalRoutes = [];
    Object.values(grouped).forEach(route => {
        const fareInfo = GLOBAL_MTR_BUS_FARES.find(f => f.ROUTE_ID === route.id);
        const adultFare = fareInfo ? parseFloat(fareInfo.FARE_OCTO_ADULT) : 7.0; // 默認票價
        
        // 估算行車時間: 2分鐘/公里 + 1分鐘/站
        const distance = calculatePathDistance(route.coords);
        const estimatedTime = Math.round(distance * 3) + route.stops.length;

        finalRoutes.push({
            type: 'Feature',
            properties: {
                ROUTE_NAME: route.id,
                START_STATION: route.stops[0].name || "起點",
                END_STATION: route.stops[route.stops.length - 1].name || "終點",
                STOPS: route.stops, // 現在是對象數組
                FULL_FARE: adultFare,
                TRAVEL_TIME: Math.max(15, estimatedTime)
            },
            geometry: {
                type: 'LineString',
                coordinates: route.coords
            }
        });
    });

    GLOBAL_BUS = finalRoutes;
    GLOBAL_GMB = []; // 清空，因為不再使用 JSON
    GLOBAL_TRAM = []; // 清空
}

/**
 * CSV 解析函數 - 使用 PapaParse (如果可用) 或後備解析器
 */
function parseCSV(text) {
    if (!text) return [];
    
    let data = [];
    // 如果 PapaParse 可用，優先使用
    if (typeof Papa !== 'undefined') {
        const results = Papa.parse(text.trim(), {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false,
            transformHeader: h => h.replace(/["]/g, '').trim()
        });
        data = results.data;
    } else {
        // 後備解析器 (手動實現)
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.replace(/["]/g, '').trim().replace(/^\ufeff/, ''));
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = [];
            let current = '';
            let inQuotes = false;
            for (let char of line) {
                if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else current += char;
            }
            values.push(current.trim());

            const obj = {};
            headers.forEach((header, index) => {
                let val = values[index] || "";
                obj[header] = val.replace(/["]/g, '').trim();
            });
            data.push(obj);
        }
    }

    // 統一處理：去除所有鍵名和值的引號並處理數值
    return data.map(row => { 
        const cleanRow = {}; 
        for (let key in row) { 
            const cleanKey = key.replace(/["]/g, '').trim(); 
            let cleanVal = row[key]; 
            
            if (typeof cleanVal === 'string') { 
                cleanVal = cleanVal.replace(/["]/g, '').trim(); 
            } 
    
            // 精確處理經緯度欄位，確保轉為數字，並使用香港中心點作為無效值的備援
            const lowerKey = cleanKey.toLowerCase();
            if (['lat', 'latitude'].includes(lowerKey)) { 
                const num = parseFloat(cleanVal); 
                cleanRow[cleanKey] = (isNaN(num) || num === 0) ? 22.3193 : num; 
            } else if (['lng', 'longitude', 'lon'].includes(lowerKey)) {
                const num = parseFloat(cleanVal); 
                cleanRow[cleanKey] = (isNaN(num) || num === 0) ? 114.1694 : num; 
            } else { 
                cleanRow[cleanKey] = cleanVal; 
            } 
        } 
        return cleanRow; 
    });
}

// --- 3. 核心地理算法 ---

// 輔助函數：從 API 結果中安全提取座標 (支援 WGS84 與 HK80)
function extractCoords(result) {
    if (!result) return null;

    console.log('🔍 [EXTRACT] 正在解析地點物件:', result);

    // 嘗試從不同屬性路徑提取
    const tryPaths = (obj) => {
        if (!obj) return null;
        
        // 1. 檢查直接屬性 (x, y, lat, lng, latitude, longitude)
        let lat = obj.lat || obj.latitude || obj.y;
        let lng = obj.lng || obj.longitude || obj.long || obj.x;

        if (lat && lng) {
            console.log(`📍 [EXTRACT] 找到座標屬性: lat/y=${lat}, lng/x=${lng}`);
            const converted = convertCoords(parseFloat(lng), parseFloat(lat));
            if (converted.lat !== 0 && converted.lng !== 0) return converted;
        }
        return null;
    };

    // 1. 優先嘗試直接提取
    let coords = tryPaths(result);

    // 2. 嘗試從 geo 屬性提取 (政府 API 常用結構)
    if (!coords && result.geo) {
        console.log('🔎 [EXTRACT] 嘗試從 .geo 屬性提取...');
        coords = tryPaths(result.geo);
    }

    // 3. 嘗試從 geometry 屬性提取 (標準 GeoJSON 結構)
    if (!coords && result.geometry) {
        console.log('🔎 [EXTRACT] 嘗試從 .geometry 屬性提取...');
        if (Array.isArray(result.geometry.coordinates)) {
            // GeoJSON 格式為 [lng, lat]
            coords = convertCoords(result.geometry.coordinates[0], result.geometry.coordinates[1]);
        } else {
            coords = tryPaths(result.geometry);
        }
    }

    if (coords) {
        console.log(`✅ [EXTRACT] 成功提取座標: ${coords.lat}, ${coords.lng}`);
        return coords;
    }

    console.warn('⚠️ [EXTRACT] 無法在該物件中找到任何有效的座標數據');
    return null;
}

/**
 * 輔助函數：轉換座標 (HK80 -> WGS84 或直接返回 WGS84)
 */
function convertCoords(x, y) {
    let lat, lng;
    // 判斷是 WGS84 還是 HK80
    // WGS84: lat ~22, lng ~114
    // HK80: x ~800000, y ~800000
    if (y < 30 && x > 100) {
        lat = y;
        lng = x;
    } else {
        // HK80 轉換 (線性近似)
        lat = 22.3121 + (y - 819062) / 110574;
        lng = 114.1733 + (x - 835432) / 102182;
        console.log(`🔄 [GEO] Converted HK80 (${x}, ${y}) to approx WGS84 (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
    }
    return { lat, lng };
}

/**
 * 政府地點搜尋 API (Geocoding)
 * 支援大廈名、屋苑名及地標搜尋
 */
async function geocodeLocation(text, inputElement = null) {
    if (!text) return null;
    
    // 0. 如果輸入框已經有選中的座標，且座標有效 (非 0)
    console.log(`🔍 [GEO] Checking pre-selected coordinates for "${text}"...`);
    if (inputElement) {
        console.log(`🔍 [GEO] Input element dataset:`, { 
            lat: inputElement.dataset.lat, 
            lng: inputElement.dataset.lng, 
            selectedName: inputElement.dataset.selectedName 
        });
    }
    
    // 改進的匹配邏輯：檢查是否有選中的座標，並且名稱匹配（允許部分匹配）
    const selectedName = inputElement?.dataset?.selectedName;
    
    console.log(`🔍 [GEO] Checking dataset: lat="${inputElement?.dataset?.lat}", lng="${inputElement?.dataset?.lng}", selectedName="${selectedName}"`);
    
    // 檢查是否有有效的座標（非空、非 NaN、非 0）
    const hasValidSelectedCoordinates = () => {
        if (!inputElement || !inputElement.dataset.lat || !inputElement.dataset.lng) {
            return false;
        }
        
        const latStr = inputElement.dataset.lat;
        const lngStr = inputElement.dataset.lng;
        
        // 檢查是否為空字符串
        if (latStr.trim() === "" || lngStr.trim() === "") {
            return false;
        }
        
        const dLat = parseFloat(latStr);
        const dLng = parseFloat(lngStr);
        
        // 檢查是否為有效數字且非 0
        return !isNaN(dLat) && !isNaN(dLng) && dLat !== 0 && dLng !== 0;
    };
    
    if (hasValidSelectedCoordinates()) {
        // 解析座標
        const dLat = parseFloat(inputElement.dataset.lat);
        const dLng = parseFloat(inputElement.dataset.lng);
        
        console.log(`🔍 [GEO] Valid coordinates found: ${dLat}, ${dLng}`);
        
        // 座標有效，檢查名稱匹配（更寬容的匹配）
        const isNameMatch = selectedName && (
            selectedName === text || 
            selectedName.includes(text) || 
            text.includes(selectedName) ||
            // 提取主要名稱部分進行匹配
            selectedName.split(',')[0].trim().includes(text) ||
            text.includes(selectedName.split(',')[0].trim())
        );
        
        if (isNameMatch) {
            // 再次檢查座標是否為 0 - 這是額外的安全檢查
            if (dLat === 0 && dLng === 0) {
                console.error(`❌ [GEO] Pre-selected coordinates are (0, 0) for "${text}" - rejecting and falling back to API`);
                console.error(`❌ [GEO] Dataset values: lat="${inputElement.dataset.lat}", lng="${inputElement.dataset.lng}"`);
                // 清除無效的 dataset
                delete inputElement.dataset.lat;
                delete inputElement.dataset.lng;
                delete inputElement.dataset.selectedName;
            } else {
                console.log(`🎯 [GEO] Using pre-selected coordinates for "${text}":`, {
                    text: text,
                    selectedName: selectedName,
                    lat: dLat,
                    lng: dLng,
                    dataset: {
                        lat: inputElement.dataset.lat,
                        lng: inputElement.dataset.lng,
                        selectedName: inputElement.dataset.selectedName
                    }
                });
                return { lat: dLat, lng: dLng, name: text };
            }
        } else {
            console.log(`⚠️ [GEO] Name mismatch:`, {
                selectedName: selectedName,
                text: text,
                lat: dLat,
                lng: dLng
            });
            console.warn(`⚠️ [GEO] Coordinates valid but name mismatch, falling back to API...`);
        }
    } else {
        console.log(`⚠️ [GEO] No valid pre-selected coordinates found.`);
    }

    console.log(`🔍 [GEO] Geocoding "${text}"...`);
    
    // 1. 先在本地 MTR 站點中查找 (精確匹配)
    const cleanText = text.trim().toLowerCase().replace(/站$/, '');
    
    let mtrMatch = GLOBAL_MTR_STATIONS.find(s => {
        const zh = (s['Chinese Name'] || "").replace(/站$/, '');
        const en = (s['English Name'] || "").toLowerCase().replace(/\s+station$/, '');
        return zh === cleanText || en === cleanText;
    });

    if (!mtrMatch) {
        mtrMatch = GLOBAL_MTR_STATIONS.find(s => {
            const zh = (s['Chinese Name'] || "").replace(/站$/, '');
            return cleanText.includes(zh) && zh.length >= 2;
        });
    }

    if (mtrMatch) {
        console.log(`✅ [GEO] Found MTR station match: ${mtrMatch['Chinese Name']}`);
        const stationExits = GLOBAL_MTR_EXITS.filter(e => e.Station_CHI === mtrMatch['Chinese Name']);
        if (stationExits.length > 0) {
            return {
                lat: parseFloat(stationExits[0].Latitude),
                lng: parseFloat(stationExits[0].Longitude),
                name: mtrMatch['Chinese Name'] + "站"
            };
        }
    }

    // 2. HK Geodata API
    const tryApi = async (query) => {
        try {
            const url = `https://www.map.gov.hk/gs/api/v1.0.0/locationSearch?q=${encodeURIComponent(query)}`;
            console.log(`📡 [GEO] API Request: ${url}`);
            
            const response = await fetch(url, {
                headers: { 'User-Agent': 'MyBusRouteApp/1.0' }
            });
            console.log(`📡 [GEO] API Status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`📡 [GEO] HK Geodata API Response for "${query}":`, data);
                
                if (data && data.length > 0) {
                    const result = data[0];
                    const coords = convertCoords(parseFloat(result.x), parseFloat(result.y));
                    const lat = coords.lat;
                    const lng = coords.lng;
                    
                    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                        console.log(`✅ [GEO] API found valid coordinates: ${lat}, ${lng} for "${result.nameZH || result.nameEN}"`);
                        return {
                            lat: lat,
                            lng: lng,
                            name: result.nameZH || result.nameEN || query
                        };
                    } else {
                        console.error(`❌ [GEO] Geodata result for "${query}" is invalid:`, result);
                    }
                } else {
                    console.warn(`⚠️ [GEO] Geodata API returned empty results for "${query}"`);
                }
            } else {
                const errorText = await response.text();
                console.error(`❌ [GEO] API Error Response:`, errorText);
            }
        } catch (e) {
            console.error(`❌ [GEO] Fetch Exception for "${query}":`, e);
        }
        return null;
    };

    let geoResult = await tryApi(text);
    
    // 2b. 嘗試帶有 "香港" 前綴
    if (!geoResult && !text.includes("香港")) {
        console.log(`🔍 [GEO] Retrying with "香港" prefix...`);
        geoResult = await tryApi("香港 " + text);
    }
    
    // 2c. 嘗試簡化名稱
    if (!geoResult) {
        const simpleText = text.replace(/(大廈|中心|廣場|商場|大屋苑|屋苑|邨|站)$/, "");
        if (simpleText !== text && simpleText.length >= 2) {
            console.log(`🔍 [GEO] Retrying with simplified name: "${simpleText}"...`);
            geoResult = await tryApi(simpleText);
        }
    }
    
    if (geoResult) return geoResult;

    // 3. 備用方案: 模糊匹配本地數據 (Bus Stops)
    console.log("⚠️ [GEO] API failed, trying fuzzy match in bus data...");
    const busMatch = GLOBAL_MTR_BUS_STOPS.find(s => 
        (s.STATION_NAME_CHI && (s.STATION_NAME_CHI.includes(text) || text.includes(s.STATION_NAME_CHI))) || 
        (s.STATION_NAME_ENG && (s.STATION_NAME_ENG.toLowerCase().includes(text.toLowerCase()) || text.toLowerCase().includes(s.STATION_NAME_ENG.toLowerCase())))
    );

    if (busMatch) {
        const bLat = parseFloat(busMatch.STATION_LATITUDE);
        const bLng = parseFloat(busMatch.STATION_LONGITUDE);
        if (bLat !== 0 && bLng !== 0) {
            console.log(`✅ [GEO] Found fuzzy Bus stop match: ${busMatch.STATION_NAME_CHI} (${bLat}, ${bLng})`);
            return { lat: bLat, lng: bLng, name: busMatch.STATION_NAME_CHI };
        }
    }

    console.warn(`❌ [GEO] No location found for "${text}"`);
    alert(`無法獲取地點「${text}」的座標，請檢查網路或地名是否正確。`);
    return null;
}

/**
 * 實現輸入框自動完成 (Autocomplete)
 * 使用政府 API 獲取地點建議
 */
function initAutocomplete() {
    console.log("🔍 [INIT] Initializing autocomplete...");
    const inputs = [
        { id: 'fromSearch', box: 'fromSuggestions' },
        { id: 'toSearch', box: 'toSuggestions' }
    ];

    inputs.forEach(item => {
        const input = document.getElementById(item.id);
        const box = document.getElementById(item.box);
        let timeout = null;

        if (!input || !box) {
            console.warn(`⚠️ [INIT] Autocomplete input/box not found for ${item.id}`);
            return;
        input.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            // 1. Hide box early if input is short
            if (query.length < 2) {
                box.classList.add('hidden');
                return;
            }
        }
        const clearDataset = () => {
            delete input.dataset.lat;
            delete input.dataset.lng;
            delete input.dataset.selectedName;
            console.log(`🧹 [AUTO] Dataset cleared for ${item.id}`);
        };

        input.addEventListener('input', () => {
            clearDataset();
            clearTimeout(timeout);
            const text = input.value.trim();
            if (text.length < 2) {
                box.classList.add('hidden');
                return;
            }

            timeout = setTimeout(async () => { 
                const text = input.value.trim(); 
                if (text.length < 2) { box.classList.add('hidden'); return; } 
            
                try { 
                    const url = `https://www.map.gov.hk/gs/api/v1.0.0/locationSearch?q=${encodeURIComponent(text)}`; 
                    const response = await fetch(url, { headers: { 'User-Agent': 'MyBusRouteApp/1.0' } }); 
                    const data = await response.json(); 
            
                    if (data && data.length > 0) { 
                        console.log(`🔍 [AUTO] API returned ${data.length} results for "${text}":`, data);
                        
                        // 過濾掉沒有 x, y 座標的結果
                        const validResults = data.filter(res => {
                            const x = parseFloat(res.x);
                            const y = parseFloat(res.y);
                            return !isNaN(x) && !isNaN(y) && x !== 0 && y !== 0;
                        }).slice(0, 10); // 取前 10 個結果
                        
                        if (validResults.length === 0) {
                            box.classList.add('hidden');
                            return;
                        }
                        
                        box.innerHTML = validResults.map(res => {
                            const coords = convertCoords(parseFloat(res.x), parseFloat(res.y));
                            const lat = coords.lat;
                            const lon = coords.lng;
                            const displayName = (res.nameZH || res.nameEN || "").replace(/"/g, '&quot;');
                            const address = (res.addressZH || res.addressEN || "").replace(/"/g, '&quot;');
                            
                            let displayText = res.nameZH || res.nameEN;
                            if (address) {
                                displayText += ` <span style="font-size: 0.8em; color: #666;">(${address})</span>`;
                            }
                            
                            return ` 
                                <div class="suggestion-item" 
                                     data-lat="${lat}" 
                                     data-lng="${lon}" 
                                     data-name="${displayName}" 
                                     style="cursor:pointer; padding:8px; border-bottom:1px solid #eee;"> 
                                    ${displayText} 
                                </div> 
                            `;
                        }).join(''); 
                        box.classList.remove('hidden'); 
            
                        box.querySelectorAll('.suggestion-item').forEach(s => { 
                            s.onclick = function() { 
                                const lat = this.getAttribute('data-lat'); 
                                const lng = this.getAttribute('data-lng'); 
                                const name = this.getAttribute('data-name'); 

                                const parsedLat = parseFloat(lat);
                                const parsedLng = parseFloat(lng);
                                
                                if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat === 0 || parsedLng === 0) {
                                    input.value = name;
                                    box.classList.add('hidden');
                                    return;
                                }

                                input.value = name; 
                                input.dataset.lat = parsedLat.toString(); 
                                input.dataset.lng = parsedLng.toString(); 
                                input.dataset.selectedName = name;
                                
                                box.classList.add('hidden'); 
                            }; 
                        }); 
                    } else {
                        box.classList.add('hidden');
                    }
                } catch (e) { 
                    console.error("❌ [AUTO] Search error:", e); 
                    box.classList.add('hidden');
                } 
            }, 400); 
        });
         // Add this at the end of your script to close dropdowns when clicking outside
        document.addEventListener('pointerdown', (e) => {
            // Check if the click is outside the inputs or suggestion boxes
            const isClickInside = e.target.closest('.input-class') || e.target.closest('.suggestion-box');
            if (!isClickInside) {
                document.querySelectorAll('.suggestion-box').forEach(box => box.classList.add('hidden'));
            }
        });
    });
}

// --- 4. 搜尋與路徑計算 ---

// 標準化港鐵站名，便於匹配 (去除 "Station" 或 "站" 字眼，統一大小寫，處理空格)
function normalizeStationName(name) {
    if (!name) return "";
    // 同時處理英文 "Station" 和中文 "站"
    let n = name.toString()
                .replace(/\s*Station$/i, '') // 容錯：有無空格都刪除 Station
                .replace(/站$/, '')           // 刪除結尾的 "站"
                .replace(/[']/g, '')         // 刪除單引號 (例如 Prince's Edward)
                .replace(/\s+/g, '')         // 刪除所有中間空格，確保 "Hong Kong" 和 "HongKong" 匹配
                .trim()
                .toLowerCase();
    
    // 簡單的繁簡轉換 (針對常見差異，若有需要可擴充)
    const map = {
        '湾': '灣', '东': '東', '西': '西', '南': '南', '北': '北',
        '车': '車', '线': '線', '桥': '橋', '园': '園', '岭': '嶺',
        '国': '國', '际': '際', '会': '會', '展': '展', '览': '覽',
        '龙': '龍', '启': '啟', '德': '德', '兴': '興', '复': '復',
        '华': '華', '宝': '寶', '国': '國', '台': '臺', '广': '廣'
    };
    Object.keys(map).forEach(key => {
        n = n.replace(new RegExp(key, 'g'), map[key]);
    });
    return n;
}

async function runComparison() {
    console.log("🚀 [DEBUG] runComparison START");
    
    // 檢查數據是否已加載
    if (GLOBAL_MTR_STATIONS.length === 0 || GLOBAL_MTR_FARES.length === 0) {
        console.warn("⚠️ 數據尚未完全加載，正在嘗試重新加載...");
        await initApp();
    }

    const fromInput = document.getElementById('fromSearch');
    const toInput = document.getElementById('toSearch');
    const calculateBtn = document.getElementById('calculateBtn');

    if (!fromInput || !toInput || !calculateBtn) {
        console.error("❌ [DEBUG] Required DOM elements missing:", { fromInput, toInput, calculateBtn });
        return;
    }

    const fromText = fromInput.value.trim();
    const toText = toInput.value.trim();

    console.log(`📍 Inputs: From="${fromText}", To="${toText}"`);

    if (!fromText || !toText) {
        alert("請輸入起點及終點名稱");
        return;
    }

    const originalBtnText = calculateBtn.innerText;
    calculateBtn.innerText = "搜尋中...";
    calculateBtn.disabled = true;

    try {
        console.log(`🔍 [STEP 1] Starting geocoding...`);
        const [originData, destData] = await Promise.all([
            geocodeLocation(fromText, fromInput),
            geocodeLocation(toText, toInput)
        ]);

        if (!originData) {
            console.error("❌ [GEO] Origin geocoding failed for:", fromText);
        }
        if (!destData) {
            console.error("❌ [GEO] Destination geocoding failed for:", toText);
        }

        if (!originData || !destData) {
            // geocodeLocation 已經彈出過詳細 alert，這裡只需停止執行
            return;
        }

        console.log("📍 [GEO] Success!", { 
            origin: { name: originData.name, lat: originData.lat, lng: originData.lng },
            dest: { name: destData.name, lat: destData.lat, lng: destData.lng }
        });

        // 檢查起點和終點是否太近
        const directDist = calculateHaversineDistance(originData.lat, originData.lng, destData.lat, destData.lng);
        console.log(`📏 直線距離: ${directDist.toFixed(3)} km`);

        if (directDist < 0.05 && fromText !== toText) {
            console.warn("⚠️ [DEBUG] 起點和終點座標幾乎相同，但輸入名稱不同。這可能是地理定位錯誤。");
        }

        console.log("🔍 [STEP 2] Finding transport nodes...");
        
        const getNearbyMtrStations = (lat, lng, radiusKm = 5.0) => {
            const stations = [];
            const seen = new Set();
            
            // 1. 搜尋半徑內的車站
            GLOBAL_MTR_EXITS.forEach(exit => {
                const eLat = parseFloat(exit.Latitude);
                const eLng = parseFloat(exit.Longitude);
                if (isNaN(eLat) || isNaN(eLng)) return;

                const dist = calculateHaversineDistance(lat, lng, eLat, eLng);
                if (dist <= radiusKm && !seen.has(exit.Station_CHI)) {
                    stations.push({
                        nameZH: exit.Station_CHI,
                        nameEN: exit.Station_ENG,
                        lat: eLat,
                        lng: eLng,
                        exit: exit.Exit,
                        dist: dist,
                        walkTime: Math.max(2, Math.round(dist * 12))
                    });
                    seen.add(exit.Station_CHI);
                }
            });

            // 2. 如果沒找到車站，強行找最近的一個 (不設限距離，確保一定有結果)
            if (stations.length === 0 && GLOBAL_MTR_EXITS.length > 0) {
                let nearest = null;
                let minDist = Infinity; 
                GLOBAL_MTR_EXITS.forEach(exit => {
                    const eLat = parseFloat(exit.Latitude);
                    const eLng = parseFloat(exit.Longitude);
                    if (isNaN(eLat) || isNaN(eLng)) return;

                    const dist = calculateHaversineDistance(lat, lng, eLat, eLng);
                    if (dist < minDist) {
                        minDist = dist;
                        nearest = {
                            nameZH: exit.Station_CHI,
                            nameEN: exit.Station_ENG,
                            lat: eLat,
                            lng: eLng,
                            exit: exit.Exit,
                            dist: dist,
                            walkTime: Math.max(2, Math.round(dist * 12))
                        };
                    }
                });
                if (nearest) stations.push(nearest);
            }

            return stations.sort((a, b) => a.dist - b.dist);
        };

        const originMtrStations = getNearbyMtrStations(originData.lat, originData.lng, 2.0);
        const destMtrStations = getNearbyMtrStations(destData.lat, destData.lng, 2.0);

        console.log(`📍 Nearby MTR: Origin=${originMtrStations.length}, Dest=${destMtrStations.length}`);

        const results = [];

        // --- A. 港鐵路徑計算 ---
        console.log("🚇 [STEP 3] Checking MTR routes...");
        let mtrMatchFailures = [];
        for (const mtrO of originMtrStations) {
            for (const mtrD of destMtrStations) {
                if (mtrO.nameZH === mtrD.nameZH) continue;

                const normO = normalizeStationName(mtrO.nameEN);
                const normD = normalizeStationName(mtrD.nameEN);

                // 尋找票價，增加對不同標題名稱的容錯性
                const fareData = GLOBAL_MTR_FARES.find(f => {
                    const src = normalizeStationName(f.SRC_STATION_NAME || f.SRC_STATION || "");
                    const dest = normalizeStationName(f.DEST_STATION_NAME || f.DEST_STATION || "");
                    
                    // 優先完全匹配，其次模糊匹配
                    return (src === normO || normO.includes(src) || src.includes(normO)) && 
                           (dest === normD || normD.includes(dest) || dest.includes(normD));
                });

                if (fareData) {
                    const adultFare = parseFloat(fareData.OCT_ADT_FARE || fareData.OCT_STD_FARE || fareData.FARE || 0);
                    const concessionFare = parseFloat(fareData.OCT_JOYYOU_SIXTY_FARE || fareData.OCT_CON_ELDERLY_FARE) || 2.0;
                    
                    const mtrDist = calculateHaversineDistance(mtrO.lat, mtrO.lng, mtrD.lat, mtrD.lng);
                    const travelTime = Math.max(5, Math.round(mtrDist * 1.5) + 5);

                    results.push({
                        type: 'MTR',
                        icon: '🚇',
                        title: `港鐵 (${mtrO.nameZH} 站 → ${mtrD.nameZH} 站)`,
                        duration: travelTime + mtrO.walkTime + mtrD.walkTime,
                        adultFare: adultFare,
                        concessionFare: concessionFare,
                        savings: Math.max(0, adultFare - concessionFare),
                        walkTime: mtrO.walkTime + mtrD.walkTime,
                        steps: `
                            <div class="route-step"><span class="step-icon">🚶</span> <strong>起點</strong>: 步行 ${mtrO.walkTime} 分鐘</div>
                            <div class="route-step"><span class="step-icon">🚉</span> <strong>進入</strong>: ${mtrO.nameZH} 站 (${mtrO.exit} 入口)</div>
                            <div class="route-step"><span class="step-icon">🚇</span> <strong>乘搭</strong>: 港鐵 (${travelTime} 分鐘)</div>
                            <div class="route-step"><span class="step-icon">🚉</span> <strong>離開</strong>: ${mtrD.nameZH} 站</div>
                            <div class="route-step"><span class="step-icon">🚶</span> <strong>終點</strong>: 步行 ${mtrD.walkTime} 分鐘抵達</div>
                        `,
                        coordinates: [[mtrO.lng, mtrO.lat], [mtrD.lng, mtrD.lat]]
                    });
                    break; 
                } else {
                    mtrMatchFailures.push({ from: mtrO.nameZH, to: mtrD.nameZH, normO, normD });
                    console.log(`❌ [MTR] No fare found for: ${mtrO.nameZH} (${normO}) -> ${mtrD.nameZH} (${normD})`);
                }
            }
        }

        // --- B. 巴士路徑計算 ---
        console.log(`🚌 [STEP 4] Checking ${GLOBAL_BUS.length} bus routes...`);
        let busResults = [];
        let busMatchFailures = [];
        GLOBAL_BUS.forEach(feature => {
            const props = feature.properties;
            if (!props.STOPS || props.STOPS.length === 0) return;

            let nearestStopToOrigin = null;
            let minDistToOrigin = Infinity;
            let nearestStopToDest = null;
            let minDistToDest = Infinity;

            props.STOPS.forEach(stop => {
                const dOrig = calculateHaversineDistance(originData.lat, originData.lng, stop.lat, stop.lon);
                if (dOrig < minDistToOrigin) {
                    minDistToOrigin = dOrig;
                    nearestStopToOrigin = stop;
                }

                const dDest = calculateHaversineDistance(destData.lat, destData.lng, stop.lat, stop.lon);
                if (dDest < minDistToDest) {
                    minDistToDest = dDest;
                    nearestStopToDest = stop;
                }
            });

            // 巴士匹配半徑，並根據距離調整步行時間
            const BUS_RADIUS = 2.0; 
            if (minDistToOrigin < BUS_RADIUS && minDistToDest < BUS_RADIUS) {
                const originIdx = props.STOPS.findIndex(s => s === nearestStopToOrigin);
                const destIdx = props.STOPS.findIndex(s => s === nearestStopToDest);
                
                if (originIdx < destIdx) {
                    const adultFare = props.FULL_FARE || 10.0;
                    const concessionFare = Math.min(2.0, adultFare);
                    
                    const walkTimeOrigin = Math.max(2, Math.round(minDistToOrigin * 12));
                    const walkTimeDest = Math.max(2, Math.round(minDistToDest * 12));
                    const totalWalkTime = walkTimeOrigin + walkTimeDest;

                    busResults.push({
                        type: 'BUS',
                        icon: '🚌',
                        title: `巴士 ${props.ROUTE_NAME} (${props.START_STATION} ↔ ${props.END_STATION})`,
                        duration: props.TRAVEL_TIME + totalWalkTime,
                        adultFare: adultFare,
                        concessionFare: concessionFare,
                        savings: Math.max(0, adultFare - concessionFare),
                        walkTime: totalWalkTime,
                        steps: `
                            <div class="route-step"><span class="step-icon">🚶</span> <strong>起點</strong>: 步行 ${walkTimeOrigin} 分鐘</div>
                            <div class="route-step"><span class="step-icon">🚏</span> <strong>上車</strong>: ${nearestStopToOrigin.name} (巴士 ${props.ROUTE_NAME})</div>
                            <div class="route-step"><span class="step-icon">🚌</span> <strong>乘搭</strong>: ${props.TRAVEL_TIME} 分鐘</div>
                            <div class="route-step"><span class="step-icon">🚏</span> <strong>落車</strong>: ${nearestStopToDest.name}</div>
                            <div class="route-step"><span class="step-icon">🚶</span> <strong>終點</strong>: 步行 ${walkTimeDest} 分鐘抵達</div>
                        `,
                        coordinates: feature.geometry.coordinates
                    });
                } else {
                    busMatchFailures.push({ route: props.ROUTE_NAME, reason: "Wrong direction", originIdx, destIdx });
                }
            } else {
                if (minDistToOrigin < 10.0 || minDistToDest < 10.0) { // 只記錄 10km 內的失敗，避免日誌爆炸
                    busMatchFailures.push({ 
                        route: props.ROUTE_NAME, 
                        reason: "Out of radius", 
                        distO: minDistToOrigin.toFixed(2), 
                        distD: minDistToDest.toFixed(2) 
                    });
                }
            }
        });

        // 如果沒有巴士結果，嘗試找最近的一條線路 (限制在 2km 內)
        if (busResults.length === 0 && GLOBAL_BUS.length > 0) {
            console.log("⚠️ [BUS] No bus results in 2km, finding nearest fallback within 2km...");
            let bestFallback = null;
            let minFallbackDist = Infinity;

            GLOBAL_BUS.forEach(feature => {
                const props = feature.properties;
                let dOrigMin = Infinity;
                let dDestMin = Infinity;
                let sOrig = null;
                let sDest = null;

                props.STOPS.forEach(stop => {
                    const dO = calculateHaversineDistance(originData.lat, originData.lng, stop.lat, stop.lon);
                    if (dO < dOrigMin) { dOrigMin = dO; sOrig = stop; }
                    const dD = calculateHaversineDistance(destData.lat, destData.lng, stop.lat, stop.lon);
                    if (dD < dDestMin) { dDestMin = dD; sDest = stop; }
                });

                const totalDist = dOrigMin + dDestMin;
                const oIdx = props.STOPS.findIndex(s => s === sOrig);
                const dIdx = props.STOPS.findIndex(s => s === sDest);

                // 限制步行距離：起點和終點步行加起來不超過 2km，否則對長者太遠
                if (dOrigMin < 2.0 && dDestMin < 2.0 && totalDist < minFallbackDist && oIdx < dIdx) {
                    minFallbackDist = totalDist;
                    bestFallback = { feature, sOrig, sDest, dOrigMin, dDestMin };
                }
            });

            if (bestFallback) {
                const { feature, sOrig, sDest, dOrigMin, dDestMin } = bestFallback;
                const props = feature.properties;
                const adultFare = props.FULL_FARE || 10.0;
                const concessionFare = Math.min(2.0, adultFare);
                const walkTimeOrigin = Math.max(2, Math.round(dOrigMin * 12));
                const walkTimeDest = Math.max(2, Math.round(dDestMin * 12));
                
                busResults.push({
                    type: 'BUS',
                    icon: '🚌',
                    title: `巴士 ${props.ROUTE_NAME} (較遠推薦)`,
                    duration: props.TRAVEL_TIME + walkTimeOrigin + walkTimeDest,
                    adultFare: adultFare,
                    concessionFare: concessionFare,
                    savings: Math.max(0, adultFare - concessionFare),
                    walkTime: walkTimeOrigin + walkTimeDest,
                    steps: `
                        <div class="route-step"><span class="step-icon">🚶</span> <strong>起點</strong>: 步行 ${walkTimeOrigin} 分鐘</div>
                        <div class="route-step"><span class="step-icon">🚏</span> <strong>上車</strong>: ${sOrig.name} (巴士 ${props.ROUTE_NAME})</div>
                        <div class="route-step"><span class="step-icon">🚌</span> <strong>乘搭</strong>: ${props.TRAVEL_TIME} 分鐘</div>
                        <div class="route-step"><span class="step-icon">🚏</span> <strong>落車</strong>: ${sDest.name}</div>
                        <div class="route-step"><span class="step-icon">🚶</span> <strong>終點</strong>: 步行 ${walkTimeDest} 分鐘抵達</div>
                    `,
                    coordinates: feature.geometry.coordinates
                });
            }
        }
        results.push(...busResults);

        // --- D. 轉乘組合 (Bus + MTR) ---
        console.log("🔄 [STEP 4.5] Checking Bus + MTR combinations...");
        const comboResults = [];
        
        // 只檢查起點附近的巴士線路
        const startNearbyBusRoutes = GLOBAL_BUS.filter(feature => {
            const props = feature.properties;
            return props.STOPS.some(stop => calculateHaversineDistance(originData.lat, originData.lng, stop.lat, stop.lon) < 2.0);
        });

        startNearbyBusRoutes.forEach(busFeature => {
            const busProps = busFeature.properties;
            const stops = busProps.STOPS;

            // 1. 找到起點最近的巴士站
            let bestStartIdx = -1;
            let minStartDist = Infinity;
            stops.forEach((stop, idx) => {
                const d = calculateHaversineDistance(originData.lat, originData.lng, stop.lat, stop.lon);
                if (d < minStartDist) { minStartDist = d; bestStartIdx = idx; }
            });

            if (bestStartIdx !== -1 && minStartDist < 2.0) {
                // 2. 從該站往後找，看是否有 MTR 站
                for (let i = bestStartIdx + 1; i < stops.length; i++) {
                    const busStop = stops[i];
                    const nearMtr = GLOBAL_MTR_STATIONS.find(mtr => {
                        const mtrExits = GLOBAL_MTR_EXITS.filter(e => e.Station_CHI === mtr['Chinese Name']);
                        return mtrExits.some(exit => calculateHaversineDistance(busStop.lat, busStop.lon, parseFloat(exit.Latitude), parseFloat(exit.Longitude)) < 0.6);
                    });

                    if (nearMtr) {
                        // 3. 找到轉乘點，計算到終點的 MTR
                        for (const mtrDest of destMtrStations) {
                            if (nearMtr['Chinese Name'] !== mtrDest.nameZH) {
                                const normO = normalizeStationName(nearMtr['English Name']);
                                const normD = normalizeStationName(mtrDest.nameEN);
                                
                                const fareData = GLOBAL_MTR_FARES.find(f => {
                                    const src = normalizeStationName(f.SRC_STATION_NAME || f.SRC_STATION || "");
                                    const dest = normalizeStationName(f.DEST_STATION_NAME || f.DEST_STATION || "");
                                    return src === normO && dest === normD;
                                });

                                if (fareData) {
                                    const busAdultFare = busProps.FULL_FARE || 5.0;
                                    const busConFare = Math.min(2.0, busAdultFare);
                                    const mtrAdultFare = parseFloat(fareData.OCT_ADT_FARE || fareData.OCT_STD_FARE || 0);
                                    const mtrConFare = parseFloat(fareData.OCT_JOYYOU_SIXTY_FARE || fareData.OCT_CON_ELDERLY_FARE) || 2.0;

                                    const totalAdultFare = busAdultFare + mtrAdultFare;
                                    const totalConFare = busConFare + mtrConFare; 
                                    
                                    const walkToBus = Math.round(minStartDist * 12);
                                    const busTravelTime = Math.max(5, (i - bestStartIdx) * 2);
                                    const mtrDist = calculateHaversineDistance(busStop.lat, busStop.lon, mtrDest.lat, mtrDest.lng);
                                    const mtrTravelTime = Math.round(mtrDist * 1.5) + 5;
                                    const totalTime = walkToBus + busTravelTime + 10 + mtrTravelTime + mtrDest.walkTime;

                                    comboResults.push({
                                        type: 'COMBO',
                                        icon: '🚌+🚇',
                                        title: `${busProps.ROUTE_NAME} 巴士 轉 港鐵`,
                                        duration: totalTime,
                                        adultFare: totalAdultFare,
                                        concessionFare: totalConFare,
                                        savings: totalAdultFare - totalConFare,
                                        walkTime: walkToBus + mtrDest.walkTime + 5,
                                        steps: `
                                            <div class="route-step"><span class="step-icon">🚶</span> <strong>起點</strong>: 步行 ${walkToBus} 分鐘</div>
                                            <div class="route-step"><span class="step-icon">🚏</span> <strong>上車</strong>: ${stops[bestStartIdx].name} (巴士 ${busProps.ROUTE_NAME})</div>
                                            <div class="route-step"><span class="step-icon">🚌</span> <strong>乘搭</strong>: ${busTravelTime} 分鐘</div>
                                            <div class="route-step"><span class="step-icon">🔄</span> <strong>轉乘</strong>: ${busStop.name} 步行至 ${nearMtr['Chinese Name']} 站</div>
                                            <div class="route-step"><span class="step-icon">🚇</span> <strong>乘搭</strong>: 港鐵至 ${mtrDest.nameZH} 站 (${mtrTravelTime} 分鐘)</div>
                                            <div class="route-step"><span class="step-icon">🚶</span> <strong>終點</strong>: 步行 ${mtrDest.walkTime} 分鐘抵達</div>
                                        `,
                                        coordinates: busFeature.geometry.coordinates
                                    });
                                    break; 
                                }
                            }
                        }
                    }
                }
            }
        });
        
        results.push(...comboResults);

        // --- C. 步行選項 ---
        // 只有當沒有其他交通工具，或者距離真的很近時才顯示
        const hasTransit = results.length > 0;
        if (directDist < 2.0 || (!hasTransit && directDist < 5.0)) { 
            const walkTime = Math.round(directDist * 12);
            let walkSteps = "";
            
            if (directDist < 0.05) {
                walkSteps = `<div class="route-step"><span class="step-icon">📍</span> 您已抵達 <strong>${destData.name}</strong> 附近。</div>`;
            } else {
                walkSteps = `<div class="route-step"><span class="step-icon">🚶</span> 從 <strong>${originData.name}</strong> 步行約 ${walkTime} 分鐘抵達 <strong>${destData.name}</strong>。</div>`;
            }

            results.push({
                type: 'WALK',
                icon: '🚶',
                title: '全程步行',
                duration: walkTime,
                adultFare: 0,
                concessionFare: 0,
                savings: 0,
                walkTime: walkTime,
                steps: walkSteps,
                coordinates: [[originData.lng, originData.lat], [destData.lng, destData.lat]]
            });
        }

        console.log(`📊 [STEP 5] Final results count: ${results.length}`);

        if (results.length === 0) {
            console.group("🕵️ [DEBUG] Detailed Matching Diagnostics");
            console.log("📍 Origin:", { name: originData.name, lat: originData.lat, lng: originData.lng });
            console.log("📍 Destination:", { name: destData.name, lat: destData.lat, lng: destData.lng });
            console.log("🚇 MTR Match Failures (No Fare Data):", mtrMatchFailures);
            console.log("🚌 Bus Match Failures (Out of Radius/Wrong Dir):", busMatchFailures.slice(0, 20)); // 只顯示前20個避免洗版
            console.groupEnd();

            const msg = "🔍 抱歉，未能找到直接匹配的交通工具。\n\n偵錯資訊已輸出至控制台 (F12)。\n\n建議：\n1. 請檢查起點和終點是否輸入正確。\n2. 目前數據主要涵蓋港鐵及港鐵巴士。\n3. 如果您身處偏遠地區，建議嘗試搜尋最近的港鐵站名。";
            alert(msg);
        } else {
            // 找出最平 (concessionFare 最小)
            const minConcessionFare = Math.min(...results.map(r => r.concessionFare));
            const cheapestResults = results.filter(r => r.concessionFare === minConcessionFare);
            const bestCheapest = cheapestResults.sort((a, b) => {
                // 在票價相同的情況下，優先選擇時間最短的路線
                return a.duration - b.duration;
            })[0];
            
            // 找出最快 (duration 最小)
            const minDuration = Math.min(...results.map(r => r.duration));
            const bestFastest = results.sort((a, b) => a.duration - b.duration)[0];

            const finalDisplayResults = [];
            
            // 1. 最快路徑 (🥇 Fastest)
            const fastestCard = { ...bestFastest, badge: "🥇 最快路線 (Fastest)", isFastest: true };
            finalDisplayResults.push(fastestCard);

            // 2. 最平路徑 (💰 Cheapest)
            // 即使跟最快是同一個，我們也顯示，但標記為「最平且最快」
            if (bestCheapest === bestFastest) {
                // 如果最快也就是最平，我們再找一個「次快」或者「次平」的作為第二個卡片
                // 這樣用戶總能看到兩個選擇
                const others = results.filter(r => r !== bestFastest).sort((a, b) => a.duration - b.duration);
                if (others.length > 0) {
                    fastestCard.badge = "🏆 最平且最快 (Cheapest & Fastest)";
                    const secondOption = { ...others[0], badge: "🔍 備選方案 (Alternative)" };
                    finalDisplayResults.push(secondOption);
                }
            } else {
                const cheapestCard = { ...bestCheapest, badge: "💰 最平路線 (Cheapest)", isCheapest: true };
                finalDisplayResults.push(cheapestCard);
            }

            renderResults(finalDisplayResults);
        }

    } catch (error) {
        console.error("❌ [FATAL ERROR] runComparison crashed:", error);
        alert("搜尋過程中發生錯誤: " + error.message);
    } finally {
        calculateBtn.innerText = originalBtnText;
        calculateBtn.disabled = false;
    }
}

// --- 5. UI 渲染與交互 ---

function renderResults(results) {
    const list = document.getElementById('comparisonList');
    const section = document.getElementById('resultSection');
    currentRoutes = results;

    list.innerHTML = results.map((res, index) => {
        let cardClass = '';
        if (res.badge && (res.badge.includes("最平") || res.badge.includes("🏆"))) cardClass = 'cheapest';
        else if (res.isFastest) cardClass = 'fastest';
        
        const walkingInfo = res.walkTime ? `<p class="walk-time-info"><small>🚶 步行總計: ${res.walkTime} 分鐘</small></p>` : '';
        
        return `
            <div class="mode-card ${cardClass}" data-index="${index}">
                <div class="mode-header">
                    <div class="mode-info">
                        <h3><span class="mode-icon">${res.icon}</span> ${res.title}</h3>
                        <p><strong>預計總時長: ${res.duration} 分鐘</strong></p>
                        ${walkingInfo}
                    </div>
                    <div class="mode-fare">
                        <div class="original-price">成人正價: $${res.adultFare.toFixed(1)}</div>
                        <div class="price">$${res.concessionFare.toFixed(1)}</div>
                        <div class="concession-label">政府補貼節省: $${res.savings.toFixed(1)}</div>
                    </div>
                </div>
                <div class="itinerary-steps-text">${res.steps}</div>
                ${res.badge ? `<div class="route-badge">${res.badge}</div>` : ''}
            </div>
        `;
    }).join('');

    list.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
            const idx = parseInt(card.dataset.index);
            const route = currentRoutes[idx];
            list.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        });
    });

    if (list.querySelector('.mode-card')) list.querySelector('.mode-card').click();
    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth' });
}

function setupEventListeners() {
    console.log("🛠️ Setting up event listeners...");
    const calcBtn = document.getElementById('calculateBtn');
    if (calcBtn) {
        console.log("✅ calculateBtn found, adding click listener");
        calcBtn.addEventListener('click', () => {
            console.log("🖱️ Search button CLICKED!");
            runComparison();
        });
    } else {
        console.error("❌ calculateBtn NOT FOUND in DOM!");
    }

    const fontToggle = document.getElementById('fontSizeToggle');
    if (fontToggle) fontToggle.addEventListener('click', () => {
        console.log("Toggle font size");
        document.body.classList.toggle('theme-extra-large');
    });

    const saveHome = document.getElementById('saveHomeBtn');
    if (saveHome) saveHome.addEventListener('click', () => {
        console.log("Save home clicked");
        saveHomeStation();
    });

    const takeHome = document.getElementById('takeMeHomeBtn');
    if (takeHome) takeHome.addEventListener('click', () => {
        console.log("Take me home clicked");
        takeMeHome();
    });

    const speak = document.getElementById('speakBtn');
    if (speak) speak.addEventListener('click', () => {
        console.log("Speak button clicked");
        if (!currentRoutes || currentRoutes.length === 0) return;
        const top = currentRoutes[0];
        speakText(`為你推薦路線：${top.title}，長者優惠價只需 ${top.concessionFare.toFixed(1)} 蚊。`);
    });
}

function saveHomeStation() {
    const homeInput = document.getElementById('homeSearch');
    const homeName = homeInput.value.trim();
    if (homeName) {
        localStorage.setItem('mtr_home_place', homeName);
        alert(`已儲存 「${homeName}」 為您的家！`);
    }
}

function loadHomeStation() {
    const saved = localStorage.getItem('mtr_home_place');
    if (saved) {
        const homeInput = document.getElementById('homeSearch');
        if (homeInput) homeInput.value = saved;
    }
}

function takeMeHome() {
    const saved = localStorage.getItem('mtr_home_place');
    if (!saved) { alert("您還未設定『家』的地點。"); return; }
    document.getElementById('toSearch').value = saved;
    runComparison();
}

function speakText(text) {
     if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-HK';
    window.speechSynthesis.speak(utterance);
}
