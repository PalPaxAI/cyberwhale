import Game from './Game/Game.class';
import ResourceLoader from './Game/Utils/ResourceLoader.class';
import ASSETS from './config/assets.js';

const isDebugMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mode') === 'debug';

const loadingScreen = document.getElementById('loading-screen');
const loaderStatus = document.getElementById('loader-status');
const exploreButtons = document.getElementById('explore-buttons');
const btnWithMusic = document.getElementById('btn-with-music');
const btnWithoutMusic = document.getElementById('btn-without-music');
const uiLayer = document.getElementById('ui-layer');

const statDepth = document.getElementById('stat-depth');
const statSpeed = document.getElementById('stat-speed');
const statTime = document.getElementById('stat-time');
const depthBar = document.getElementById('depth-bar');
const speedBar = document.getElementById('speed-bar');
const coordDisplay = document.getElementById('coord-display');
const fpsDisplay = document.getElementById('fps-display');
const tokenPriceEl = document.getElementById('token-price');
const tokenMcapEl = document.getElementById('token-mcap');
const tokenVolEl = document.getElementById('token-vol');
const tokenHoldersEl = document.getElementById('token-holders');
const btnBuy = document.getElementById('btn-buy');
const btnChart = document.getElementById('btn-chart');
const quickX = document.getElementById('quick-x');

const audioToggle = document.getElementById('audio-toggle');
const audioBtn = document.getElementById('audio-btn');
const audioLabel = document.getElementById('audio-label');
const audioIconOn = document.getElementById('audio-icon-on');
const audioIconOff = document.getElementById('audio-icon-off');

const bgm = new Audio('/assets/audio/bgm.mp3');
bgm.loop = true;
bgm.volume = 0.5;
let isAudioPlaying = false;

// Optional: allow setting Solscan API key via localStorage without committing secrets.
// Usage in DevTools console:
// localStorage.setItem('SOLSCAN_API_KEY', 'YOUR_KEY'); location.reload();
try {
  if (
    typeof window !== 'undefined' &&
    !window.SOLSCAN_API_KEY &&
    typeof localStorage !== 'undefined'
  ) {
    const k = localStorage.getItem('SOLSCAN_API_KEY');
    if (k) window.SOLSCAN_API_KEY = k;
  }
} catch (_) {
  // ignore storage access errors (privacy mode, etc.)
}

function setAudioState(playing) {
  isAudioPlaying = playing;
  if (playing) {
    bgm.play().catch((err) => console.warn('Audio play failed:', err));
    audioBtn.classList.remove('muted');
    audioLabel.classList.add('playing');
    audioLabel.textContent = 'SOUND ON';
    audioIconOn.style.display = 'block';
    audioIconOff.style.display = 'none';
  } else {
    bgm.pause();
    audioBtn.classList.add('muted');
    audioLabel.classList.remove('playing');
    audioLabel.textContent = 'SOUND OFF';
    audioIconOn.style.display = 'none';
    audioIconOff.style.display = 'block';
  }
}

function toggleAudio() {
  setAudioState(!isAudioPlaying);
}

if (audioToggle) {
  audioToggle.addEventListener('click', toggleAudio);
}

const resources = new ResourceLoader(ASSETS);

let gameStartTime = null;
let gameInstance = null;
let lastFrameTime = performance.now();
let frameCount = 0;
let fps = 60;

resources.on('progress', ({ id, itemsLoaded, itemsTotal, percent }) => {
  if (window.updateLoaderProgress) {
    window.updateLoaderProgress(percent);
  }

  if (isDebugMode) {
    console.log(
      `Loaded: "${id}" (${itemsLoaded}/${itemsTotal} — ${percent.toFixed(1)}%)`
    );
  }
});

resources.on('error', ({ id, url, itemsLoaded, itemsTotal }) => {
  console.error(
    `❌ Failed to load "${id}" at "${url}" (${itemsLoaded}/${itemsTotal})`
  );
});

resources.on('loaded', () => {
  if (isDebugMode) {
    console.log(
      Object.keys(resources.items).length
        ? '✅ Assets loaded!'
        : '☑️ No assets to load.'
    );
  }

  if (window.updateLoaderProgress) {
    window.updateLoaderProgress(100);
  }

  setTimeout(() => {
    exploreButtons.classList.add('visible');
  }, 500);

  gameInstance = new Game(
    document.getElementById('three'),
    resources,
    isDebugMode
  );
});

function enterExperience(withMusic) {
  loadingScreen.classList.add('hidden');
  uiLayer.classList.add('visible');
  gameStartTime = Date.now();
  startHUDUpdates();

  setAudioState(withMusic);

  if (window.textGlitch) {
    window.textGlitch.register(document.getElementById('hud-logo'));
    window.textGlitch.register(document.getElementById('hud-telemetry'));
    window.textGlitch.register(document.getElementById('hud-controls'));
    window.textGlitch.register(document.getElementById('hud-status'));
    window.textGlitch.start();
  }
}

if (btnWithMusic) {
  btnWithMusic.addEventListener('click', () => enterExperience(true));
}
if (btnWithoutMusic) {
  btnWithoutMusic.addEventListener('click', () => enterExperience(false));
}

function startHUDUpdates() {
  requestAnimationFrame(updateLoop);
}

