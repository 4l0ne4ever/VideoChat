import { usePeer } from "@/providers/Peer";
import { useSocket } from "@/providers/Socket";
import { useTheme } from "@/providers/Theme";
import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BsCameraVideo,
  BsCameraVideoOff,
  BsMic,
  BsMicMute,
  BsShare,
  BsChatLeft,
  BsPeople,
  BsHandIndexThumb,
  BsSun,
  BsMoon,
} from "react-icons/bs";
import { MdCallEnd } from "react-icons/md";

// Separate component for video element to avoid re-rendering issues
const VideoElement = ({
  stream,
  userId,
  isLocal = false,
  externalMuteState,
  externalVideoState,
  theme = "dark",
}: {
  stream: MediaStream;
  userId: string;
  isLocal?: boolean;
  externalMuteState?: boolean;
  externalVideoState?: boolean;
  theme?: "light" | "dark";
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    console.log(
      `Setting up video element for ${userId}${isLocal ? " (local)" : ""}`
    );
    setIsLoading(true);
    setError(null);

    // Cancel any pending play promise to avoid AbortError
    if (playPromiseRef.current) {
      playPromiseRef.current.catch(() => {
        // Ignore AbortError from previous play attempt
      });
    }

    // Set up the stream
    video.srcObject = stream;

    // Monitor track states
    const checkTrackStates = () => {
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();

      // For local streams, check actual track state
      // For remote streams, use external state if available, otherwise check tracks
      if (isLocal) {
        setIsAudioMuted(audioTracks.length > 0 && !audioTracks[0].enabled);
        setIsVideoDisabled(videoTracks.length > 0 && !videoTracks[0].enabled);
      } else {
        // Use external state (from socket) if available, otherwise fall back to track state
        setIsAudioMuted(
          externalMuteState !== undefined
            ? externalMuteState
            : audioTracks.length > 0 && !audioTracks[0].enabled
        );
        setIsVideoDisabled(
          externalVideoState !== undefined
            ? externalVideoState
            : videoTracks.length > 0 && !videoTracks[0].enabled
        );
      }
    };

    // Initial check
    checkTrackStates();

    // Listen for track state changes
    const trackChangeHandler = () => checkTrackStates();
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", trackChangeHandler);
    });
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", trackChangeHandler);
    });

    // Periodic check for track enabled state changes
    const trackCheckInterval = setInterval(checkTrackStates, 1000);

    const handleLoadedMetadata = () => {
      console.log(`Video metadata loaded for ${userId}`);
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      console.log(`Video can play for ${userId}`);

      // Store the play promise to handle AbortError gracefully
      playPromiseRef.current = video.play().catch((err) => {
        // Only log if it's not an AbortError (which happens during rapid stream changes)
        if (err.name !== "AbortError") {
          console.error(`Video play error for ${userId}:`, err);
          setError(err.message);
        } else {
          console.log(
            `Video play aborted for ${userId} (likely due to new stream)`
          );
        }
      });
    };

    const handleError = (e: Event) => {
      console.error(`Video element error for ${userId}:`, e);
      setError("Video loading failed");
      setIsLoading(false);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("error", handleError);

    return () => {
      clearInterval(trackCheckInterval);

      if (video) {
        // Cancel any pending play promise during cleanup
        if (playPromiseRef.current) {
          playPromiseRef.current.catch(() => {
            // Ignore AbortError during cleanup
          });
        }

        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("error", handleError);

        // Pause before clearing to prevent AbortError
        video.pause();
        video.srcObject = null;
      }

      // Clean up track event listeners
      stream.getAudioTracks().forEach((track) => {
        track.removeEventListener("ended", trackChangeHandler);
      });
      stream.getVideoTracks().forEach((track) => {
        track.removeEventListener("ended", trackChangeHandler);
      });
    };
  }, [stream, userId, isLocal, externalMuteState, externalVideoState]);

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || isAudioMuted} // Mute local video to prevent feedback, mute remote if they are muted
        className={`w-full h-full object-cover rounded-lg border transition-colors duration-300 ${
          theme === "dark"
            ? "bg-gray-900 border-gray-700"
            : "bg-gray-200 border-gray-300"
        }`}
      />
      {isLoading && (
        <div
          className={`absolute inset-0 flex items-center justify-center text-sm ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}
        >
          Loading video...
        </div>
      )}
      {error && (
        <div className="absolute bottom-2 left-2 bg-red-500/80 text-white text-xs px-2 py-1 rounded">
          Error: {error}
        </div>
      )}

      {/* Video disabled overlay */}
      {isVideoDisabled && (
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-lg transition-colors duration-300 ${
            theme === "dark" ? "bg-gray-800" : "bg-gray-300"
          }`}
        >
          <div className="text-center">
            <BsCameraVideoOff
              className={`text-4xl mb-2 mx-auto ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            />
            <div
              className={`text-sm ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {isLocal ? "Camera Off" : `${userId}'s camera is off`}
            </div>
          </div>
        </div>
      )}

      {/* Muted indicator */}
      {isAudioMuted && (
        <div className="absolute top-2 left-2 bg-red-500/80 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
          <BsMicMute className="text-xs" />
          <span>Muted</span>
        </div>
      )}

      {/* User name overlay */}
      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
        {isLocal ? "You" : userId}
      </div>
    </div>
  );
};

