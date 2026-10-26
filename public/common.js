const role=document.body.dataset.role;
const statusEl=document.getElementById('status');
const logEl=document.getElementById('log');
const localVideo=document.getElementById('local');
const remoteVideo=document.getElementById('remote');
let pc=null,localStream=null,pending=[],makingOffer=false;
const say=s=>{statusEl.textContent=s;logEl.textContent+=new Date().toLocaleTimeString()+' '+s+'\n';logEl.scrollTop=logEl.scrollHeight};
const signal=async(type,payload={})=>{try{const r=await fetch('/signal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:role,type,...payload})});const j=await r.json();if(!j.delivered)say('Other page is not connected yet')}catch(e){say('Signaling error: '+e.message)}};
function closePeer(){if(pc){pc.onicecandidate=null;pc.ontrack=null;pc.close();pc=null}pending=[];remoteVideo.srcObject=null}
function setup(){closePeer();pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
 pc.onicecandidate=e=>{if(e.candidate)signal('candidate',{candidate:e.candidate})};
 pc.ontrack=e=>{say('Remote '+e.track.kind+' received');if(e.streams[0])remoteVideo.srcObject=e.streams[0];else{const s=remoteVideo.srcObject||new MediaStream();s.addTrack(e.track);remoteVideo.srcObject=s}remoteVideo.play().catch(()=>say('Click Play Remote to allow playback'))};
 pc.onconnectionstatechange=()=>say('WebRTC: '+pc.connectionState);
 pc.oniceconnectionstatechange=()=>say('ICE: '+pc.iceConnectionState);
 return pc;
}
async function flush(){const queued=pending;pending=[];for(const c of queued){try{await pc.addIceCandidate(c)}catch(e){say('ICE error: '+e.message)}}}
async function handle(m){try{
 if(m.type==='peer-online'){say('Other page connected');if(role==='client'&&localStream)await offer();return}
 if(m.type==='peer-offline'||m.type==='bye'){say('Other page disconnected');closePeer();return}
 if(m.type==='hello'){if(role==='client'&&localStream)await offer();return}
 if(m.type==='offer'&&role==='admin'){
  const earlyCandidates=pending.slice();const p=setup();pending=earlyCandidates;await p.setRemoteDescription(m.description);
  const answer=await p.createAnswer();await p.setLocalDescription(answer);await signal('answer',{description:p.localDescription});await flush();say('Answer sent');return;
 }
 if(m.type==='answer'&&role==='client'&&pc){await pc.setRemoteDescription(m.description);await flush();say('Answer received');return}
 if(m.type==='candidate'){if(pc?.remoteDescription){await pc.addIceCandidate(m.candidate)}else pending.push(m.candidate)}
 }catch(e){say('Negotiation error: '+e.message)}}
const events=new EventSource('/events?role='+role);
events.onmessage=e=>handle(JSON.parse(e.data));events.onerror=()=>say('Signaling connection interrupted; reconnecting');
async function offer(){if(role!=='client'||!localStream||makingOffer)return;makingOffer=true;try{
 const p=setup();for(const track of localStream.getTracks())p.addTrack(track,localStream);
 const o=await p.createOffer();await p.setLocalDescription(o);await signal('offer',{description:p.localDescription});say('Camera offer sent');
 }catch(e){say('Offer error: '+e.message)}finally{makingOffer=false}}
window.addEventListener('beforeunload',()=>{if(localStream)localStream.getTracks().forEach(t=>t.stop());closePeer()});
document.getElementById('play').onclick=()=>remoteVideo.play().catch(e=>say(e.message));
if(role==='client')document.getElementById('start').onclick=async()=>{
 try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera requires HTTPS or localhost');
 localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});localVideo.srcObject=localStream;localVideo.play().catch(()=>{});say('Camera and microphone permission granted');await offer();
 }catch(e){say('Camera error: '+e.message)}
};
if(role==='client')document.getElementById('stop').onclick=async()=>{if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null}localVideo.srcObject=null;await signal('bye');closePeer();say('Camera stopped')};
if(role==='admin')document.getElementById('request').onclick=()=>signal('hello');
