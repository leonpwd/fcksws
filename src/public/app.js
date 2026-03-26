let selectedRoom = null;
let selectedRoomName = null;
let ws = null;
let videoStream = null;
let scanningInterval = null;
let roomsRefreshInterval = null;
let currentZoom = 1;
let minZoom = 1;
let maxZoom = 1;

// QR detection stabilization
let qrDetectionTimer = null;
let qrLostTimer = null;
let isQrStable = false;

// Generate a random room ID
function generateRoomId() {
  return 'room_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

function showStep(stepId) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  const step = document.getElementById(stepId);
  step.classList.add('active');
  // Trigger animation
  step.classList.remove('animate-fade-in');
  void step.offsetWidth; // Force reflow
  step.classList.add('animate-fade-in');
  
  // Stop room refresh when leaving join screen
  if (stepId !== 'step2-join' && roomsRefreshInterval) {
    clearInterval(roomsRefreshInterval);
    roomsRefreshInterval = null;
  }
}

function selectMode(mode) {
  if (mode === 'scanner') {
    showStep('step2-create');
  } else {
    showStep('step2-join');
    refreshRooms();
    // Auto-refresh every 2 seconds
    if (roomsRefreshInterval) clearInterval(roomsRefreshInterval);
    roomsRefreshInterval = setInterval(refreshRooms, 2000);
  }
}

function createRoom() {
  const input = document.getElementById('roomNameInput');
  const name = input.value.trim();
  
  if (name.length < 2) {
    alert('Veuillez entrer un nom de room (minimum 2 caractères)');
    return;
  }
  
  selectedRoom = generateRoomId();
  selectedRoomName = name;
  document.getElementById('roomName').textContent = name;
  showStep('step3-scanner');
  startScanner();
}

async function refreshRooms() {
  const roomsList = document.getElementById('roomsList');
  
  // Don't show loading on refresh if rooms already displayed
  const hasContent = roomsList.children.length > 0 && !roomsList.textContent.includes('Chargement');
  if (!hasContent) {
    roomsList.innerHTML = '<div class="text-center py-4 text-ctp-subtext text-sm">Chargement...</div>';
  }
  
  try {
    const response = await fetch('/api/rooms');
    const rooms = await response.json();
    
    if (rooms.length === 0) {
      roomsList.innerHTML = '<div class="text-center py-8 text-ctp-subtext text-sm">Aucune room disponible<br/><span class="text-xs mt-2 block">La liste se met à jour automatiquement</span></div>';
      return;
    }
    
    roomsList.innerHTML = rooms.map(room => `
      <button onclick="joinRoom('${room.id}', '${room.name.replace(/'/g, "\\'")}')" 
        class="w-full bg-white hover:bg-ctp-mantle/30 border-2 border-ctp-crust hover:border-ctp-text/30 rounded-xl p-4 transition-all duration-200 text-left">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold text-ctp-text">${room.name}</p>
            <p class="text-xs text-ctp-subtext mt-1">${room.members} membre${room.members > 1 ? 's' : ''}</p>
          </div>
          <div class="text-2xl">→</div>
        </div>
      </button>
    `).join('');
  } catch (err) {
    if (!hasContent) {
      roomsList.innerHTML = '<div class="text-center py-8 text-red-600 text-sm">Erreur de chargement</div>';
    }
    console.error('Error fetching rooms:', err);
  }
}

function joinRoom(roomId, roomName) {
  // Stop auto-refresh
  if (roomsRefreshInterval) {
    clearInterval(roomsRefreshInterval);
    roomsRefreshInterval = null;
  }
  
  selectedRoom = roomId;
  selectedRoomName = roomName;
  document.getElementById('roomNameDisplay').textContent = roomName;
  showStep('step3-receiver');
  startReceiver();
}

function goBack(step) {
  showStep('step' + step);
}