const Room = () => {
  const { socket } = useSocket();
  const peerContext = usePeer();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<Set<string>>(new Set());
  const myStreamRef = useRef<MediaStream | null>(null);

  // UI state for video call controls
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<
    Array<{ text: string; timestamp: Date; sender: string }>
  >([]);
  const [duration, setDuration] = useState(0);

  // Track other users' mute and video states
  const [userMuteStates, setUserMuteStates] = useState<Map<string, boolean>>(
    new Map()
  );
  const [userVideoStates, setUserVideoStates] = useState<Map<string, boolean>>(
    new Map()
  );

  // Timer for call duration
  useEffect(() => {
    const timer = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Utility functions
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSendMessage = () => {
    if (message.trim()) {
      setMessages([
        ...messages,
        { text: message, timestamp: new Date(), sender: "You" },
      ]);
      setMessage("");
    }
  };

  // Calculate dynamic grid layout based on number of participants
  const getGridLayout = (totalParticipants: number) => {
    if (totalParticipants === 0) return "grid-cols-1"; // Fallback for no participants
    if (totalParticipants === 1) return "grid-cols-1"; // Single participant takes full space
    if (totalParticipants === 2) return "grid-cols-1 md:grid-cols-2"; // Split in half on larger screens
    if (totalParticipants === 3) return "grid-cols-2 md:grid-cols-3"; // 2x1 on mobile, 3x1 on desktop
    if (totalParticipants === 4) return "grid-cols-2"; // Perfect 2x2 grid
    if (totalParticipants <= 6) return "grid-cols-2 md:grid-cols-3"; // 2x3 or 3x2 layout
    if (totalParticipants <= 9) return "grid-cols-3"; // 3x3 grid
    return "grid-cols-3 md:grid-cols-4"; // For larger groups, 4 columns max
  };

  // Keep ref in sync with state
  useEffect(() => {
    myStreamRef.current = myStream;
  }, [myStream]);

  const getCurrentStream =
    useCallback(async (): Promise<MediaStream | null> => {
      // First check if we already have a stream
      if (myStreamRef.current) {
        return myStreamRef.current;
      }

      // Wait up to 5 seconds for stream to become available
      console.log("Waiting for local stream to be ready...");
      for (let i = 0; i < 50; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (myStreamRef.current) {
          console.log("Local stream is now ready");
          return myStreamRef.current;
        }
      }

      console.warn("Local stream not available after waiting");
      return null;
    }, []);

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
    getConnectionStats,
    getPendingIceCandidates,
  } = peerContext;

  const handleNewUserJoined = useCallback(
    async (data: { emailId: string }) => {
      const { emailId } = data;
      console.log(`${emailId} has joined the room`);
      setConnectedUsers((prev) => new Set(prev.add(emailId)));

      // Get current stream with proper waiting logic
      const stream = await getCurrentStream();
      console.log(
        `Local stream for ${emailId}:`,
        stream ? "Available" : "Not Available"
      );

      // Create ICE candidate handler
      const handleIceCandidate = (candidate: RTCIceCandidate) => {
        console.log(`Sending ICE candidate to ${emailId}`);
        socket.emit("ice-candidate", { emailId, candidate });
      };

      // Create and send offer with local stream attached during peer connection creation
      console.log(`Creating offer for ${emailId}`);
      const offer = await createOffer(
        emailId,
        stream || undefined,
        handleIceCandidate
      );
      socket.emit("call-user", { emailId, offer });
      console.log(`Sent offer to ${emailId}`);
    },
    [createOffer, socket, getCurrentStream, setConnectedUsers]
  );

  const handleIncommingCall = useCallback(
    async (data: { from: string; offer: any }) => {
      const { from, offer } = data;
      console.log(`Incoming call from ${from}`);
      console.log(`Received offer from ${from}:`, offer);
      setConnectedUsers((prev) => new Set(prev.add(from)));

      // Get current stream with proper waiting logic
      const stream = await getCurrentStream();
      console.log(
        `Local stream for ${from}:`,
        stream ? "Available" : "Not Available"
      );

      // Create ICE candidate handler
      const handleIceCandidate = (candidate: RTCIceCandidate) => {
        console.log(`Sending ICE candidate to ${from}`);
        socket.emit("ice-candidate", { emailId: from, candidate });
      };

      // Create and send answer with local stream attached during peer connection creation
      console.log(`Creating answer for ${from}`);
      const ans = await createAnswer(
        from,
        offer,
        stream || undefined,
        handleIceCandidate
      );
      socket.emit("call-accepted", { emailId: from, ans });
      console.log(`Sent answer to ${from}`);
    },
    [createAnswer, socket, getCurrentStream, setConnectedUsers]
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      console.log("Got user media stream:", stream);
      setMyStream(stream);

      // Apply current mute/video states to the new stream
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !isVideoOff;
      });

      console.log(`Initial audio state: ${isMuted ? "muted" : "unmuted"}`);
      console.log(`Initial video state: ${isVideoOff ? "off" : "on"}`);
    } catch (error) {
      console.error("Error getting user media:", error);
    }
  }, [isMuted, isVideoOff]);

  const checkConnectionStats = useCallback(async () => {
    console.log("=== Connection Stats ===");
    for (const userId of connectedUsers) {
      const stats = await getConnectionStats(userId);
      console.log(`Stats for ${userId}:`, stats);
    }
  }, [connectedUsers, getConnectionStats]);

  // Handle mute state changes from other users
  const handleMuteStateChanged = useCallback(
    (data: { userId: string; isMuted: boolean }) => {
      console.log(`User ${data.userId} ${data.isMuted ? "muted" : "unmuted"}`);
      setUserMuteStates((prev) => new Map(prev.set(data.userId, data.isMuted)));
    },
    []
  );

  // Handle video state changes from other users
  const handleVideoStateChanged = useCallback(
    (data: { userId: string; isVideoOff: boolean }) => {
      console.log(
        `User ${data.userId} video ${
          data.isVideoOff ? "turned off" : "turned on"
        }`
      );
      setUserVideoStates(
        (prev) => new Map(prev.set(data.userId, data.isVideoOff))
      );
    },
    []
  );

  // Handle disconnect from the call
  const handleDisconnect = useCallback(() => {
    console.log("Disconnecting from call...");

    // Stop all local media tracks
    if (myStream) {
      console.log("Stopping local media tracks");
      myStream.getTracks().forEach((track) => {
        track.stop();
        console.log(`Stopped ${track.kind} track`);
      });
      setMyStream(null);
    }

    // Close all peer connections
    console.log("Closing all peer connections");
    for (const userId of connectedUsers) {
      removePeerConnection(userId);
    }

    // Clear state
    setConnectedUsers(new Set());
    setUserMuteStates(new Map());
    setUserVideoStates(new Map());

    // Notify server that we're leaving
    console.log("Notifying server of disconnect");
    socket.emit("user-disconnect");

    // Navigate back to home
    console.log("Navigating to home");
    navigate("/");
  }, [myStream, connectedUsers, removePeerConnection, socket, navigate]);

  useEffect(() => {
    socket.on("user-joined", handleNewUserJoined);
    socket.on("incomming-call", handleIncommingCall);
    socket.on("call-accepted", handleCallAccepted);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("user-left", handleUserLeft);
    socket.on("mute-state-changed", handleMuteStateChanged);
    socket.on("video-state-changed", handleVideoStateChanged);

    return () => {
      socket.off("user-joined", handleNewUserJoined);
      socket.off("incomming-call", handleIncommingCall);
      socket.off("call-accepted", handleCallAccepted);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("user-left", handleUserLeft);
      socket.off("mute-state-changed", handleMuteStateChanged);
      socket.off("video-state-changed", handleVideoStateChanged);
    };
  }, [
    socket,
    handleNewUserJoined,
    handleIncommingCall,
    handleCallAccepted,
    handleIceCandidate,
    handleUserLeft,
    handleMuteStateChanged,
    handleVideoStateChanged,
  ]);

  useEffect(() => {
    getUserMediaStream();
  }, [getUserMediaStream]);

  // Debug effect to track remote streams changes
  useEffect(() => {
    console.log("Remote streams updated:", {
      streamCount: remoteStreams.size,
      userIds: Array.from(remoteStreams.keys()),
      streams: Array.from(remoteStreams.entries()).map(([userId, stream]) => ({
        userId,
        streamId: stream.id,
        tracks: stream.getTracks().map((track) => ({
          kind: track.kind,
          id: track.id,
          enabled: track.enabled,
        })),
      })),
    });
  }, [remoteStreams]);

  // Cleanup effect when component unmounts
  useEffect(() => {
    return () => {
      console.log("Room component unmounting, cleaning up...");

      // Stop all local media tracks
      if (myStreamRef.current) {
        console.log("Stopping local media tracks on unmount");
        myStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          console.log(`Stopped ${track.kind} track on unmount`);
        });
      }

      // Close all peer connections
      console.log("Closing all peer connections on unmount");
      for (const userId of connectedUsers) {
        removePeerConnection(userId);
      }
    };
  }, []); // Empty dependency array means this runs only on unmount

  return (
    <div
      className={`flex h-screen transition-colors duration-300 ${
        theme === "dark" ? "bg-gray-900" : "bg-gray-100"
      }`}
    >
      <div className="flex-1 flex flex-col relative">
        {/* Theme toggle button */}
        <button
          onClick={toggleTheme}
          className={`absolute top-4 right-20 z-20 p-3 rounded-full transition-all duration-300 ${
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

        {/* Call duration display */}
        <div
          className={`absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1 rounded-lg transition-colors duration-300 ${
            theme === "dark" ? "bg-black/20" : "bg-white/20 backdrop-blur-sm"
          }`}
        >
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span
            className={`text-sm ${
              theme === "dark" ? "text-white" : "text-gray-900"
            }`}
          >
            {formatDuration(duration)}
          </span>
        </div>

        {/* Video grid */}
        <div
          className={`flex-1 grid ${getGridLayout(
            (myStream ? 1 : 0) + remoteStreams.size
          )} gap-4 p-4 place-items-center`}
        >
          {/* My Stream */}
          {myStream && (
            <div
              className={`relative aspect-video w-full ${
                (myStream ? 1 : 0) + remoteStreams.size === 1 ? "max-w-4xl" : ""
              }`}
            >
              <VideoElement
                stream={myStream}
                userId="you"
                isLocal={true}
                theme={theme}
              />
            </div>
          )}

          {/* Remote Streams */}
          {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
            <div
              key={userId}
              className={`relative aspect-video w-full ${
                (myStream ? 1 : 0) + remoteStreams.size === 1 ? "max-w-4xl" : ""
              }`}
            >
              <VideoElement
                stream={stream}
                userId={userId}
                externalMuteState={userMuteStates.get(userId)}
                externalVideoState={userVideoStates.get(userId)}
                theme={theme}
              />
            </div>
          ))}

          {/* Show placeholder only when no participants */}
          {!myStream && remoteStreams.size === 0 && (
            <div
              className={`relative aspect-video rounded-lg flex items-center justify-center max-w-2xl w-full transition-colors duration-300 ${
                theme === "dark" ? "bg-gray-800" : "bg-gray-200"
              }`}
            >
              <div className="text-center">
                <div
                  className={`text-lg mb-2 ${
                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  No participants yet
                </div>
                <div
                  className={`text-sm ${
                    theme === "dark" ? "text-gray-500" : "text-gray-500"
                  }`}
                >
                  Waiting for camera access...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Control bar */}
        <div
          className={`flex justify-center items-center gap-4 p-4 backdrop-blur-sm transition-colors duration-300 ${
            theme === "dark" ? "bg-black/20" : "bg-white/20"
          }`}
        >
          <button
            onClick={() => {
              const newMutedState = !isMuted;
              setIsMuted(newMutedState);

              // Apply mute/unmute to local stream
              if (myStream) {
                myStream.getAudioTracks().forEach((track) => {
                  track.enabled = !newMutedState; // enabled = true means unmuted
                });
                console.log(`Audio ${newMutedState ? "muted" : "unmuted"}`);
              }

              // Broadcast mute state to other users
              socket.emit("mute-state-changed", {
                userId: socket.id,
                isMuted: newMutedState,
              });
            }}
            className={`p-4 rounded-full ${
              isMuted ? "bg-red-500" : "bg-blue-600"
            } hover:opacity-80 transition-opacity`}
          >
            {isMuted ? (
              <BsMicMute className="text-white text-xl" />
            ) : (
              <BsMic className="text-white text-xl" />
            )}
          </button>

          <button
            onClick={() => {
              const newVideoOffState = !isVideoOff;
              setIsVideoOff(newVideoOffState);

              // Apply video on/off to local stream
              if (myStream) {
                myStream.getVideoTracks().forEach((track) => {
                  track.enabled = !newVideoOffState; // enabled = true means video on
                });
                console.log(
                  `Video ${newVideoOffState ? "turned off" : "turned on"}`
                );
              }

              // Broadcast video state to other users
              socket.emit("video-state-changed", {
                userId: socket.id,
                isVideoOff: newVideoOffState,
              });
            }}
            className={`p-4 rounded-full ${
              isVideoOff ? "bg-red-500" : "bg-blue-600"
            } hover:opacity-80 transition-opacity`}
          >
            {isVideoOff ? (
              <BsCameraVideoOff className="text-white text-xl" />
            ) : (
              <BsCameraVideo className="text-white text-xl" />
            )}
          </button>

          <button
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            className={`p-4 rounded-full ${
              isScreenSharing ? "bg-green-600" : "bg-blue-600"
            } hover:opacity-80 transition-opacity`}
          >
            <BsShare className="text-white text-xl" />
          </button>

          <button
            onClick={() => setIsHandRaised(!isHandRaised)}
            className={`p-4 rounded-full ${
              isHandRaised ? "bg-yellow-600" : "bg-blue-600"
            } hover:opacity-80 transition-opacity`}
          >
            <BsHandIndexThumb className="text-white text-xl" />
          </button>

          <button
            onClick={checkConnectionStats}
            className="p-4 rounded-full bg-blue-600 hover:opacity-80 transition-opacity"
          >
            <BsPeople className="text-white text-xl" />
          </button>

          <button
            onClick={handleDisconnect}
            className="p-4 rounded-full bg-red-600 hover:opacity-80 transition-opacity"
            title="End Call"
          >
            <MdCallEnd className="text-white text-xl" />
          </button>
        </div>
      </div>

      {/* Chat Panel */}
      {isChatOpen && (
        <div
          className={`w-80 border-l flex flex-col transition-colors duration-300 ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-300"
          }`}
        >
          <div
            className={`p-4 border-b transition-colors duration-300 ${
              theme === "dark" ? "border-gray-700" : "border-gray-300"
            }`}
          >
            <h2
              className={`text-lg font-semibold ${
                theme === "dark" ? "text-white" : "text-gray-900"
              }`}
            >
              Chat
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-2 rounded-lg transition-colors duration-300 ${
                  theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                }`}
              >
                <div
                  className={`flex justify-between text-sm ${
                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  <span>{msg.sender}</span>
                  <span>{msg.timestamp.toLocaleTimeString()}</span>
                </div>
                <p
                  className={`mt-1 ${
                    theme === "dark" ? "text-white" : "text-gray-900"
                  }`}
                >
                  {msg.text}
                </p>
              </div>
            ))}
          </div>

          <div
            className={`p-4 border-t transition-colors duration-300 ${
              theme === "dark" ? "border-gray-700" : "border-gray-300"
            }`}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className={`flex-1 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-300 ${
                  theme === "dark"
                    ? "bg-gray-700 text-white placeholder-gray-400"
                    : "bg-gray-100 text-gray-900 placeholder-gray-500"
                }`}
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <button
                onClick={handleSendMessage}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:opacity-80 transition-opacity"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat toggle button */}
      <button
        onClick={() => setIsChatOpen(!isChatOpen)}
        className={`absolute right-4 top-4 p-3 rounded-full hover:opacity-80 transition-all duration-300 z-10 ${
          theme === "dark"
            ? "bg-blue-600 text-white"
            : "bg-blue-600 text-white shadow-lg"
        }`}
      >
        <BsChatLeft />
      </button>

      {/* Debug panel - collapsible */}
      <details
        className={`absolute bottom-4 left-4 p-2 rounded text-xs max-w-md z-10 transition-colors duration-300 ${
          theme === "dark"
            ? "bg-black/80 text-white"
            : "bg-white/90 text-gray-900"
        }`}
      >
        <summary className="cursor-pointer mb-2">Debug Info</summary>
        <div className="space-y-1">
          <div>
            Total Participants: {(myStream ? 1 : 0) + remoteStreams.size}
          </div>
          <div>
            Grid Layout:{" "}
            {getGridLayout((myStream ? 1 : 0) + remoteStreams.size)}
          </div>
          <div>
            Connected Users: {Array.from(connectedUsers).join(", ") || "None"}
          </div>
          <div>My Stream: {myStream ? "Available" : "Not Available"}</div>
          <div>Remote Streams: {remoteStreams.size}</div>
          <div>
            Pending ICE Candidates:{" "}
            {Array.from(getPendingIceCandidates().entries()).reduce(
              (acc, [, candidates]) => acc + candidates.length,
              0
            )}
          </div>
        </div>
      </details>
    </div>
  );
};

export default Room;
