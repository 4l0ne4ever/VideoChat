import React, { useCallback } from "react";

type PeerContextType = {
  createPeerConnection: (
    userId: string,
    localStream?: MediaStream,
    onIceCandidate?: (candidate: RTCIceCandidate) => void
  ) => RTCPeerConnection;
  createOffer: (
    userId: string,
    localStream?: MediaStream,
    onIceCandidate?: (candidate: RTCIceCandidate) => void
  ) => Promise<RTCSessionDescriptionInit>;
  createAnswer: (
    userId: string,
    offer: RTCSessionDescriptionInit,
    localStream?: MediaStream,
    onIceCandidate?: (candidate: RTCIceCandidate) => void
  ) => Promise<RTCSessionDescriptionInit>;
  setRemoteAns: (
    userId: string,
    ans: RTCSessionDescriptionInit
  ) => Promise<void>;
  sendStream: (userId: string, stream: MediaStream) => Promise<void>;
  addIceCandidate: (
    userId: string,
    candidate: RTCIceCandidate
  ) => Promise<void>;
  remoteStreams: Map<string, MediaStream>;
  removePeerConnection: (userId: string) => void;
  getConnectionStats: (userId: string) => Promise<RTCStatsReport | null>;
} | null;

export interface SendStream {
  (userId: string, stream: MediaStream): Promise<void>;
}

export interface SetRemoteAns {
  (userId: string, ans: RTCSessionDescriptionInit): Promise<void>;
}

const PeerContext = React.createContext<PeerContextType>(null);

export const usePeer = () => React.useContext(PeerContext);

export const PeerProvider = (props: React.PropsWithChildren<{}>) => {
  const [peerConnections, setPeerConnections] = React.useState<
    Map<string, RTCPeerConnection>
  >(new Map());
  const [remoteStreams, setRemoteStreams] = React.useState<
    Map<string, MediaStream>
  >(new Map());

  const createPeerConnection = useCallback(
    (
      userId: string,
      localStream?: MediaStream,
      onIceCandidate?: (candidate: RTCIceCandidate) => void
    ) => {
      if (peerConnections.has(userId)) {
        return peerConnections.get(userId)!;
      }

      const peer = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
        ],
      });

      // Add local stream tracks if provided
      if (localStream) {
        const tracks = localStream.getTracks();
        tracks.forEach((track) => {
          peer.addTrack(track, localStream);
        });
      }

      // Handle incoming tracks
      peer.addEventListener("track", (e: RTCTrackEvent) => {
        const streams = e.streams;
        if (streams && streams.length > 0) {
          const remoteStream = streams[0];
          setRemoteStreams((prev) => new Map(prev.set(userId, remoteStream)));
        }
      });

      // Handle ICE candidates
      peer.addEventListener("icecandidate", (e: RTCPeerConnectionIceEvent) => {
        if (e.candidate && onIceCandidate) {
          onIceCandidate(e.candidate);
        }
      });

      // Handle negotiation needed (important for re-negotiation)
      peer.addEventListener("negotiationneeded", async () => {
        console.log(`Negotiation needed for ${userId}`);
      });

      // Handle ICE connection state changes
      peer.addEventListener("iceconnectionstatechange", () => {
        console.log(
          `ICE connection state for ${userId}:`,
          peer.iceConnectionState
        );
      });

      // Handle connection state changes
      peer.addEventListener("connectionstatechange", () => {
        console.log(`Connection state for ${userId}:`, peer.connectionState);

        // Clean up if connection fails
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "disconnected"
        ) {
          console.log(
            `Connection failed/disconnected for ${userId}, attempting to restart ICE`
          );
          peer.restartIce();
        }
      });

      setPeerConnections((prev) => new Map(prev.set(userId, peer)));
      return peer;
    },
    [peerConnections]
  );

  const createOffer = useCallback(
    async (
      userId: string,
      localStream?: MediaStream,
      onIceCandidate?: (candidate: RTCIceCandidate) => void
    ) => {
      const peer = createPeerConnection(userId, localStream, onIceCandidate);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      return offer;
    },
    [createPeerConnection]
  );

  const createAnswer = useCallback(
    async (
      userId: string,
      offer: RTCSessionDescriptionInit,
      localStream?: MediaStream,
      onIceCandidate?: (candidate: RTCIceCandidate) => void
    ) => {
      const peer = createPeerConnection(userId, localStream, onIceCandidate);
      await peer.setRemoteDescription(offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      return answer;
    },
    [createPeerConnection]
  );

  const setRemoteAns = useCallback(
    async (userId: string, ans: RTCSessionDescriptionInit) => {
      const peer = peerConnections.get(userId);
      if (peer) {
        await peer.setRemoteDescription(ans);
      }
    },
    [peerConnections]
  );

  const sendStream = useCallback(
    async (userId: string, stream: MediaStream) => {
      const peer = peerConnections.get(userId);
      if (peer) {
        const tracks: MediaStreamTrack[] = stream.getTracks();
        const senders = peer.getSenders();
        for (const track of tracks) {
          const alreadyAdded = senders.some((sender) => sender.track === track);
          if (!alreadyAdded) {
            peer.addTrack(track, stream);
          }
        }
      }
    },
    [peerConnections]
  );

  const addIceCandidate = useCallback(
    async (userId: string, candidate: RTCIceCandidate) => {
      const peer = peerConnections.get(userId);
      if (peer && peer.remoteDescription) {
        try {
          await peer.addIceCandidate(candidate);
          console.log(`Successfully added ICE candidate for ${userId}`);
        } catch (error) {
          console.error(`Error adding ICE candidate for ${userId}:`, error);
        }
      } else {
        console.warn(
          `Cannot add ICE candidate for ${userId}: peer connection not ready or no remote description`
        );
      }
    },
    [peerConnections]
  );

  const removePeerConnection = useCallback(
    (userId: string) => {
      const peer = peerConnections.get(userId);
      if (peer) {
        peer.close();
        setPeerConnections((prev) => {
          const newMap = new Map(prev);
          newMap.delete(userId);
          return newMap;
        });
        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.delete(userId);
          return newMap;
        });
      }
    },
    [peerConnections]
  );

  const getConnectionStats = useCallback(
    async (userId: string): Promise<RTCStatsReport | null> => {
      const peer = peerConnections.get(userId);
      if (peer) {
        try {
          return await peer.getStats();
        } catch (error) {
          console.error(`Error getting stats for ${userId}:`, error);
          return null;
        }
      }
      return null;
    },
    [peerConnections]
  );

  return (
    <PeerContext.Provider
      value={{
        createPeerConnection,
        createOffer,
        createAnswer,
        setRemoteAns,
        sendStream,
        addIceCandidate,
        remoteStreams,
        removePeerConnection,
        getConnectionStats,
      }}
    >
      {props.children}
    </PeerContext.Provider>
  );
};
