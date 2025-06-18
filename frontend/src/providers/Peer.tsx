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
  getPendingIceCandidates: () => Map<string, RTCIceCandidate[]>;
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
  const [pendingIceCandidates, setPendingIceCandidates] = React.useState<
    Map<string, RTCIceCandidate[]>
  >(new Map());

  const createPeerConnection = useCallback(
    (
      userId: string,
      localStream?: MediaStream,
      onIceCandidate?: (candidate: RTCIceCandidate) => void
    ) => {
      if (peerConnections.has(userId)) {
        const existingPeer = peerConnections.get(userId)!;

        // Add local stream to existing peer if provided and not already added
        if (localStream) {
          const tracks = localStream.getTracks();
          const senders = existingPeer.getSenders();

          tracks.forEach((track) => {
            const alreadyAdded = senders.some(
              (sender) => sender.track === track
            );
            if (!alreadyAdded) {
              console.log(
                `Adding track to existing peer for ${userId}:`,
                track.kind
              );
              existingPeer.addTrack(track, localStream);
            }
          });
        }

        return existingPeer;
      }

      const peer = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
          // Add free TURN servers for better connectivity
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
      });

      // Add local stream tracks if provided
      if (localStream) {
        const tracks = localStream.getTracks();
        tracks.forEach((track) => {
          console.log(`Adding local track to peer for ${userId}:`, track.kind);
          peer.addTrack(track, localStream);
        });
      } // Handle incoming tracks - debounce to prevent multiple rapid updates
      const trackTimeouts = new Map<string, NodeJS.Timeout>();
      peer.addEventListener("track", (e: RTCTrackEvent) => {
        console.log(`Received track event for ${userId}`, {
          streams: e.streams,
          track: e.track,
          trackKind: e.track.kind,
          trackId: e.track.id,
          trackEnabled: e.track.enabled,
          trackReadyState: e.track.readyState,
        });

        const streams = e.streams;
        if (streams && streams.length > 0) {
          const remoteStream = streams[0];

          // Log stream details
          console.log(`Stream details for ${userId}:`, {
            streamId: remoteStream.id,
            active: remoteStream.active,
            tracks: remoteStream.getTracks().map((t) => ({
              kind: t.kind,
              enabled: t.enabled,
              readyState: t.readyState,
              id: t.id,
            })),
          });

          // Clear any existing timeout for this user
          const existingTimeout = trackTimeouts.get(userId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          // Set a new timeout to update the stream after a brief delay
          const timeout = setTimeout(() => {
            console.log(`Setting remote stream for ${userId}`, remoteStream);
            setRemoteStreams((prev) => {
              const newMap = new Map(prev);
              newMap.set(userId, remoteStream);
              console.log(
                `Updated remote streams map:`,
                Array.from(newMap.keys())
              );
              return newMap;
            });
            trackTimeouts.delete(userId);
          }, 200); // 200ms delay to batch multiple track events

          trackTimeouts.set(userId, timeout);
        } else {
          console.warn(`No streams found in track event for ${userId}`);
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

        // Handle different connection states
        if (peer.connectionState === "connected") {
          console.log(`Successfully connected to ${userId}`);
        } else if (peer.connectionState === "failed") {
          console.log(`Connection failed for ${userId}`);
          // Try restarting ICE to recover
          setTimeout(() => {
            if (peer.connectionState === "failed") {
              console.log(`Attempting ICE restart for ${userId}`);
              peer.restartIce();
            }
          }, 1000); // Wait 1 second before trying to restart
        } else if (peer.connectionState === "disconnected") {
          console.log(`Connection disconnected for ${userId}`);
          // Wait a bit before considering it failed
          setTimeout(() => {
            if (peer.connectionState === "disconnected") {
              console.log(
                `Connection still disconnected for ${userId}, might need restart`
              );
            }
          }, 3000);
        }
      });

      setPeerConnections((prev) => new Map(prev.set(userId, peer)));

      // Check if there are any pending ICE candidates for this user
      const pendingCandidates = pendingIceCandidates.get(userId) || [];
      if (pendingCandidates.length > 0) {
        console.log(
          `Found ${pendingCandidates.length} pending ICE candidates for ${userId}, will process when remote description is set`
        );
      }

      return peer;
    },
    [peerConnections, pendingIceCandidates]
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
      console.log(`Set remote description (offer) for ${userId}`);

      // Process any pending ICE candidates
      const pendingCandidates = pendingIceCandidates.get(userId) || [];
      if (pendingCandidates.length > 0) {
        console.log(
          `Processing ${pendingCandidates.length} pending ICE candidates for ${userId}`
        );

        for (const candidate of pendingCandidates) {
          try {
            await peer.addIceCandidate(candidate);
            console.log(
              `Successfully added pending ICE candidate for ${userId}`
            );
          } catch (error) {
            console.error(
              `Error adding pending ICE candidate for ${userId}:`,
              error
            );
          }
        }

        // Clear the pending candidates for this user
        setPendingIceCandidates((prev) => {
          const newMap = new Map(prev);
          newMap.delete(userId);
          return newMap;
        });
      }

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      return answer;
    },
    [createPeerConnection, pendingIceCandidates]
  );

  const setRemoteAns = useCallback(
    async (userId: string, ans: RTCSessionDescriptionInit) => {
      const peer = peerConnections.get(userId);
      if (peer) {
        await peer.setRemoteDescription(ans);
        console.log(`Set remote description for ${userId}`);

        // Process any pending ICE candidates immediately
        const pendingCandidates = pendingIceCandidates.get(userId) || [];
        if (pendingCandidates.length > 0) {
          console.log(
            `Processing ${pendingCandidates.length} pending ICE candidates for ${userId}`
          );

          for (const candidate of pendingCandidates) {
            try {
              await peer.addIceCandidate(candidate);
              console.log(
                `Successfully added pending ICE candidate for ${userId}`
              );
            } catch (error) {
              console.error(
                `Error adding pending ICE candidate for ${userId}:`,
                error
              );
            }
          }

          // Clear the pending candidates for this user
          setPendingIceCandidates((prev) => {
            const newMap = new Map(prev);
            newMap.delete(userId);
            return newMap;
          });

          console.log(`Processed all pending ICE candidates for ${userId}`);
        }
      }
    },
    [peerConnections, pendingIceCandidates]
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

      // Add a small delay to allow for remote description to be set
      if (peer && !peer.remoteDescription) {
        // Wait a bit for remote description to be set
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const updatedPeer = peerConnections.get(userId);
      if (updatedPeer && updatedPeer.remoteDescription) {
        try {
          await updatedPeer.addIceCandidate(candidate);
          console.log(`Successfully added ICE candidate for ${userId}`);
        } catch (error) {
          console.error(`Error adding ICE candidate for ${userId}:`, error);
        }
      } else {
        // Queue the ICE candidate whether peer exists or not
        // Peer connection might be created after ICE candidates start arriving
        console.log(
          `Queueing ICE candidate for ${userId} (${
            updatedPeer
              ? "remote description not set yet"
              : "peer connection not created yet"
          })`
        );
        setPendingIceCandidates((prev) => {
          const newMap = new Map(prev);
          const existingCandidates = newMap.get(userId) || [];
          newMap.set(userId, [...existingCandidates, candidate]);
          return newMap;
        });
      }
    },
    [peerConnections, setPendingIceCandidates]
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
        // Clean up pending ICE candidates
        setPendingIceCandidates((prev) => {
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

  const getPendingIceCandidates = useCallback(() => {
    return pendingIceCandidates;
  }, [pendingIceCandidates]);

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
        getPendingIceCandidates,
      }}
    >
      {props.children}
    </PeerContext.Provider>
  );
};