// Scanner mode
async function startScanner() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('qrCanvas');
  const overlayCanvas = document.getElementById('overlayCanvas');
  const zoomControls = document.getElementById('zoomControls');
  const status = document.getElementById('scanStatus');
  
  // Check if getUserMedia is available
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = '✗ Erreur: Caméra non accessible. Utilisez HTTPS ou vérifiez les permissions.';
    status.className = 'text-center py-3 px-4 rounded-xl mb-4 bg-red-50 text-red-800 text-sm font-medium border border-red-200';
    console.error('getUserMedia not supported. Make sure you are using HTTPS or localhost.');
    return;
  }
  
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } 
    });
    video.srcObject = videoStream;
    video.style.display = 'block';
    
    // Get zoom capabilities
    const videoTrack = videoStream.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
    
    if (capabilities.zoom) {
      minZoom = capabilities.zoom.min;
      maxZoom = capabilities.zoom.max;
      currentZoom = videoTrack.getSettings().zoom || minZoom;
      
      // Show zoom controls if zoom is supported
      zoomControls.style.display = 'flex';
      updateZoomDisplay();
      
      console.log(`Zoom support: ${minZoom}x - ${maxZoom}x`);
    } else {
      console.log('Zoom not supported on this device');
    }
    
    // Connect WebSocket as scanner
    connectWS(true);
    
    // Start scanning
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Match overlay canvas to video actual dimensions
      overlayCanvas.width = video.videoWidth;
      overlayCanvas.height = video.videoHeight;
      overlayCanvas.style.display = 'block';
      
      console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);
      console.log('Overlay canvas ready');
      
      scanQRCode();
    });
    
    status.textContent = '✓ Caméra activée. Positionnez le QR code...';
    status.className = 'text-center py-3 px-4 rounded-xl mb-4 bg-ctp-text/10 text-ctp-text text-sm font-medium border border-ctp-text/20';
  } catch (err) {
    status.textContent = '✗ Erreur: ' + err.message;
    status.className = 'text-center py-3 px-4 rounded-xl mb-4 bg-red-50 text-red-800 text-sm font-medium border border-red-200';
  }
}

function scanQRCode() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('qrCanvas');
  const overlayCanvas = document.getElementById('overlayCanvas');
  const status = document.getElementById('scanStatus');
  const ctx = canvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');
  
  scanningInterval = setInterval(() => {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      // Clear overlay
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      
      if (code) {
        console.log('QR detected!', code.data.substring(0, 30));
        
        // Cancel any pending "lost" timer
        if (qrLostTimer) {
          clearTimeout(qrLostTimer);
          qrLostTimer = null;
        }
        
        // Start detection timer if not already stable
        if (!isQrStable && !qrDetectionTimer) {
          qrDetectionTimer = setTimeout(() => {
            console.log('QR detection stabilized - applying morph effect');
            const videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
              videoContainer.classList.add('video-morphed');
            }
            isQrStable = true;
            qrDetectionTimer = null;
          }, 300); // Wait 300ms for stable detection
        }
        
        // Draw detection box
        const location = code.location;
        overlayCtx.beginPath();
        overlayCtx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
        overlayCtx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
        overlayCtx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
        overlayCtx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
        overlayCtx.lineTo(location.topLeftCorner.x, location.topLeftCorner.y);
        overlayCtx.lineWidth = 4;
        overlayCtx.strokeStyle = '#40a02b';
        overlayCtx.stroke();
        
        // Draw corner dots
        [location.topLeftCorner, location.topRightCorner, location.bottomLeftCorner, location.bottomRightCorner].forEach(corner => {
          overlayCtx.beginPath();
          overlayCtx.arc(corner.x, corner.y, 8, 0, 2 * Math.PI);
          overlayCtx.fillStyle = '#40a02b';
          overlayCtx.fill();
        });
        
        // Draw text background
        const text = code.data.length > 40 ? code.data.substring(0, 40) + '...' : code.data;
        overlayCtx.font = 'bold 16px system-ui';
        const textMetrics = overlayCtx.measureText(text);
        const textX = location.bottomLeftCorner.x;
        const textY = location.bottomLeftCorner.y + 30;
        
        overlayCtx.fillStyle = 'rgba(64, 160, 43, 0.9)';
        overlayCtx.fillRect(textX - 5, textY - 20, textMetrics.width + 10, 28);
        
        // Draw text
        overlayCtx.fillStyle = '#ffffff';
        overlayCtx.fillText(text, textX, textY);
        
        status.textContent = '✓ QR détecté: ' + code.data.substring(0, 30) + '...';
        status.className = 'text-center py-3 px-4 rounded-xl mb-4 bg-ctp-text text-white text-sm font-medium';
        
        // Send via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'qr', data: code.data }));
        }
      } else {
        // Cancel any pending detection timer
        if (qrDetectionTimer) {
          clearTimeout(qrDetectionTimer);
          qrDetectionTimer = null;
        }
        
        // Start "lost" timer if currently stable
        if (isQrStable && !qrLostTimer) {
          qrLostTimer = setTimeout(() => {
            console.log('QR lost - starting outro animation');
            const videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
              // Remove intro class and add outro class
              videoContainer.classList.remove('video-morphed');
              videoContainer.classList.add('video-morphing-out');
              
              // Clean up after outro animation
              setTimeout(() => {
                videoContainer.classList.remove('video-morphing-out');
              }, 800); // Match outro animation duration
            }
            isQrStable = false;
            qrLostTimer = null;
          }, 500); // Wait 500ms before removing effect
        }
      }
    }
  }, 100); // Scan every 100ms
}

