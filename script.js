// 核心目標：
// 1. 單手捏合: 旋轉模型 (camera-orbit)。
// 2. 單手張開: 平移模型 (camera-target)。
// 3. 雙手張合: 縮放模型 (camera-orbit radius)。

// =================================================================
// 1. 元素和選項設定
// =================================================================
const videoElement = document.querySelector('.input_video');
const modelViewer = document.getElementById("myModel");

// ❗ 已將初始縮放值再微調為 "2 2 2" ❗
const INITIAL_MODEL_SCALE = "2 2 2"; 

const handParts = {
    wrist: 0,
    thumb: { base: 1, middle: 2, topKnuckle: 3, tip: 4 },
    indexFinger: { base: 5, middle: 6, topKnuckle: 7, tip: 8 },
};

const state = {
    // 旋轉與縮放狀態
    lastIndexTipCoords: {}, 
    lastScaleDistance: null,
    originalOrbitRadius: 0.7, 
    lastRotationCoord: null,
    isGrabbing: false, 
    
    // 平移狀態
    lastTranslationCoord: null, // 追蹤上次平移的座標
    originalCameraTarget: [0, 0, 0], // 儲存初始 Camera Target
};

// 確保模型載入完成後才能操作
modelViewer.addEventListener('load', () => {
    // 初始化縮放限制
    const orbitValues = modelViewer.cameraOrbit.split(' ');
    state.originalOrbitRadius = parseFloat(orbitValues[2].replace('m', ''));
    
    // 初始化 Camera Target (通常是 0m 0m 0m)
    const targetValues = modelViewer.cameraTarget ? modelViewer.cameraTarget.split('m ') : ["0", "0", "0"];
    state.originalCameraTarget = targetValues.map(v => parseFloat(v));
    
    // 應用調整後的模型縮放
    modelViewer.scale = INITIAL_MODEL_SCALE; 
});

// =================================================================
// 2. 輔助函式
// =================================================================

function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function isHandGrabbing(landmarks) {
    if (!landmarks) return false;
    const pinchDistance = getDistance(landmarks[handParts.indexFinger.tip], landmarks[handParts.thumb.tip]);
    
    const GRAB_THRESHOLD = 0.05; 
    return pinchDistance < GRAB_THRESHOLD;
}

function isHandOpen(landmarks) {
    return !isHandGrabbing(landmarks);
}

function getHandTrackingPoint(landmarks) {
    const { x, y, z } = landmarks[handParts.indexFinger.middle];
    // X 軸座標鏡像反轉
    const mirroredXCoord = -x + 1; 
    return { x: mirroredXCoord, y, z };
}

// =================================================================
// 3. 核心功能邏輯
// =================================================================

/**
 * 根據手部移動平移模型 (調整 camera-target)。
 */
function translateModelBySingleHand(currentCoord) {
    if (state.lastTranslationCoord === null) {
        state.lastTranslationCoord = currentCoord;
        return;
    }

    const dx = currentCoord.x - state.lastTranslationCoord.x;
    const dy = currentCoord.y - state.lastTranslationCoord.y;
    
    // 靈敏度
    const sensitivity = 0.5; 

    // 獲取當前的 camera-target 值
    let targetValues = modelViewer.cameraTarget ? modelViewer.cameraTarget.split('m ') : ["0", "0", "0"];
    let x = parseFloat(targetValues[0]);
    let y = parseFloat(targetValues[1]);
    let z = parseFloat(targetValues[2]);

    // Hand Right (dx > 0) -> Model Right (target X 增加)
    x += dx * sensitivity; 
    
    // Hand Down (dy > 0) -> Model Down (target Y 減少)
    y -= dy * sensitivity; 

    modelViewer.cameraTarget = `${x.toFixed(3)}m ${y.toFixed(3)}m ${z.toFixed(3)}m`;
    state.lastTranslationCoord = currentCoord; // 更新座標
}


