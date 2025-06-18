import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePeer } from "../providers/Peer";
import { useSocket } from "../providers/Socket";

interface ConnectionStats {
  userId: string;
  connectionState: string;
  iceConnectionState: string;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  packetsLost: number;
  roundTripTime: number;
  jitter: number;
  framesPerSecond: number;
  frameWidth: number;
  frameHeight: number;
  audioLevel: number;
  availableOutgoingBitrate: number;
  retransmittedPacketsSent: number;
  nackCount: number;
  firCount: number;
  pliCount: number;
  qualityLimitationReason: string;
  qualityLimitationDurations: Record<string, number>;
  timestamp: number;
}

interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  networkDownload: number;
  networkUpload: number;
  timestamp: number;
}

interface PerformanceMetrics {
  connectionStats: Map<string, ConnectionStats>;
  systemStats: SystemStats;
  callDuration: number;
  averageLatency: number;
  totalPacketLoss: number;
  averageJitter: number;
  videoQuality: "excellent" | "good" | "fair" | "poor";
  audioQuality: "excellent" | "good" | "fair" | "poor";
}

interface PerformanceMonitorProps {
  connectedUsers: Set<string>;
  isVisible: boolean;
  onToggle: () => void;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  connectedUsers,
  isVisible,
  onToggle,
}) => {
  const { getConnectionStats } = usePeer() || {};
  const { socket } = useSocket();
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    connectionStats: new Map(),
    systemStats: {
      cpuUsage: 0,
      memoryUsage: 0,
      networkDownload: 0,
      networkUpload: 0,
      timestamp: Date.now(),
    },
    callDuration: 0,
    averageLatency: 0,
    totalPacketLoss: 0,
    averageJitter: 0,
    videoQuality: "good",
    audioQuality: "good",
  });

  const [isRecording, setIsRecording] = useState(false);
  const metricsHistory = useRef<PerformanceMetrics[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const systemStatsRef = useRef<SystemStats>({
    cpuUsage: 0,
    memoryUsage: 0,
    networkDownload: 0,
    networkUpload: 0,
    timestamp: Date.now(),
  });

  // Collect WebRTC connection statistics
  const collectConnectionStats = useCallback(async (): Promise<
    Map<string, ConnectionStats>
  > => {
    const statsMap = new Map<string, ConnectionStats>();

    if (!getConnectionStats) return statsMap;

    for (const userId of connectedUsers) {
      try {
        const stats = await getConnectionStats(userId);
        if (!stats) continue;

        const connectionStat: ConnectionStats = {
          userId,
          connectionState: "unknown",
          iceConnectionState: "unknown",
          bytesReceived: 0,
          bytesSent: 0,
          packetsReceived: 0,
          packetsSent: 0,
          packetsLost: 0,
          roundTripTime: 0,
          jitter: 0,
          framesPerSecond: 0,
          frameWidth: 0,
          frameHeight: 0,
          audioLevel: 0,
          availableOutgoingBitrate: 0,
          retransmittedPacketsSent: 0,
          nackCount: 0,
          firCount: 0,
          pliCount: 0,
          qualityLimitationReason: "none",
          qualityLimitationDurations: {},
          timestamp: Date.now(),
        };

        stats.forEach((report: any) => {
          switch (report.type) {
            case "candidate-pair":
              if (report.state === "succeeded") {
                connectionStat.roundTripTime =
                  report.currentRoundTripTime * 1000 || 0;
                connectionStat.availableOutgoingBitrate =
                  report.availableOutgoingBitrate || 0;
              }
              break;

            case "inbound-rtp":
              if (report.mediaType === "video") {
                connectionStat.bytesReceived += report.bytesReceived || 0;
                connectionStat.packetsReceived += report.packetsReceived || 0;
                connectionStat.packetsLost += report.packetsLost || 0;
                connectionStat.jitter = report.jitter || 0;
                connectionStat.framesPerSecond = report.framesPerSecond || 0;
                connectionStat.frameWidth = report.frameWidth || 0;
                connectionStat.frameHeight = report.frameHeight || 0;
                connectionStat.nackCount = report.nackCount || 0;
                connectionStat.firCount = report.firCount || 0;
                connectionStat.pliCount = report.pliCount || 0;
              } else if (report.mediaType === "audio") {
                connectionStat.bytesReceived += report.bytesReceived || 0;
                connectionStat.packetsReceived += report.packetsReceived || 0;
                connectionStat.packetsLost += report.packetsLost || 0;
                connectionStat.jitter = Math.max(
                  connectionStat.jitter,
                  report.jitter || 0
                );
                connectionStat.audioLevel = report.audioLevel || 0;
              }
              break;

            case "outbound-rtp":
              if (report.mediaType === "video") {
                connectionStat.bytesSent += report.bytesSent || 0;
                connectionStat.packetsSent += report.packetsSent || 0;
                connectionStat.retransmittedPacketsSent +=
                  report.retransmittedPacketsSent || 0;
                connectionStat.qualityLimitationReason =
                  report.qualityLimitationReason || "none";
                connectionStat.qualityLimitationDurations =
                  report.qualityLimitationDurations || {};
              } else if (report.mediaType === "audio") {
                connectionStat.bytesSent += report.bytesSent || 0;
                connectionStat.packetsSent += report.packetsSent || 0;
              }
              break;

            case "peer-connection":
              connectionStat.connectionState =
                report.connectionState || "unknown";
              connectionStat.iceConnectionState =
                report.iceConnectionState || "unknown";
              break;
          }
        });

        statsMap.set(userId, connectionStat);
      } catch (error) {
        console.error(`Error collecting stats for ${userId}:`, error);
      }
    }

    return statsMap;
  }, [connectedUsers, getConnectionStats]);

  // Collect system performance stats
  const collectSystemStats = useCallback(async (): Promise<SystemStats> => {
    try {
      // Use Performance API to get memory info
      const memoryInfo = (performance as any).memory;
      const memoryUsage = memoryInfo
        ? (memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize) * 100
        : 0;

      // Network stats (estimated based on WebRTC data)
      let totalDownload = 0;
      let totalUpload = 0;

      if (getConnectionStats) {
        for (const userId of connectedUsers) {
          try {
            const stats = await getConnectionStats(userId);
            if (stats) {
              stats.forEach((report: any) => {
                if (report.type === "inbound-rtp") {
                  totalDownload += report.bytesReceived || 0;
                } else if (report.type === "outbound-rtp") {
                  totalUpload += report.bytesSent || 0;
                }
              });
            }
          } catch (error) {
            console.error(
              `Error collecting network stats for ${userId}:`,
              error
            );
          }
        }
      }

      // Calculate network speeds (bytes per second)
      const now = Date.now();
      const timeDiff = (now - systemStatsRef.current.timestamp) / 1000;
      const networkDownload =
        timeDiff > 0
          ? (totalDownload - systemStatsRef.current.networkDownload) / timeDiff
          : 0;
      const networkUpload =
        timeDiff > 0
          ? (totalUpload - systemStatsRef.current.networkUpload) / timeDiff
          : 0;

      const newStats: SystemStats = {
        cpuUsage: 0, // CPU usage is not directly available in browser
        memoryUsage,
        networkDownload,
        networkUpload,
        timestamp: now,
      };

      systemStatsRef.current = {
        ...newStats,
        networkDownload: totalDownload,
        networkUpload: totalUpload,
      };

      return newStats;
    } catch (error) {
      console.error("Error collecting system stats:", error);
      return systemStatsRef.current;
    }
  }, [connectedUsers, getConnectionStats]);

  // Calculate quality scores
  const calculateVideoQuality = useCallback(
    (
      stats: Map<string, ConnectionStats>
    ): "excellent" | "good" | "fair" | "poor" => {
      let totalScore = 0;
      let count = 0;

      stats.forEach((stat) => {
        let score = 100;

        // Deduct points for packet loss
        const packetLossRate =
          stat.packetsReceived > 0
            ? (stat.packetsLost / (stat.packetsReceived + stat.packetsLost)) *
              100
            : 0;
        score -= packetLossRate * 10;

        // Deduct points for high RTT
        if (stat.roundTripTime > 200) score -= 20;
        else if (stat.roundTripTime > 100) score -= 10;

        // Deduct points for low FPS
        if (stat.framesPerSecond < 15) score -= 30;
        else if (stat.framesPerSecond < 24) score -= 15;

        // Deduct points for high jitter
        if (stat.jitter > 50) score -= 20;
        else if (stat.jitter > 30) score -= 10;

        totalScore += Math.max(0, score);
        count++;
      });

      const averageScore = count > 0 ? totalScore / count : 100;

      if (averageScore >= 80) return "excellent";
      if (averageScore >= 60) return "good";
      if (averageScore >= 40) return "fair";
      return "poor";
    },
    []
  );

  const calculateAudioQuality = useCallback(
    (
      stats: Map<string, ConnectionStats>
    ): "excellent" | "good" | "fair" | "poor" => {
      let totalScore = 0;
      let count = 0;

      stats.forEach((stat) => {
        let score = 100;

        // Deduct points for packet loss
        const packetLossRate =
          stat.packetsReceived > 0
            ? (stat.packetsLost / (stat.packetsReceived + stat.packetsLost)) *
              100
            : 0;
        score -= packetLossRate * 15;

        // Deduct points for high RTT
        if (stat.roundTripTime > 150) score -= 25;
        else if (stat.roundTripTime > 100) score -= 15;

        // Deduct points for high jitter
        if (stat.jitter > 30) score -= 25;
        else if (stat.jitter > 20) score -= 15;

        totalScore += Math.max(0, score);
        count++;
      });

      const averageScore = count > 0 ? totalScore / count : 100;

      if (averageScore >= 85) return "excellent";
      if (averageScore >= 70) return "good";
      if (averageScore >= 50) return "fair";
      return "poor";
    },
    []
  );

  // Main metrics collection function
  const collectMetrics = useCallback(async () => {
    try {
      const connectionStats = await collectConnectionStats();
      const systemStats = await collectSystemStats();

      // Calculate aggregate metrics
      let totalLatency = 0;
      let totalPacketLoss = 0;
      let totalJitter = 0;
      let count = 0;

      connectionStats.forEach((stat) => {
        totalLatency += stat.roundTripTime;
        const packetLossRate =
          stat.packetsReceived > 0
            ? (stat.packetsLost / (stat.packetsReceived + stat.packetsLost)) *
              100
            : 0;
        totalPacketLoss += packetLossRate;
        totalJitter += stat.jitter;
        count++;
      });

      const newMetrics: PerformanceMetrics = {
        connectionStats,
        systemStats,
        callDuration: metrics.callDuration + 1,
        averageLatency: count > 0 ? totalLatency / count : 0,
        totalPacketLoss: count > 0 ? totalPacketLoss / count : 0,
        averageJitter: count > 0 ? totalJitter / count : 0,
        videoQuality: calculateVideoQuality(connectionStats),
        audioQuality: calculateAudioQuality(connectionStats),
      };

      setMetrics(newMetrics);

      // Store in history if recording
      if (isRecording) {
        metricsHistory.current.push(newMetrics);
      }

      // Emit metrics to server for aggregation
      socket.emit("performance-metrics", {
        timestamp: Date.now(),
        metrics: {
          averageLatency: newMetrics.averageLatency,
          totalPacketLoss: newMetrics.totalPacketLoss,
          averageJitter: newMetrics.averageJitter,
          videoQuality: newMetrics.videoQuality,
          audioQuality: newMetrics.audioQuality,
          connectedUsers: connectedUsers.size,
        },
      });
    } catch (error) {
      console.error("Error collecting metrics:", error);
    }
  }, [
    collectConnectionStats,
    collectSystemStats,
    calculateVideoQuality,
    calculateAudioQuality,
    metrics.callDuration,
    isRecording,
    socket,
    connectedUsers.size,
  ]);

  // Start/stop metrics collection
  useEffect(() => {
    if (connectedUsers.size > 0) {
      intervalRef.current = setInterval(collectMetrics, 2000); // Collect every 2 seconds
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [connectedUsers.size, collectMetrics]);

  // Export metrics data
  const exportMetrics = useCallback(() => {
    const dataStr = JSON.stringify(metricsHistory.current, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = `webrtc_metrics_${new Date().toISOString()}.json`;

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
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

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 right-4 w-96 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 max-h-96 overflow-y-auto z-50">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Performance Monitor
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`px-2 py-1 text-xs rounded ${
              isRecording ? "bg-red-500 text-white" : "bg-gray-500 text-white"
            }`}
          >
            {isRecording ? "⏹️ Stop" : "🔴 Record"}
          </button>
          <button
            onClick={exportMetrics}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded"
            disabled={metricsHistory.current.length === 0}
          >
            📥 Export
          </button>
          <button
            onClick={onToggle}
            className="px-2 py-1 text-xs bg-gray-500 text-white rounded"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Overall Metrics */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
        <h4 className="font-medium text-gray-900 dark:text-white mb-2">
          Overall Quality
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-300">Video: </span>
            <span className={getQualityColor(metrics.videoQuality)}>
              {metrics.videoQuality}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Audio: </span>
            <span className={getQualityColor(metrics.audioQuality)}>
              {metrics.audioQuality}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Duration: </span>
            <span className="text-gray-900 dark:text-white">
              {formatDuration(metrics.callDuration)}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Users: </span>
            <span className="text-gray-900 dark:text-white">
              {connectedUsers.size}
            </span>
          </div>
        </div>
      </div>

      {/* Network Metrics */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
        <h4 className="font-medium text-gray-900 dark:text-white mb-2">
          Network
        </h4>
        <div className="text-sm space-y-1">
          <div>
            <span className="text-gray-600 dark:text-gray-300">
              Avg Latency:{" "}
            </span>
            <span className="text-gray-900 dark:text-white">
              {metrics.averageLatency.toFixed(0)}ms
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">
              Packet Loss:{" "}
            </span>
            <span className="text-gray-900 dark:text-white">
              {metrics.totalPacketLoss.toFixed(2)}%
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Jitter: </span>
            <span className="text-gray-900 dark:text-white">
              {metrics.averageJitter.toFixed(1)}ms
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">
              ↓ Download:{" "}
            </span>
            <span className="text-gray-900 dark:text-white">
              {formatBytes(metrics.systemStats.networkDownload)}/s
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">↑ Upload: </span>
            <span className="text-gray-900 dark:text-white">
              {formatBytes(metrics.systemStats.networkUpload)}/s
            </span>
          </div>
        </div>
      </div>

      {/* System Resources */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
        <h4 className="font-medium text-gray-900 dark:text-white mb-2">
          System
        </h4>
        <div className="text-sm space-y-1">
          <div>
            <span className="text-gray-600 dark:text-gray-300">Memory: </span>
            <span className="text-gray-900 dark:text-white">
              {metrics.systemStats.memoryUsage.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Per-User Stats */}
      {metrics.connectionStats.size > 0 && (
        <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
          <h4 className="font-medium text-gray-900 dark:text-white mb-2">
            Per User
          </h4>
          <div className="space-y-2 text-xs">
            {Array.from(metrics.connectionStats.entries()).map(
              ([userId, stat]) => (
                <div
                  key={userId}
                  className="border-b border-gray-200 dark:border-gray-600 pb-2"
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    {userId}
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <div>RTT: {stat.roundTripTime.toFixed(0)}ms</div>
                    <div>FPS: {stat.framesPerSecond}</div>
                    <div>↓ {formatBytes(stat.bytesReceived)}</div>
                    <div>↑ {formatBytes(stat.bytesSent)}</div>
                    <div>Lost: {stat.packetsLost}</div>
                    <div>
                      Res: {stat.frameWidth}x{stat.frameHeight}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceMonitor;
