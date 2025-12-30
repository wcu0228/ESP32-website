/* =========================================================
   ESP32 Web Serial 即時資料接收 + 示波器繪圖
   - 麥克風（電壓）
   - ADXL354（X / Y / Z raw ADC）
   - 支援：Pause / Channel Select / Export CSV
   ========================================================= */

// ===== 取得畫面元件 =====
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusEl = document.getElementById('status');

const baudSelect = document.getElementById('baudSelect');
const pauseBtn = document.getElementById('pauseBtn');
const exportBtn = document.getElementById('exportBtn');
const samplesInput = document.getElementById('samples');
const volFill = document.getElementById('volFill');
const volText = document.getElementById('volText');
const micText = document.getElementById('micText');
const accelText = document.getElementById('accelText');
  /* ===== 頻道顯示勾選 ===== */
const chMic = document.getElementById('chMic');
const chX   = document.getElementById('chX');
const chY   = document.getElementById('chY');
const chZ   = document.getElementById('chZ');

// ===== Web Serial 相關 =====
let port = null;           // 串列埠物件
let reader = null;         // 文字讀取器
let keepReading = false;
let paused = false;

/* =======================
   資料緩衝示波器 buffer 設定 畫布顯示資料的數量多寡
   ======================= */
let BUFFER_SIZE = 400;// ===== 示波器緩衝區長度 =====

let micBuf = Array(BUFFER_SIZE).fill(0);
let xBuf   = Array(BUFFER_SIZE).fill(0);
let yBuf   = Array(BUFFER_SIZE).fill(0);
let zBuf   = Array(BUFFER_SIZE).fill(0);


/* =======================
   CSV 資料儲存區
   ======================= */
const csvBuffer = [];   // 匯出用資料陣列

// ===== 麥克風示波器 =====
const waveChart = new Chart(
  document.getElementById('waveChart'),
  {
    type: 'line',
    data: {
      labels: [...Array(BUFFER_SIZE).keys()],
      datasets: [{
        data: micBuf,
        borderColor: '#2563eb',
        pointRadius: 0
      }]
    },
    options: {
      animation: false,
      scales: {
        x: { display: false },
        y: { min: 0, max: 3.3 }
      }
    }
  }
);

// ===== ADXL354 三軸示波器 =====
const accelChart = new Chart(
  document.getElementById('accelChart'),
  {
    type: 'line',
    data: {
      labels: [...Array(BUFFER_SIZE).keys()],
      datasets: [
        { label: 'X', data: xBuf, borderColor: '#ef4444', pointRadius: 0 },
        { label: 'Y', data: yBuf, borderColor: '#22c55e', pointRadius: 0 },
        { label: 'Z', data: zBuf, borderColor: '#3b82f6', pointRadius: 0 }
      ]
    },
    options: {
      animation: false,
      scales: {
        x: { display: false },
        y: { min: 0, max: 4095 }
      }
    }
  }
);

// ===== 暫存一組完整資料（避免不同步）=====
let temp = { v:null, x:null, y:null, z:null };
let frame = 0;
// 嘗試將一整組資料推入示波器
function tryPushData() {

  // 確保四個值都收到
  if (temp.v!==null && temp.x!==null &&
      temp.y!==null && temp.z!==null) {

    // 推入 buffer（FIFO）
    micBuf.shift(); micBuf.push(temp.v);
    xBuf.shift();   xBuf.push(temp.x);
    yBuf.shift();   yBuf.push(temp.y);
    zBuf.shift();   zBuf.push(temp.z);

    /* === CSV 記錄（時間戳）=== */
    csvBuffer.push({
      t: Date.now(),
      mic: temp.v,
      x: temp.x,
      y: temp.y,
      z: temp.z
    });

    // 更新圖表
   if (++frame % 3 === 0) {
     waveChart.data.datasets[0].hidden = !chMic.checked;
     accelChart.data.datasets[0].hidden = !chX.checked;
     accelChart.data.datasets[1].hidden = !chY.checked;
     accelChart.data.datasets[2].hidden = !chZ.checked;

     waveChart.update('none');
     accelChart.update('none');
   }

  // ===== 計算音量 RMS（能量）=====
    const slice = micBuf.slice(-30);
    const rms = Math.sqrt(slice.reduce((s,v)=>s+v*v,0)/slice.length);

    volFill.style.height = Math.min(100, rms/3.3*100) + '%';
    volText.textContent = rms.toFixed(3) + ' V';

    micText.textContent = temp.v.toFixed(3) + ' V';
    accelText.textContent =
      `X:${temp.x}  Y:${temp.y}  Z:${temp.z}`;

    // 清空暫存
    temp = { v:null, x:null, y:null, z:null };
  }
}


// ===== Web Serial 讀取主迴圈 =====
async function readLoop() {

  // 將 byte stream 轉成文字 位元 → 文字
  const decoder = new TextDecoderStream();
  port.readable.pipeTo(decoder.writable);

   const reader = decoder.readable.getReader();
   let buffer = "";

   while (keepReading) {
     const { value, done } = await reader.read();
     if (done) break;
     if (paused) continue;

      buffer += value;
      console.log(value);
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop(); // 留下不完整的那一段

      for (const line of lines) {
         const clean = line.trim();
         if (!clean) continue;

         const parts = clean.split(",");
         if (parts.length !== 4) {
           console.warn("格式錯誤:", clean);
           continue;
         }
         temp.v = parseFloat(parts[0]);
         temp.x = parseInt(parts[1]);
         temp.y = parseInt(parts[2]);
         temp.z = parseInt(parts[3]);

         tryPushData();
    }
   }
}

// ===== 連線按鈕 =====
connectBtn.onclick = async () => {
  try {
    port = await navigator.serial.requestPort();// 讓使用者選擇 COM Port
    const baudRate = parseInt(baudSelect.value, 10);// 讀取畫面上選擇的 Baud Rate
    await port.open({ baudRate });// 開啟 Serial 連線

    keepReading = true;
    statusEl.textContent = `已連線 (${baudRate} bps)`;
    statusEl.style.color = '#0b5';

    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    readLoop();// 開始讀取資料
  } catch (err) {
    console.error(err);
    statusEl.textContent = '連線失敗';
    statusEl.style.color = '#c0262e';
  }
};

// ===== 中斷連線 =====
disconnectBtn.onclick = async () => {
  keepReading = false;

  try { await reader.cancel(); } catch {}
  try { await port.close(); } catch {}

  statusEl.textContent = '已中斷';
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
};

/* =======================
   Pause / Resume 暫停 / 繼續
   ======================= */
pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
};

/* =======================
   Export CSV 匯出資料
   ======================= */
exportBtn.onclick = () => {

  if (csvBuffer.length === 0) {
    alert("目前沒有資料可匯出");
    return;
  }

  let csv = "time,micV,x,y,z\n";
  csvBuffer.forEach(r => {
    csv += `${r.t},${r.mic},${r.x},${r.y},${r.z}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "esp32_data.csv";
  a.click();

  URL.revokeObjectURL(url);
};