function updateLoop(timestamp) {
  frameCount++;
  if (timestamp - lastFrameTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFrameTime = timestamp;
    if (fpsDisplay) fpsDisplay.textContent = fps;
  }

  updateHUD();
  requestAnimationFrame(updateLoop);
}

// Cache DOM references and calculations
let _lastHUDUpdate = 0;
const HUD_UPDATE_INTERVAL = 100; // Update HUD every 100ms instead of every frame


function updateHUD() {
  const now = Date.now();
  if (now - _lastHUDUpdate < HUD_UPDATE_INTERVAL) {
    return; // Skip HUD updates too frequently
  }
  _lastHUDUpdate = now;

  if (gameStartTime && statTime) {
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    const mins = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    statTime.textContent = `${mins}:${secs}`;
  }

  // Simulated telemetry placeholder; hook into real game state for actual values.
  const t = Date.now();

  if (statDepth) {
    const depth = Math.floor(50 + Math.sin(t / 2000) * 30);
    statDepth.textContent = depth;
    if (depthBar) depthBar.style.width = `${(depth / 100) * 100}%`;
  }

  if (statSpeed) {
    const speed = (2 + Math.sin(t / 1500) * 1.5).toFixed(1);
    statSpeed.textContent = speed;
    if (speedBar) speedBar.style.width = `${(speed / 5) * 100}%`;
  }

  if (coordDisplay && gameInstance?.camera?.cameraInstance) {
    const pos = gameInstance.camera.cameraInstance.position;
    coordDisplay.textContent = `X:${pos.x.toFixed(0)} Y:${pos.y.toFixed(
      0
    )} Z:${pos.z.toFixed(0)}`;
  }

  updateTokenHUD(t);
}

// Dexscreener API configuration
const DEXSCREENER_PAIR_ADDRESS = 'j5zxou1heksazdsken9tziyhalzjqdcdhmmsh8nb5epo';
const DEXSCREENER_API_URL = `https://api.dexscreener.com/latest/dex/pairs/solana/${DEXSCREENER_PAIR_ADDRESS}`;

// Token address (from CA)
const TOKEN_ADDRESS = '2hJ9PBjPZv3qZp4W4Akj7cvf3RnRDmEZu6cfBuk6pump';

let tokenData = {
  price: 0,
  marketCap: 0,
  volume24h: 0,
  holders: 0
};

// Fetch token data from Dexscreener API
async function fetchTokenData() {
  try {
    const response = await fetch(DEXSCREENER_API_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0];
      
      tokenData.price = parseFloat(pair.priceUsd) || 0;
      tokenData.marketCap = parseFloat(pair.fdv) || 0; // Fully Diluted Valuation as market cap
      tokenData.volume24h = parseFloat(pair.volume?.h24) || 0;
      
      // Note: Dexscreener API doesn't provide holders count directly
      // Fetch holders from Solscan if API key is available
      if (window.SOLSCAN_API_KEY) {
        await fetchHoldersFromSolscan();
      }
    }
  } catch (error) {
    console.warn('Failed to fetch token data from Dexscreener:', error);
    // Keep existing values on error
  }
}

// Fetch holders count from Solscan API
async function fetchHoldersFromSolscan() {
  try {
    const apiKey = window.SOLSCAN_API_KEY;
    if (!apiKey) return;
    
    // Solscan API endpoint for token holders count
    const response = await fetch(
      `https://public-api.solscan.io/token/holders?tokenAddress=${TOKEN_ADDRESS}&offset=0&size=1`,
      {
        headers: {
          'token': apiKey
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.total === 'number') {
        tokenData.holders = data.total;
      }
    }
  } catch (error) {
    console.warn('Failed to fetch holders from Solscan:', error);
  }
}

// Format number with appropriate decimals and K/M/B suffixes
function formatNumber(num, decimals = 2) {
  if (num === 0) return '0';
  if (num < 0.000001) return num.toExponential(2);
  if (num < 1) return num.toFixed(6);
  if (num < 1000) return num.toFixed(decimals);
  if (num < 1000000) return (num / 1000).toFixed(2) + 'K';
  if (num < 1000000000) return (num / 1000000).toFixed(2) + 'M';
  return (num / 1000000000).toFixed(2) + 'B';
}

function formatPrice(price) {
  if (price === 0) return '$0.000000';
  if (price < 0.000001) return '$' + price.toExponential(2);
  if (price < 1) return '$' + price.toFixed(6);
  return '$' + formatNumber(price, 2);
}

function updateTokenHUD(timeMs) {
  // Update UI with fetched token data
  if (tokenPriceEl) tokenPriceEl.textContent = formatPrice(tokenData.price);
  if (tokenMcapEl) tokenMcapEl.textContent = '$' + formatNumber(tokenData.marketCap);
  if (tokenVolEl) tokenVolEl.textContent = '$' + formatNumber(tokenData.volume24h);
  if (tokenHoldersEl) tokenHoldersEl.textContent = tokenData.holders > 0 ? formatNumber(tokenData.holders, 0) : '0';
}

// Fetch token data on load and then every 30 seconds
fetchTokenData();
setInterval(fetchTokenData, 30000); // Update every 30 seconds

// Placeholder links; plug real URLs
if (btnBuy) btnBuy.href = 'https://dexscreener.com/solana/j5zxou1heksazdsken9tziyhalzjqdcdhmmsh8nb5epo';
if (btnChart) btnChart.href = '#';
if (quickX) quickX.href = 'https://x.com/cyberwhalesol';
