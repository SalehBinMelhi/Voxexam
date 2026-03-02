export interface PeerConnectionCallbacks {
  onTrack: (stream: MediaStream) => void;
  onIceCandidate: (candidate: RTCIceCandidate | null) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function createPeerConnection(callbacks: PeerConnectionCallbacks): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      callbacks.onTrack(event.streams[0]);
    }
  };

  pc.onicecandidate = (event) => {
    callbacks.onIceCandidate(event.candidate);
  };

  pc.onconnectionstatechange = () => {
    callbacks.onConnectionStateChange(pc.connectionState);
  };

  return pc;
}

export async function createScreenShareOffer(
  pc: RTCPeerConnection,
  stream: MediaStream
): Promise<RTCSessionDescriptionInit> {
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

export async function handleScreenShareAnswer(
  pc: RTCPeerConnection,
  answer: RTCSessionDescriptionInit
): Promise<void> {
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

export async function createScreenShareAnswer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

export async function addIceCandidate(
  pc: RTCPeerConnection,
  candidate: RTCIceCandidateInit
): Promise<void> {
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.error("[WebRTC] Failed to add ICE candidate:", e);
  }
}

export async function getScreenStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
}

export async function getAudioStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
}
