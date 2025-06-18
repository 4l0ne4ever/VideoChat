import { usePeer } from "@/providers/Peer";
import { useSocket } from "@/providers/Socket";
import { useCallback, useEffect, useState } from "react";
import ReactPlayer from "react-player";

const Room = () => {
  const { socket } = useSocket();
  const peerContext = usePeer();
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<Set<string>>(new Set());

  if (!peerContext) {
    return <div>Loading...</div>;
  }

  const {
    createOffer,
    createAnswer,
    setRemoteAns,
    addIceCandidate,
    remoteStreams,
    removePeerConnection,
  } = peerContext;

  const handleNewUserJoined = useCallback(
    async (data: { emailId: string }) => {
      const { emailId } = data;
      console.log(`${emailId} has joined the room`);
      setConnectedUsers((prev) => new Set(prev.add(emailId)));

      // Wait a bit for stream to be ready if it's not available yet
      let stream = myStream;
      if (!stream) {
        console.log("Waiting for local stream to be ready...");
        // Wait up to 3 seconds for stream to be available
        for (let i = 0; i < 30; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (myStream) {
            stream = myStream;
            break;
          }
        }
      }

      // Create ICE candidate handler
      const handleIceCandidate = (candidate: RTCIceCandidate) => {
        socket.emit("ice-candidate", { emailId, candidate });
      };

      // Create and send offer with local stream attached during peer connection creation
      const offer = await createOffer(
        emailId,
        stream || undefined,
        handleIceCandidate
      );
      socket.emit("call-user", { emailId, offer });
    },
    [createOffer, socket, myStream, setConnectedUsers]
  );

  const handleIncommingCall = useCallback(
    async (data: { from: string; offer: any }) => {
      const { from, offer } = data;
      console.log(`Incoming call from ${from}`);
      setConnectedUsers((prev) => new Set(prev.add(from)));

      // Wait a bit for stream to be ready if it's not available yet
      let stream = myStream;
      if (!stream) {
        console.log("Waiting for local stream to be ready...");
        // Wait up to 3 seconds for stream to be available
        for (let i = 0; i < 30; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (myStream) {
            stream = myStream;
            break;
          }
        }
      }

      // Create ICE candidate handler
      const handleIceCandidate = (candidate: RTCIceCandidate) => {
        socket.emit("ice-candidate", { emailId: from, candidate });
      };

      // Create and send answer with local stream attached during peer connection creation
      const ans = await createAnswer(
        from,
        offer,
        stream || undefined,
        handleIceCandidate
      );
      socket.emit("call-accepted", { emailId: from, ans });
    },
    [createAnswer, socket, myStream, setConnectedUsers]
  );

  interface CallAcceptedData {
    ans: any;
    from: string;
  }

  const handleCallAccepted = useCallback(
    async (data: CallAcceptedData) => {
      const { ans, from } = data;
      console.log(`Call accepted by ${from} with answer:`, ans);
      await setRemoteAns(from, ans);
    },
    [setRemoteAns]
  );

  const handleUserLeft = useCallback(
    (data: { emailId: string }) => {
      const { emailId } = data;
      console.log(`${emailId} left the room`);
      setConnectedUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(emailId);
        return newSet;
      });
      removePeerConnection(emailId);
    },
    [removePeerConnection, setConnectedUsers]
  );

  const handleIceCandidate = useCallback(
    async (data: { from: string; candidate: RTCIceCandidate }) => {
      const { from, candidate } = data;
      console.log(`Received ICE candidate from ${from}`);
      try {
        await addIceCandidate(from, candidate);
      } catch (error) {
        console.error("Error handling ICE candidate:", error);
      }
    },
    [addIceCandidate]
  );

  const getUserMediaStream = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    setMyStream(stream);
  }, []);

  useEffect(() => {
    socket.on("user-joined", handleNewUserJoined);
    socket.on("incomming-call", handleIncommingCall);
    socket.on("call-accepted", handleCallAccepted);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("user-left", handleUserLeft);
    return () => {
      socket.off("user-joined", handleNewUserJoined);
      socket.off("incomming-call", handleIncommingCall);
      socket.off("call-accepted", handleCallAccepted);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("user-left", handleUserLeft);
    };
  }, [
    socket,
    handleNewUserJoined,
    handleIncommingCall,
    handleCallAccepted,
    handleIceCandidate,
    handleUserLeft,
  ]);

  useEffect(() => {
    getUserMediaStream();
  }, [getUserMediaStream]);

  return (
    <div>
      <h1>Room Page</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
        {/* My Stream */}
        <div>
          <h3>You</h3>
          {myStream && (
            <ReactPlayer
              url={myStream}
              playing
              muted
              width="300px"
              height="200px"
            />
          )}
        </div>

        {/* Remote Streams */}
        {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
          <div key={userId}>
            <h3>{userId}</h3>
            <ReactPlayer url={stream} playing width="300px" height="200px" />
          </div>
        ))}
      </div>

      <div style={{ marginTop: "20px" }}>
        <p>Connected Users: {Array.from(connectedUsers).join(", ")}</p>
      </div>
    </div>
  );
};

export default Room;
