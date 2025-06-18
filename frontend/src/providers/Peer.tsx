import React, { useMemo } from "react";

type PeerContextType = {
  peer: RTCPeerConnection;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
} | null;

const PeerContext = React.createContext<PeerContextType>(null);

export const usePeer = () => React.useContext(PeerContext);

export const PeerProvider = (props: React.PropsWithChildren<{}>) => {
  const peer = useMemo(
    () =>
      new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
        ],
      }),
    []
  );
  const createOffer = async () => {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    return offer;
  };
  return (
    <PeerContext.Provider value={{ peer, createOffer }}>
      {props.children}
    </PeerContext.Provider>
  );
};
