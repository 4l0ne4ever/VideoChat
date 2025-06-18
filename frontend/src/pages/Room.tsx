import { usePeer } from "@/providers/Peer";
import { useSocket } from "@/providers/Socket";
import { useCallback, useEffect } from "react";

const Room = () => {
  const { socket } = useSocket();
  const { peer, createOffer } = usePeer();
  const handleNewUserJoined = useCallback(
    async (data: { emailId: string }) => {
      const { emailId } = data;
      console.log(`${emailId} has joined the room`);
      const offer = await createOffer();
      socket.emit("call-user", { emailId, offer });
    },
    [createOffer, socket]
  );

  const handleIncommingCall = useCallback(
    (data: { from: string; offer: any }) => {
      const { from, offer } = data;
      //TODO: Handle incoming call
      console.log("incomming-call", from, offer);
    },
    []
  );

  useEffect(() => {
    socket.on("user-joined", handleNewUserJoined);
    socket.on("incomming-call", handleIncommingCall);
    return () => {
      socket.off("user-joined", handleNewUserJoined);
      socket.off("incomming-call", handleIncommingCall);
    };
  }, [socket, handleNewUserJoined, handleIncommingCall]);
  return <div>Room</div>;
};

export default Room;
