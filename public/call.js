const $ = id => document.getElementById(id);
let ws = null;
let stream = null;
let facing = 'user';
let myPeerId = null;
let myRole = 'admin'; // 'admin' or 'client'
let currentRoom = null;

// Map<peerId, { pc: RTCPeerConnection, role: string, videoCard: HTMLElement, videoEl: HTMLVideoElement }>
const peers = new Map();

const status = msg => $('status').textContent = msg;

// Auto-fill signaling server URL
const savedSignal = localStorage.getItem('signal');
if (savedSignal) {
  $('server').value = savedSignal;
} else if (location.protocol === 'http:' || location.protocol === 'https:') {
  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (location.host && location.host !== 'appassets.androidplatform.net') {
    $('server').value = `${wsProtocol}//${location.host}`;
  } else {
    $('server').value = 'wss://appweb-qnpe.onrender.com';
  }
} else {
  $('server').value = 'wss://appweb-qnpe.onrender.com';
}
$('room').value = localStorage.getItem('room') || '';

window.selectRole = function(role) {
  myRole = role;
  if (role === 'admin') {
    $('role-admin').classList.add('active');
    $('role-client').classList.remove('active');
    $('action-btn').textContent = 'Create Room (Admin)';
  } else {
    $('role-client').classList.add('active');
    $('role-admin').classList.remove('active');
    $('action-btn').textContent = 'Join Room (Client)';
  }
};

const send = (type, data = {}) => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type, ...data }));
  }
};

async function openCamera() {
  if (stream) return stream;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { facingMode: facing }
  });
  $('local').srcObject = stream;
  return stream;
}

