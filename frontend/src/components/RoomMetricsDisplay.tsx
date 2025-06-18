import React, { useState, useEffect, useCallback } from "react";
import { useSocket } from "../providers/Socket";

interface RoomMetrics {
  roomId: string;
  totalUsers: number;
  averageLatency: number;
  averagePacketLoss: number;
  averageJitter: number;
  dominantVideoQuality: string;
  dominantAudioQuality: string;
  videoQualityDistribution: Record<string, number>;
  audioQualityDistribution: Record<string, number>;
  sampleCount: number;
  lastUpdated: number;
}

interface RoomMetricsDisplayProps {
  isVisible: boolean;
  onToggle: () => void;
}

const RoomMetricsDisplay: React.FC<RoomMetricsDisplayProps> = ({
  isVisible,
  onToggle,
}) => {
  const { socket } = useSocket();
  const [roomMetrics, setRoomMetrics] = useState<RoomMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Request room metrics
  const requestRoomMetrics = useCallback(() => {
    if (socket) {
      setIsLoading(true);
      socket.emit("get-room-metrics");
    }
  }, [socket]);

  // Handle room metrics updates
  useEffect(() => {
    if (!socket) return;

    const handleRoomMetrics = (metrics: RoomMetrics) => {
      setRoomMetrics(metrics);
      setIsLoading(false);
    };

    const handleRoomMetricsUpdate = (metrics: RoomMetrics) => {
      setRoomMetrics(metrics);
    };

    socket.on("room-metrics", handleRoomMetrics);
    socket.on("room-metrics-update", handleRoomMetricsUpdate);

    return () => {
      socket.off("room-metrics", handleRoomMetrics);
      socket.off("room-metrics-update", handleRoomMetricsUpdate);
    };
  }, [socket]);

  // Request metrics when component becomes visible
  useEffect(() => {
    if (isVisible) {
      requestRoomMetrics();
    }
  }, [isVisible, requestRoomMetrics]);

  const getQualityColor = (quality: string) => {
    switch (quality.toLowerCase()) {
      case "excellent":
        return "text-green-500";
      case "good":
        return "text-blue-500";
      case "fair":
        return "text-yellow-500";
      case "poor":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 w-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 z-50">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Room Performance
        </h3>
        <div className="flex gap-2">
          <button
            onClick={requestRoomMetrics}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={isLoading}
          >
            {isLoading ? "🔄" : "📊"} Refresh
          </button>
          <button
            onClick={onToggle}
            className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            ✕
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-4 text-gray-600 dark:text-gray-400">
          Loading room metrics...
        </div>
      )}

      {!isLoading && !roomMetrics && (
        <div className="text-center py-4 text-gray-600 dark:text-gray-400">
          No room metrics available
        </div>
      )}

      {roomMetrics && (
        <div className="space-y-4">
          {/* Overview */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
              Overview
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-300">
                  Users:{" "}
                </span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {roomMetrics.totalUsers}
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-300">
                  Samples:{" "}
                </span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {roomMetrics.sampleCount}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-600 dark:text-gray-300">
                  Last Updated:{" "}
                </span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {formatTimestamp(roomMetrics.lastUpdated)}
                </span>
              </div>
            </div>
          </div>

          {/* Network Performance */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
              Network
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">
                  Avg Latency:
                </span>
                <span
                  className={`font-medium ${
                    roomMetrics.averageLatency <= 100
                      ? "text-green-500"
                      : roomMetrics.averageLatency <= 200
                      ? "text-yellow-500"
                      : "text-red-500"
                  }`}
                >
                  {roomMetrics.averageLatency}ms
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">
                  Packet Loss:
                </span>
                <span
                  className={`font-medium ${
                    roomMetrics.averagePacketLoss <= 1
                      ? "text-green-500"
                      : roomMetrics.averagePacketLoss <= 3
                      ? "text-yellow-500"
                      : "text-red-500"
                  }`}
                >
                  {roomMetrics.averagePacketLoss}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">
                  Jitter:
                </span>
                <span
                  className={`font-medium ${
                    roomMetrics.averageJitter <= 30
                      ? "text-green-500"
                      : roomMetrics.averageJitter <= 50
                      ? "text-yellow-500"
                      : "text-red-500"
                  }`}
                >
                  {roomMetrics.averageJitter}ms
                </span>
              </div>
            </div>
          </div>

          {/* Quality Overview */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
              Quality
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Video:</span>
                <span
                  className={`font-medium ${getQualityColor(
                    roomMetrics.dominantVideoQuality
                  )}`}
                >
                  {roomMetrics.dominantVideoQuality}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Audio:</span>
                <span
                  className={`font-medium ${getQualityColor(
                    roomMetrics.dominantAudioQuality
                  )}`}
                >
                  {roomMetrics.dominantAudioQuality}
                </span>
              </div>
            </div>
          </div>

          {/* Quality Distribution */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
              Quality Distribution
            </h4>

            {/* Video Quality Distribution */}
            <div className="mb-3">
              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                Video:
              </div>
              <div className="flex gap-1 text-xs">
                {Object.entries(roomMetrics.videoQualityDistribution).map(
                  ([quality, count]) => (
                    <div key={quality} className="flex items-center gap-1">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          quality === "excellent"
                            ? "bg-green-500"
                            : quality === "good"
                            ? "bg-blue-500"
                            : quality === "fair"
                            ? "bg-yellow-500"
                            : quality === "poor"
                            ? "bg-red-500"
                            : "bg-gray-500"
                        }`}
                      ></div>
                      <span className="text-gray-700 dark:text-gray-300">
                        {quality}: {count}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Audio Quality Distribution */}
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                Audio:
              </div>
              <div className="flex gap-1 text-xs">
                {Object.entries(roomMetrics.audioQualityDistribution).map(
                  ([quality, count]) => (
                    <div key={quality} className="flex items-center gap-1">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          quality === "excellent"
                            ? "bg-green-500"
                            : quality === "good"
                            ? "bg-blue-500"
                            : quality === "fair"
                            ? "bg-yellow-500"
                            : quality === "poor"
                            ? "bg-red-500"
                            : "bg-gray-500"
                        }`}
                      ></div>
                      <span className="text-gray-700 dark:text-gray-300">
                        {quality}: {count}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomMetricsDisplay;
