/* =========================================================
   ESP32 Web Serial 即時資料接收 + 示波器繪圖
   - 麥克風（電壓）
   - ADXL354（X / Y / Z raw ADC）
   ========================================================= */

// ===== 取得畫面元件 =====
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusEl = document.getElementById('status');

const volFill = document.getElementById('volFill');
const volText = document.getElementById('volText');
const micText = document.getElementById('micText');
const accelText = document.getElementById('accelText');

// ===== Web Serial 相關 =====
let port;           // 串列埠物件
let reader;         // 文字讀取器
let keepReading = false;

// ===== 示波器緩衝區長度 =====
const BUFFER_SIZE = 400;

// ===== 資料緩衝 =====
let micBuf = Array(BUFFER_SIZE).fill(0);
let xBuf   = Array(BUFFER_SIZE).fill(0);
let yBuf   = Array(BUFFER_SIZE).fill(0);
let zBuf   = Array(BUFFER_SIZE).fill(0);

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

    // 更新圖表
    waveChart.update('none');
    accelChart.update('none');

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

  // 將 byte stream 轉成文字
  const decoder = new TextDecoderStream();
  port.readable.pipeTo(decoder.writable);

  reader = decoder.readable
    .pipeThrough(new TransformStream({
      transform(chunk, controller) {
        chunk.split(/\r?\n/).forEach(line => {
          controller.enqueue(line);
        });
      }
    }))
    .getReader();

  while (keepReading) {
    const { value, done } = await reader.read();
    if (done) break;

    // 解析 ESP32 Serial 輸出
    if (/Voltage/.test(value))
      temp.v = parseFloat(value.match(/[\d.]+/));

    if (/X_raw/.test(value))
      temp.x = parseInt(value.match(/X_raw:\s*(\d+)/)[1]);

    if (/Y_raw/.test(value))
      temp.y = parseInt(value.match(/Y_raw:\s*(\d+)/)[1]);

    if (/Z_raw/.test(value))
      temp.z = parseInt(value.match(/Z_raw:\s*(\d+)/)[1]);

    tryPushData();
  }
}

// ===== 連線按鈕 =====
connectBtn.onclick = async () => {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });

  keepReading = true;
  statusEl.textContent = '已連線';
  connectBtn.disabled = true;
  disconnectBtn.disabled = false;

  readLoop();
};

// ===== 中斷連線 =====
disconnectBtn.onclick = async () => {
  keepReading = false;
  await reader.cancel();
  await port.close();

  statusEl.textContent = '已中斷';
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
};
