import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSocket } from "@/providers/Socket";
import { useTheme } from "@/providers/Theme";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BsSun, BsMoon } from "react-icons/bs";

const Home = () => {
  const { socket } = useSocket();
  const { theme, toggleTheme } = useTheme();
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
    <div
      className={`w-full h-screen flex justify-center items-center transition-colors duration-300 ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"
      }`}
    >
      {/* Theme toggle button */}
      <button
        onClick={toggleTheme}
        className={`absolute top-4 right-4 p-3 rounded-full transition-all duration-300 ${
          theme === "dark"
            ? "bg-gray-800 hover:bg-gray-700 text-yellow-400"
            : "bg-white hover:bg-gray-100 text-gray-700 shadow-lg"
        }`}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? (
          <BsSun className="text-xl" />
        ) : (
          <BsMoon className="text-xl" />
        )}
      </button>

      <div
        className={`flex flex-col gap-4 w-96 p-8 rounded-2xl transition-all duration-300 ${
          theme === "dark"
            ? "bg-gray-800 border border-gray-700 shadow-xl"
            : "bg-white border border-gray-200 shadow-2xl"
        }`}
      >
        <div className="text-center mb-6">
          <h1
            className={`text-3xl font-bold mb-2 ${
              theme === "dark" ? "text-white" : "text-gray-900"
            }`}
          >
            Video Chat
          </h1>
          <p
            className={`text-sm ${
              theme === "dark" ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Enter your details to join a room
          </p>
        </div>

        <Input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`transition-colors duration-300 ${
            theme === "dark"
              ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
              : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500"
          }`}
        />
        <Input
          type="text"
          placeholder="Enter Room Code"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className={`transition-colors duration-300 ${
            theme === "dark"
              ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
              : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500"
          }`}
        />
        <Button
          className={`cursor-pointer transition-all duration-300 ${
            theme === "dark"
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
          variant={"default"}
          onClick={handleJoin}
          disabled={!email.trim() || !roomId.trim()}
        >
          Join Room
        </Button>
      </div>
    </div>
  );
};

export default Home;