function stopScanner() {
  if (scanningInterval) {
    clearInterval(scanningInterval);
    scanningInterval = null;
  }
  
  // Clean up QR detection timers
  if (qrDetectionTimer) {
    clearTimeout(qrDetectionTimer);
    qrDetectionTimer = null;
  }
  if (qrLostTimer) {
    clearTimeout(qrLostTimer);
    qrLostTimer = null;
  }
  
  // Reset QR detection state
  isQrStable = false;
  
  // Remove morphing effect
  const videoContainer = document.getElementById('videoContainer');
  if (videoContainer) {
    videoContainer.classList.remove('video-morphed', 'video-morphing-out');
  }
  
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  
  // Hide zoom controls
  const zoomControls = document.getElementById('zoomControls');
  if (zoomControls) {
    zoomControls.style.display = 'none';
  }
  
  // Reset zoom
  currentZoom = 1;
  minZoom = 1;
  maxZoom = 1;
  
  disconnectWS();
}

// Zoom functions
async function adjustZoom(direction) {
  if (!videoStream) return;
  
  const videoTrack = videoStream.getVideoTracks()[0];
  const capabilities = videoTrack.getCapabilities();
  
  if (!capabilities.zoom) return;
  
  // Calculate step (divide range by 4 for smooth steps)
  const step = (maxZoom - minZoom) / 4;
  
  // Adjust zoom
  currentZoom += direction * step;
  currentZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom));
  
  try {
    await videoTrack.applyConstraints({
      advanced: [{ zoom: currentZoom }]
    });
    updateZoomDisplay();
    console.log('Zoom set to:', currentZoom);
  } catch (err) {
    console.error('Error applying zoom:', err);
  }
}

function updateZoomDisplay() {
  const zoomDisplay = document.getElementById('zoomLevel');
  if (zoomDisplay) {
    zoomDisplay.textContent = currentZoom.toFixed(1) + 'x';
  }
}

// Receiver mode
function startReceiver() {
  const status = document.getElementById('receiveStatus');
  status.textContent = 'Connexion...';
  status.className = 'text-center py-3 px-4 rounded-xl mb-4 bg-ctp-mantle text-ctp-subtext text-sm animate-pulse';
  
  connectWS(false);
}

// WebSocket connection
function connectWS(isScanner = false) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?room=${selectedRoom}&name=${encodeURIComponent(selectedRoomName)}&scanner=${isScanner}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected to room', selectedRoomName);
    const status = document.getElementById('receiveStatus');
    if (status) {
      status.textContent = 'Connecté. En attente qu\'un QR soit scanné...';
      status.className = 'text-center py-3 px-4 rounded-xl mb-4 bg-ctp-text/10 text-ctp-text text-sm font-medium border border-ctp-text/20';
    }
  };
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'qr') {
        displayQRCode(message.data);
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    const status = document.getElementById('receiveStatus');
    if (status) {
      status.textContent = '✗ Erreur de connexion';
      status.className = 'text-center py-3 px-4 rounded-xl mb-4 bg-red-50 text-red-800 text-sm font-medium border border-red-200';
    }
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
  };
}

function disconnectWS() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

// Display QR code
function displayQRCode(data) {
  const qrDisplay = document.getElementById('qrDisplay');
  const status = document.getElementById('receiveStatus');
  const title = document.getElementById('receiverTitle');
  
  try {
    // Update title
    if (title) {
      title.innerHTML = '<span class="text-xl">📱</span> QR code reçu';
    }
    
    // Clear previous QR code
    qrDisplay.innerHTML = '<div id="qrcode"></div>';
    
    // Generate new QR code with minimal margins
    QRCode.toCanvas(document.getElementById('qrcode'), data, {
      width: 256,
      margin: 1, // Minimal margin - approximately 5 pixels for a 256px QR code
      color: {
        dark: '#4c4f69',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    }, function (error) {
      if (error) throw error;
    });
    
    qrDisplay.classList.remove('hidden');
    qrDisplay.classList.add('animate-fade-in');
    status.textContent = '✓ QR code reçu et affiché';
    status.className = 'text-center py-3 px-4 rounded-xl mb-4 bg-ctp-text text-white text-sm font-medium';
    
    console.log('QR updated:', data.substring(0, 50));
  } catch (err) {
    status.textContent = '✗ Erreur génération QR: ' + err.message;
    status.className = 'text-center py-3 px-4 rounded-xl mb-4 bg-red-50 text-red-800 text-sm font-medium border border-red-200';
  }
}