function rotateModelBySingleHand(currentCoord) {
    if (state.lastRotationCoord === null) {
        state.lastRotationCoord = currentCoord;
        return;
    }

    const dx = currentCoord.x - state.lastRotationCoord.x;
    const dy = currentCoord.y - state.lastRotationCoord.y; 

    const sensitivity = 400; 
    
    const thetaChange = -dx * sensitivity; 
    const phiChange = -dy * sensitivity;    

    let orbitValues = modelViewer.cameraOrbit ? modelViewer.cameraOrbit.split(' ') : ["0deg", "75deg", "0.7m"];
    
    let theta = parseFloat(orbitValues[0].replace('deg', '')); 
    let phi = parseFloat(orbitValues[1].replace('deg', ''));   
    let radius = orbitValues[2];                               

    theta = (theta + thetaChange) % 360;
    phi = Math.max(0, Math.min(180, phi + phiChange)); 
    
    modelViewer.cameraOrbit = `${theta}deg ${phi}deg ${radius}`;

    state.lastRotationCoord = currentCoord;
}


function scaleModelByTwoHands(leftTip, rightTip) {
    const currentDistance = getDistance(leftTip, rightTip);
    
    if (state.lastScaleDistance !== null) {
        const distanceChange = currentDistance - state.lastScaleDistance;
        const scaleSensitivity = 1.0; 
        
        let orbitValues = modelViewer.cameraOrbit.split(' ');
        let currentRadius = parseFloat(orbitValues[2].replace('m', ''));

        let newRadius = currentRadius + distanceChange * scaleSensitivity;

        newRadius = Math.max(0.1, Math.min(state.originalOrbitRadius * 2, newRadius)); 
        
        modelViewer.cameraOrbit = `${orbitValues[0]} ${orbitValues[1]} ${newRadius.toFixed(3)}m`;
    }
    
    state.lastScaleDistance = currentDistance;
}


// =================================================================
// 4. MediaPipe 核心處理
// =================================================================

function onResults(results) {
    if (!modelViewer) return;
    
    const handsDetected = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
    
    if (handsDetected > 0) {
        
        state.lastIndexTipCoords = {};
        
        results.multiHandLandmarks.forEach((landmarks, index) => {
            const handedness = results.multiHandedness[index].label; 
            const indexTip = landmarks[handParts.indexFinger.tip];
            state.lastIndexTipCoords[handedness] = indexTip;
        });

        const landmarks = results.multiHandLandmarks[0];
        const currentCoord = getHandTrackingPoint(landmarks);
        const isGrabbingNow = isHandGrabbing(landmarks);
        const isHandOpenNow = isHandOpen(landmarks);

        // 雙手模式：處理縮放 (優先級最高)
        if (handsDetected === 2 && 'Left' in state.lastIndexTipCoords && 'Right' in state.lastIndexTipCoords) {
            
            const leftTip = state.lastIndexTipCoords['Left'];
            const rightTip = state.lastIndexTipCoords['Right'];
            
            scaleModelByTwoHands(leftTip, rightTip);
            
            // 雙手模式重置單手狀態
            state.lastRotationCoord = null; 
            state.lastTranslationCoord = null;
            state.isGrabbing = false;
        } 
        
        // 單手模式
        else if (handsDetected === 1) {
            
            if (isGrabbingNow) {
                // 捏合時：執行旋轉
                rotateModelBySingleHand(currentCoord);
                
                state.isGrabbing = true;
                
                // 旋轉時重置平移狀態
                state.lastTranslationCoord = null; 
            } else if (isHandOpenNow) {
                // 張開時：執行平移 (Translation)
                translateModelBySingleHand(currentCoord);
                
                state.isGrabbing = false;
                
                // 平移時重置旋轉狀態
                state.lastRotationCoord = null; 
            }
            
            state.lastScaleDistance = null; 
        } 
        
    } else {
        // 無手部偵測重置所有狀態
        state.lastRotationCoord = null;
        state.lastTranslationCoord = null;
        state.lastScaleDistance = null;
        state.isGrabbing = false;
    }
}


// =================================================================
// 5. 啟動 MediaPipe 
// =================================================================

const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});
hands.setOptions({
  maxNumHands: 2, 
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
hands.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({image: videoElement});
  },
  width: 1280,
  height: 720
});

camera.start();