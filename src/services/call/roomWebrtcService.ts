import { nativeCalls } from '../../native/calls';
import { socketService } from '../socket/socketService';

type RemoteMap = Map<string,MediaStream>;
class RoomWebrtcService {
  private roomId:string|null=null; private local:MediaStream|null=null; private pcs=new Map<string,RTCPeerConnection>(); private pending=new Map<string,RTCIceCandidateInit[]>(); private unsubs:(()=>void)[]=[];
  onLocalStream?:(stream:MediaStream)=>void; onRemoteStreams?:(streams:RemoteMap)=>void; onState?:(peerId:string,state:RTCPeerConnectionState)=>void;
  private async iceServers(){try{const r:any=await nativeCalls.getIceConfig();return r?.data?.iceServers||[{urls:'stun:stun.l.google.com:19302'}];}catch{return [{urls:'stun:stun.l.google.com:19302'}];}}
  private async pc(peerId:string){const existing=this.pcs.get(peerId);if(existing)return existing;const pc=new RTCPeerConnection({iceServers:await this.iceServers()});this.pcs.set(peerId,pc);this.local?.getTracks().forEach(t=>pc.addTrack(t,this.local!));
    pc.onicecandidate=e=>{if(e.candidate&&this.roomId)socketService.emit('room:call:ice',{roomId:this.roomId,targetPeerId:peerId,candidate:e.candidate.toJSON()});};
    pc.ontrack=e=>{const streams=this.streams();streams.set(peerId,e.streams[0]);this.onRemoteStreams?.(streams);};
    pc.onconnectionstatechange=()=>this.onState?.(peerId,pc.connectionState);return pc;}
  private streams(){const out:RemoteMap=new Map();for(const [id,pc]of this.pcs){const stream=new MediaStream(pc.getReceivers().map(r=>r.track).filter(Boolean));if(stream.getTracks().length)out.set(id,stream);}return out;}
  async join(roomId:string,video:boolean){this.roomId=roomId;this.local=await navigator.mediaDevices.getUserMedia({audio:true,video:video?{facingMode:'user'}:false});this.onLocalStream?.(this.local);
    this.unsubs=[socketService.on('room:call:offer',async(p:any)=>{if(p.roomId!==roomId)return;const pc=await this.pc(p.sourcePeerId);await pc.setRemoteDescription(p.offer);await this.flush(p.sourcePeerId);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);socketService.emit('room:call:answer',{roomId,targetPeerId:p.sourcePeerId,answer});}),socketService.on('room:call:answer',async(p:any)=>{if(p.roomId!==roomId)return;const pc=this.pcs.get(p.sourcePeerId);if(pc){await pc.setRemoteDescription(p.answer);await this.flush(p.sourcePeerId);}}),socketService.on('room:call:ice',async(p:any)=>{if(p.roomId!==roomId)return;const pc=this.pcs.get(p.sourcePeerId);if(!pc||!pc.remoteDescription){this.pending.set(p.sourcePeerId,[...(this.pending.get(p.sourcePeerId)||[]),p.candidate]);}else await pc.addIceCandidate(p.candidate);}),socketService.on('room:call:peer-left',(p:any)=>{if(p.roomId===roomId)this.removePeer(p.peerId);})];
    const response:any=await new Promise(resolve=>socketService.emit('room:call:join',{roomId,sessionId:crypto.randomUUID()},resolve));if(response.status!=='success')throw Object.assign(new Error(response.code),{code:response.code});
    for(const peer of response.peers||[]){const pc=await this.pc(peer.peerId);const offer=await pc.createOffer();await pc.setLocalDescription(offer);socketService.emit('room:call:offer',{roomId,targetPeerId:peer.peerId,offer});}}
  private async flush(peerId:string){const pc=this.pcs.get(peerId);if(!pc)return;for(const c of this.pending.get(peerId)||[])await pc.addIceCandidate(c);this.pending.delete(peerId);}
  private removePeer(id:string){this.pcs.get(id)?.close();this.pcs.delete(id);this.pending.delete(id);this.onRemoteStreams?.(this.streams());}
  setMuted(value:boolean){this.local?.getAudioTracks().forEach(t=>t.enabled=!value);} setCamera(value:boolean){this.local?.getVideoTracks().forEach(t=>t.enabled=value);}
  leave(){if(this.roomId)socketService.emit('room:call:leave',{roomId:this.roomId});this.unsubs.forEach(x=>x());this.unsubs=[];this.pcs.forEach(pc=>pc.close());this.pcs.clear();this.local?.getTracks().forEach(t=>t.stop());this.local=null;this.roomId=null;this.pending.clear();this.onRemoteStreams?.(new Map());}
}
export const roomWebrtcService=new RoomWebrtcService();