function createPeerConnection(peerId, peerRole, isInitiator) {
  if (peers.has(peerId)) {
    return peers.get(peerId).pc;
  }

  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  const videoCard = document.createElement('div');
  videoCard.className = 'video-card';
  videoCard.id = `card-${peerId}`;

  const videoEl = document.createElement('video');
  videoEl.autoplay = true;
  videoEl.playsInline = true;

  const labelEl = document.createElement('div');
  labelEl.className = 'video-label';
  labelEl.textContent = `${peerRole === 'admin' ? 'Admin' : 'Client'} (${peerId.slice(-4)})`;

  videoCard.appendChild(videoEl);
  videoCard.appendChild(labelEl);
  $('grid').appendChild(videoCard);

  if (stream) {
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  }

  pc.ontrack = ev => {
    videoEl.srcObject = ev.streams[0];
  };

  pc.onicecandidate = ev => {
    if (ev.candidate) {
      send('candidate', { target: peerId, payload: ev.candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected'].includes(pc.connectionState)) {
      status(`Participant ${peerId.slice(-4)} connection: ${pc.connectionState}`);
    }
  };

  peers.set(peerId, { pc, role: peerRole, videoCard, videoEl });

  if (isInitiator) {
    pc.createOffer().then(offer => {
      return pc.setLocalDescription(offer);
    }).then(() => {
      send('offer', { target: peerId, payload: pc.localDescription });
    }).catch(err => status('Offer error: ' + err.message));
  }

  return pc;
}

function removePeer(peerId) {
  if (peers.has(peerId)) {
    const p = peers.get(peerId);
    p.pc.close();
    if (p.videoCard && p.videoCard.parentNode) {
      p.videoCard.parentNode.removeChild(p.videoCard);
    }
    peers.delete(peerId);
  }
}

async function handleSignal(data) {
  const { type, peerId, role, room, peers: existingPeers, sender, payload, message } = data;

  if (type === 'error') {
    status('Error: ' + message);
    if (ws) { ws.close(); ws = null; }
    return;
  }

  if (type === 'created' || type === 'joined') {
    myPeerId = peerId;
    currentRoom = room;
    $('local-label').textContent = `My Camera (${myRole === 'admin' ? 'Admin' : 'Client'})`;

    const count = existingPeers.length + 1;
    status(`In room "${room}" as ${myRole.toUpperCase()} (${count}/4 participants)`);

    existingPeers.forEach(p => {
      createPeerConnection(p.peerId, p.role, true);
    });
  }

  if (type === 'peer-joined') {
    const totalCount = peers.size + 2;
    status(`New ${role.toUpperCase()} joined (${peerId.slice(-4)}). Total participants: ${totalCount}/4`);
    createPeerConnection(peerId, role, false);
  }

  if (type === 'offer') {
    let pc = peers.get(sender)?.pc;
    if (!pc) {
      pc = createPeerConnection(sender, sender.startsWith('admin') ? 'admin' : 'client', false);
    }
    await pc.setRemoteDescription(payload);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send('answer', { target: sender, payload: pc.localDescription });
  }

  if (type === 'answer') {
    const p = peers.get(sender);
    if (p && p.pc) {
      await p.pc.setRemoteDescription(payload);
    }
  }

  if (type === 'candidate') {
    const p = peers.get(sender);
    if (p && p.pc) {
      await p.pc.addIceCandidate(payload).catch(console.warn);
    }
  }

  if (type === 'peer-left') {
    removePeer(peerId);
    const totalCount = peers.size + 1;
    status(`Participant (${peerId.slice(-4)}) left. Total participants: ${totalCount}/4`);
  }
}

$('action-btn').onclick = async () => {
  if (ws) {
    status('Already in a room. Leave call before creating/joining another room.');
    return;
  }

  const url = $('server').value.trim();
  const room = $('room').value.trim();

  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    status('Server URL must start with ws:// or wss://');
    return;
  }

  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(room)) {
    status('Room code must be 4–64 letters or numbers');
    return;
  }

  try {
    status('Requesting camera & microphone access…');
    await openCamera();

    localStorage.setItem('signal', url);
    localStorage.setItem('room', room);

    ws = new WebSocket(url);

    ws.onopen = () => {
      if (myRole === 'admin') {
        status(`Creating room "${room}" as Admin…`);
        send('create-room', { room });
      } else {
        status(`Joining room "${room}" as Client…`);
        send('join-room', { room });
      }
    };

    ws.onmessage = e => {
      try {
        Promise.resolve(handleSignal(JSON.parse(e.data))).catch(err => status(err.message));
      } catch (err) {
        status(err.message);
      }
    };

    ws.onerror = () => status('Cannot connect to signaling server at ' + url);

    ws.onclose = () => {
      ws = null;
      peers.forEach((_, id) => removePeer(id));
      status('Server connection closed.');
    };
  } catch (err) {
    status('Camera/Microphone error: ' + err.message);
  }
};

function endCall() {
  if (ws) {
    send('hangup');
    ws.close();
    ws = null;
  }
  peers.forEach((_, id) => removePeer(id));
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  $('local').srcObject = null;
  status('Call ended.');
}

$('hang').onclick = endCall;

$('mute').onclick = () => {
  if (!stream) return;
  const t = stream.getAudioTracks()[0];
  if (t) {
    t.enabled = !t.enabled;
    $('mute').textContent = t.enabled ? 'Mute mic' : 'Unmute mic';
  }
};

$('camera').onclick = () => {
  if (!stream) return;
  const t = stream.getVideoTracks()[0];
  if (t) {
    t.enabled = !t.enabled;
    $('camera').textContent = t.enabled ? 'Camera off' : 'Camera on';
  }
};

$('flip').onclick = async () => {
  if (!stream) return;
  facing = facing === 'user' ? 'environment' : 'user';
  const old = stream.getVideoTracks()[0];
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: false
    });
    const replacement = newStream.getVideoTracks()[0];

    peers.forEach(p => {
      const sender = p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(replacement);
    });

    stream.removeTrack(old);
    old.stop();
    stream.addTrack(replacement);
    $('local').srcObject = stream;
  } catch (err) {
    status('Camera switch failed: ' + err.message);
  }
};
