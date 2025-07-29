// main.js

// --- Timer Logic ---
let seconds = 0;
let timerInterval = null;
let timerEl = null;

const MAX_CALL_DURATION = 5 * 60; // 5 minutes in seconds

function startTimer() {
  if (!timerEl) {
    timerEl = document.getElementById('call-timer');
    if (!timerEl) return;
  }
  
  timerInterval = setInterval(() => {
    seconds++;
    const min = String(Math.floor(seconds / 60)).padStart(2, '0');
    const sec = String(seconds % 60).padStart(2, '0');
    timerEl.textContent = `${min}:${sec}`;
    
    // Check if call duration limit reached
    if (seconds >= MAX_CALL_DURATION) {
      console.log('Call duration limit reached (5 minutes). Ending call...');
      stopTimer();
      closeWebSocket();
      if (typeof goBack === 'function') {
        goBack();
      } else {
        window.location.href = 'index.html';
      }
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

// --- Mic State & UI ---
let micOn = true;
let micStatusEl = null;
let callCircle = null;
let micIcon = null;
let muteBtn = null;
let endBtn = null;

function updateMicUI() {
  // Get elements from the call screen
  micStatusEl = document.getElementById('mic-status');
  callCircle = document.getElementById('call-circle');
  micIcon = document.getElementById('mic-icon');
  muteBtn = document.getElementById('mute-btn');
  endBtn = document.getElementById('end-btn');
  
  if (!micStatusEl || !callCircle || !micIcon || !muteBtn) return;
  
  if (micOn) {
    micStatusEl.textContent = 'Mic On';
    micStatusEl.className = 'text-xs font-medium text-green-400';
    callCircle.classList.add('border-green-400/50', 'shadow-green-400/20');
    callCircle.classList.remove('border-red-400/50', 'shadow-red-400/20');
    micIcon.className = 'fas fa-microphone text-4xl sm:text-5xl md:text-6xl text-white';
    
    // Update mute button if it exists
    const muteIcon = muteBtn.querySelector('i');
    if (muteIcon) {
      muteIcon.className = 'fas fa-microphone text-white text-lg';
    }
  } else {
    micStatusEl.textContent = 'Mic Off';
    micStatusEl.className = 'text-xs font-medium text-red-400';
    callCircle.classList.remove('border-green-400/50', 'shadow-green-400/20');
    callCircle.classList.add('border-red-400/50', 'shadow-red-400/20');
    micIcon.className = 'fas fa-microphone-slash text-4xl sm:text-5xl md:text-6xl text-red-400';
    
    // Update mute button if it exists
    const muteIcon = muteBtn.querySelector('i');
    if (muteIcon) {
      muteIcon.className = 'fas fa-microphone-slash text-red-400 text-lg';
    }
  }
}

// Mute functionality removed

// Spacebar mute functionality removed

// --- Character Switcher ---
function switchCharacter() {
  // Toggle between Maya and Miles
  if (typeof window !== 'undefined' && window.CHARACTER !== undefined) {
    window.CHARACTER = window.CHARACTER === "Maya" ? "Miles" : "Maya";
    console.log(`[>] Switched to character: ${window.CHARACTER}`);
  }
  
  // If currently connected, reconnect with new character
  if (ws && ws.readyState === 1) {
    console.log('[>] Reconnecting with new character...');
    closeWebSocket();
    setTimeout(() => {
      loadToken(); // This will reconnect with the new character
    }, 1000);
  }
}

// --- WebSocket Setup ---
// JWT will be loaded from token.txt file
let ID_TOKEN = ""; // Will be loaded from token.txt
let CHARACTER = "Maya"; // Current character (can be "Maya" or "Miles")
const TIMEZONE = "Africa/Johannesburg";

// Function to load token from token.txt
async function loadToken() {
  try {
    const response = await fetch('token.txt');
    if (!response.ok) {
      throw new Error(`Failed to load token: ${response.status}`);
    }
    ID_TOKEN = (await response.text()).trim();
    console.log('[+] Token loaded from token.txt');
    
    // Update WebSocket URL with loaded token and current character
    const currentCharacter = (typeof window !== 'undefined' && window.CHARACTER) ? window.CHARACTER : CHARACTER;
    console.log('[DEBUG] Character being used for WebSocket:', currentCharacter);
    console.log('[DEBUG] window.CHARACTER:', window.CHARACTER);
    console.log('[DEBUG] fallback CHARACTER:', CHARACTER);
    console.log('[DEBUG] typeof window:', typeof window);
    console.log('[DEBUG] window.CHARACTER type:', typeof window.CHARACTER);
    
    const WS_URL = `wss://sesameai.app/agent-service-0/v1/connect` +
      `?id_token=${encodeURIComponent(ID_TOKEN)}` +
      `&client_name=Consumer-Web-App` +
      `&usercontext=${encodeURIComponent(JSON.stringify({ timezone: TIMEZONE }))}` +
      `&character=${currentCharacter}`;
    
    console.log('[DEBUG] WebSocket URL:', WS_URL);
    console.log('[DEBUG] Character parameter in URL:', currentCharacter);
    
    // Start WebSocket connection
    openWebSocket(WS_URL);
  } catch (error) {
    console.error('[-] Failed to load token:', error);
    document.body.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div class="text-center">
          <h1 class="text-2xl font-bold mb-4">Token Error</h1>
          <p class="text-red-400 mb-4">Failed to load token from token.txt</p>
          <p class="text-gray-400">Please ensure token.txt exists and contains a valid JWT token.</p>
        </div>
      </div>
    `;
  }
}

// --- WebRTC Variables ---
let ws = null;
let audioContext = null;
let micStream = null;
let peerConnection = null;
let remoteAudio = null;
let iceServers = [];
let pendingCandidates = [];
let webrtcReady = false;

function openWebSocket(url) {
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = async () => {
    console.log('[+] Connected to Sesame AI (Voice)');
    
    // Show connected state
    if (typeof window.showConnectedState === 'function') {
      window.showConnectedState();
    }
    
    // Start timer when connected
    startTimer();
    
    // 1. Send client_location_state (mimic official client)
    ws.send(JSON.stringify({
      type: "client_location_state",
      session_id: null, // will be filled after initialize
      call_id: null,
      content: {
        latitude: 0,
        longitude: 0,
        address: "",
        timezone: TIMEZONE
      }
    }));
    // The rest of the flow will be handled in ws.onmessage after receiving 'initialize' and 'webrtc_config'.
  };

  // --- WebSocket message handler ---
  ws.onmessage = async (event) => {
    if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data);
        console.log('[<] Non-binary message (parsed):', msg);
        // Save session_id and call_id for later use
        if (msg.type === 'initialize') {
          ws._session_id = msg.session_id;
        }
        // Handle webrtc_config and call_connect
        if (msg.type === 'webrtc_config' && msg.content && msg.content.ice_servers) {
          iceServers = msg.content.ice_servers.map(s => ({
            urls: s.urls,
            username: s.username,
            credential: s.credential
          }));
          await setupWebRTC();
        }
        // Handle WebRTC offer/answer
        if (msg.type === 'webrtc_offer' && msg.content && msg.content.sdp) {
          if (!peerConnection) await setupWebRTC();
          console.log('[WebRTC] setRemoteDescription (offer)');
          await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.content.sdp }));
          const answer = await peerConnection.createAnswer({ offerToReceiveAudio: true });
          console.log('[WebRTC] setLocalDescription (answer)');
          await peerConnection.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'webrtc_answer', content: { sdp: answer.sdp } }));
          console.log('[WebRTC] Sent answer:', answer.sdp);
        }
        if (msg.type === 'webrtc_ice_candidate' && msg.content && msg.content.candidate) {
          if (peerConnection) {
            try {
              await peerConnection.addIceCandidate(msg.content.candidate);
            } catch (e) {
              pendingCandidates.push(msg.content.candidate);
            }
          } else {
            pendingCandidates.push(msg.content.candidate);
          }
        }
        // After receiving both initialize and webrtc_config, send call_connect
        if (ws._session_id && msg.type === 'webrtc_config' && msg.content && msg.content.ice_servers) {
          // Compose call_connect payload as seen in logs
          const clientMetadata = {
            user_agent: navigator.userAgent,
            mobile_browser: /Mobi|Android/i.test(navigator.userAgent),
            language: navigator.language,
            media_devices: (await navigator.mediaDevices.enumerateDevices()).map(d => ({
              deviceId: d.deviceId,
              kind: d.kind,
              label: d.label,
              groupId: d.groupId
            }))
          };
          // Optionally, you can generate a local SDP offer if needed
          let webrtc_offer_sdp = null;
          if (peerConnection) {
            const offer = await peerConnection.createOffer({ offerToReceiveAudio: true });
            await peerConnection.setLocalDescription(offer);
            webrtc_offer_sdp = offer.sdp;
          }
          ws.send(JSON.stringify({
            type: "call_connect",
            session_id: ws._session_id,
            call_id: null,
            request_id: crypto.randomUUID(),
            content: {
              sample_rate: 48000,
              audio_codec: "none",
              reconnect: false,
              is_private: false,
              settings: { character: (typeof window !== 'undefined' && window.CHARACTER) ? window.CHARACTER : CHARACTER },
              client_name: "Consumer-Web-App",
              client_metadata: clientMetadata,
              webrtc_offer_sdp
            }
          }));
        }
        // Handle call_connect_response (set remote description for WebRTC)
        if (msg.type === 'call_connect_response' && msg.content && msg.content.webrtc_answer_sdp) {
          if (peerConnection) {
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription({ type: 'answer', sdp: msg.content.webrtc_answer_sdp })
            );
            console.log('[WebRTC] setRemoteDescription (answer)');
          }
          ws._call_id = msg.call_id;
          
          // Send name change prompt after call is connected
          setTimeout(() => {
            // sendNameChangePrompt(); // Removed Aliyah prompting
          }, 1000); // Wait 1 second for connection to stabilize
        }
        // Handle call_connect_response (optional, for call_id)
        if (msg.type === 'call_connect_response') {
          ws._call_id = msg.call_id;
        }
        
        // Debug chat messages to see assistant responses
        if (msg.type === 'chat' && msg.content && msg.content.messages) {
          console.log('[<] Chat messages received:', msg.content.messages);
          // Log any text responses from the assistant
          msg.content.messages.forEach((message, index) => {
            if (message.role === 'assistant' && message.content) {
              console.log(`[<] Assistant response ${index}:`, message.content);
            }
          });
        }
      } catch (e) {
        console.log('[<] Non-binary message (raw):', event.data);
      }
      return;
    }
    // No binary audio expected in WebRTC mode
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };

  ws.onclose = () => {
    console.log('[-] Connection closed');
    stopMicStream();
    closeWebRTC();
  };
}

function closeWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

// --- WebRTC Setup ---
async function setupWebRTC() {
  if (peerConnection) return;
  // Add fallback STUN server
  const fallbackIce = [
    { urls: 'stun:stun.l.google.com:19302' },
    ...iceServers
  ];
  peerConnection = new RTCPeerConnection({ iceServers: fallbackIce });
  webrtcReady = true;

  // Handle ICE candidates from browser
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'webrtc_ice_candidate', content: { candidate: event.candidate } }));
    }
  };

  // Handle remote audio track
  peerConnection.ontrack = (event) => {
    console.log('[WebRTC] Remote track received:', event);
    if (!remoteAudio) {
      remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudio.style.display = 'none';
      document.body.appendChild(remoteAudio);
    }
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.volume = 1.0;
    remoteAudio.onloadedmetadata = () => {
      remoteAudio.play().catch(err => console.error('Auto-play blocked:', err));
    };
    // Log tracks
    if (remoteAudio.srcObject) {
      console.log('[WebRTC] Remote audio tracks:', remoteAudio.srcObject.getTracks());
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('[WebRTC] Connection state:', peerConnection.connectionState);
  };
  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', peerConnection.iceConnectionState);
  };

  // Add mic stream if available and mic is on
  if (micOn) {
    await startMicStream();
  }

  // Add any pending ICE candidates
  for (const cand of pendingCandidates) {
    try { await peerConnection.addIceCandidate(cand); } catch (e) {}
  }
  pendingCandidates = [];
}

function closeWebRTC() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (remoteAudio) {
    remoteAudio.srcObject = null;
    remoteAudio.remove();
    remoteAudio = null;
  }
  webrtcReady = false;
}

// --- Mic Capture and Streaming (WebRTC) ---
async function startMicStream() {
  if (!webrtcReady || !peerConnection) return;
  
  // If micStream exists but was disabled, just re-enable it
  if (micStream) {
    const senders = peerConnection.getSenders();
    senders.forEach(sender => {
      if (sender.track && sender.track.kind === 'audio') {
        sender.track.enabled = true;
      }
    });
    console.log('[WebRTC] Mic stream re-enabled');
    return;
  }
  
  // Create new mic stream if it doesn't exist
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 }, video: false });
  for (const track of micStream.getAudioTracks()) {
    peerConnection.addTrack(track, micStream);
  }
  console.log('[WebRTC] Mic stream added:', micStream);
  // Log senders to confirm mic is attached
  console.log('[WebRTC] Senders after mic attach:', peerConnection.getSenders().map(s => s.track?.kind));
}

function stopMicStream() {
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  // Only remove local mic tracks, not remote audio tracks
  if (peerConnection) {
    const senders = peerConnection.getSenders();
    senders.forEach(sender => {
      if (sender.track && sender.track.kind === 'audio' && sender.track.enabled) {
        // Only disable the track instead of removing it completely
        sender.track.enabled = false;
      }
    });
  }
}

// --- Audio Playback (handled by remoteAudio element) ---
// No need for playPcmAudio in WebRTC mode

// Fetch Sesame user info from REST API using JWT
async function fetchSesameUser(jwt) {
  const response = await fetch('https://app.sesame.com/api/external/user', {
    headers: {
      'Authorization': `Bearer ${jwt}`
    }
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const data = await response.json();
  console.log('Sesame user info:', data);
  return data;
}

// Send custom prompt to the assistant
function sendCustomPrompt(promptText) {
  if (!ws || ws.readyState !== 1) {
    console.error('WebSocket not connected');
    return;
  }
  ws.send(JSON.stringify({
    type: "chat",
    session_id: ws._session_id || null,
    call_id: ws._call_id || null,
    content: { text: promptText }
  }));
  console.log('[>] Sent custom prompt:', promptText);
}

// Send system message to change assistant's name
function sendNameChangePrompt() {
  // Removed Aliyah prompting
}

// Global function to manually trigger name change (for testing)
window.changeAssistantName = function(newName) {
  // Removed Aliyah prompting
};

// Test function to see what the assistant says about its name
window.testAssistantName = function() {
  // Removed Aliyah prompting
};

// Global function to send custom prompts (for testing)
window.sendPrompt = function(promptText) {
  // Removed Aliyah prompting
};

// Initialize elements when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Get elements
  timerEl = document.getElementById('call-timer');
  micStatusEl = document.getElementById('mic-status');
  callCircle = document.getElementById('call-circle');
  micIcon = document.getElementById('mic-icon');
  muteBtn = document.getElementById('mute-btn');
  endBtn = document.getElementById('end-btn');
  
  // Mute button functionality removed
  
  if (endBtn) {
    endBtn.addEventListener('click', () => {
      stopTimer();
      micOn = false;
      updateMicUI();
      if (micStatusEl) {
        micStatusEl.textContent = 'Call Ended';
        micStatusEl.className = 'text-xs font-medium text-gray-400';
      }
      if (callCircle) {
        callCircle.classList.remove('border-green-400/50', 'border-red-400/50', 'shadow-green-400/20', 'shadow-red-400/20');
        callCircle.classList.add('opacity-50', 'border-gray-400/50');
        callCircle.classList.remove('floating-animation');
      }
      stopMicStream();
      closeWebSocket();
      
      // Return to dashboard
      if (typeof showDashboard === 'function') {
        showDashboard();
      }
    });
  }
  
  // Initialize UI
  updateMicUI();
});

// Make CHARACTER available globally
window.CHARACTER = CHARACTER; 