import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSocket } from "@/providers/Socket";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const handleRoomJoined = useCallback(
    ({ roomId }: { roomId: string }) => {
      navigate(`/room/${roomId}`);
    },
    [navigate]
  );
  useEffect(() => {
    if (!socket) return;
    socket.on("joined-room", handleRoomJoined);
    return () => {
      socket.off("joined-room", handleRoomJoined);
    };
  }, [socket, handleRoomJoined]);
  const handleJoin = () => {
    socket.emit("join-room", { emailId: email, roomId });
  };
  return (
    <div className="w-full h-screen flex justify-center items-center">
      <div className="flex flex-col gap-4 w-96">
        <Input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="text"
          placeholder="Enter Code"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <Button
          className="cursor-pointer"
          variant={"icon"}
          onClick={handleJoin}
        >
          Join
        </Button>
      </div>
    </div>
  );
};

export default Home;
