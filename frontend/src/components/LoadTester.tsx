import React, { useState, useCallback, useRef } from "react";

interface LoadTestConfig {
  numberOfConnections: number;
  duration: number; // in seconds
  videoEnabled: boolean;
  audioEnabled: boolean;
  bitrateLimit: number; // kbps
  packetLossSimulation: number; // percentage
  latencySimulation: number; // ms
}

interface LoadTestResult {
  connectionId: string;
  connectTime: number;
  disconnectTime?: number;
  averageLatency: number;
  packetsLost: number;
  totalPackets: number;
  bytesTransferred: number;
  errors: string[];
  status: "connecting" | "connected" | "disconnected" | "error";
}

interface LoadTesterProps {
  isVisible: boolean;
  onToggle: () => void;
  serverUrl: string;
}

const LoadTester: React.FC<LoadTesterProps> = ({
  isVisible,
  onToggle,
  serverUrl,
}) => {
  const [config, setConfig] = useState<LoadTestConfig>({
    numberOfConnections: 5,
    duration: 60,
    videoEnabled: true,
    audioEnabled: true,
    bitrateLimit: 1000,
    packetLossSimulation: 0,
    latencySimulation: 0,
  });

  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<LoadTestResult[]>([]);
  const [overallStats, setOverallStats] = useState({
    successfulConnections: 0,
    failedConnections: 0,
    averageConnectionTime: 0,
    totalBandwidthUsed: 0,
    averageLatency: 0,
    totalPacketLoss: 0,
  });

  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const testStartTime = useRef<number>(0);

  // Create synthetic media stream for testing
  const createSyntheticStream = useCallback(async (): Promise<MediaStream> => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;

    // Draw a simple pattern that changes over time
    const drawFrame = () => {
      const time = Date.now() / 1000;
      ctx.fillStyle = `hsl(${(time * 50) % 360}, 50%, 50%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "white";
      ctx.font = "20px Arial";
      ctx.fillText(`Test Stream ${Math.floor(time)}`, 50, 50);

      // Draw moving circle
      ctx.beginPath();
      ctx.arc(
        ((Math.sin(time) + 1) * canvas.width) / 2,
        ((Math.cos(time) + 1) * canvas.height) / 2,
        30,
        0,
        2 * Math.PI
      );
      ctx.fillStyle = "red";
      ctx.fill();
    };

    // Update frame at 30 FPS
    const frameInterval = setInterval(drawFrame, 1000 / 30);

    const videoStream = canvas.captureStream(30);

    // Create synthetic audio stream
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
    gain.gain.setValueAtTime(0.1, audioContext.currentTime); // Low volume

    oscillator.connect(gain);
    const audioDestination = audioContext.createMediaStreamDestination();
    gain.connect(audioDestination);
    oscillator.start();

    const mediaStream = new MediaStream();

    if (config.videoEnabled) {
      videoStream
        .getVideoTracks()
        .forEach((track) => mediaStream.addTrack(track));
    }

    if (config.audioEnabled) {
      audioDestination.stream
        .getAudioTracks()
        .forEach((track) => mediaStream.addTrack(track));
    }

    // Clean up when stream ends
    mediaStream.addEventListener("inactive", () => {
      clearInterval(frameInterval);
      oscillator.stop();
      audioContext.close();
    });

    return mediaStream;
  }, [config.videoEnabled, config.audioEnabled]);

  // Create test connection
  const createTestConnection = useCallback(
    async (connectionId: string): Promise<LoadTestResult> => {
      const startTime = Date.now();
      const result: LoadTestResult = {
        connectionId,
        connectTime: startTime,
        averageLatency: 0,
        packetsLost: 0,
        totalPackets: 0,
        bytesTransferred: 0,
        errors: [],
        status: "connecting",
      };

      try {
        // Create peer connection with test configuration
        const peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        connectionsRef.current.set(connectionId, peerConnection);

        // Add synthetic media stream
        const stream = await createSyntheticStream();
        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });

        // Set up data channel for latency testing
        const dataChannel = peerConnection.createDataChannel("test", {
          ordered: true,
        });

        const latencyMeasurements: number[] = [];
        let pingInterval: NodeJS.Timeout;

        dataChannel.onopen = () => {
          result.status = "connected";
          setResults((prev) =>
            prev.map((r) => (r.connectionId === connectionId ? result : r))
          );

          // Start ping-pong for latency measurement
          pingInterval = setInterval(() => {
            if (dataChannel.readyState === "open") {
              dataChannel.send(
                JSON.stringify({ type: "ping", timestamp: Date.now() })
              );
            }
          }, 1000);
        };

        dataChannel.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "pong") {
              const latency = Date.now() - data.timestamp;
              latencyMeasurements.push(latency);
              result.averageLatency =
                latencyMeasurements.reduce((a, b) => a + b, 0) /
                latencyMeasurements.length;
            }
          } catch (error) {
            result.errors.push(`Data channel message error: ${error}`);
          }
        };

        // Monitor connection stats
        const statsInterval = setInterval(async () => {
          try {
            const stats = await peerConnection.getStats();
            let totalBytesReceived = 0;
            let totalBytesSent = 0;
            let totalPacketsReceived = 0;
            let totalPacketsSent = 0;
            let totalPacketsLost = 0;

            stats.forEach((report) => {
              if (report.type === "inbound-rtp") {
                totalBytesReceived += report.bytesReceived || 0;
                totalPacketsReceived += report.packetsReceived || 0;
                totalPacketsLost += report.packetsLost || 0;
              } else if (report.type === "outbound-rtp") {
                totalBytesSent += report.bytesSent || 0;
                totalPacketsSent += report.packetsSent || 0;
              }
            });

            result.bytesTransferred = totalBytesReceived + totalBytesSent;
            result.totalPackets = totalPacketsReceived + totalPacketsSent;
            result.packetsLost = totalPacketsLost;

            setResults((prev) =>
              prev.map((r) =>
                r.connectionId === connectionId ? { ...result } : r
              )
            );
          } catch (error) {
            result.errors.push(`Stats collection error: ${error}`);
          }
        }, 2000);

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
          if (
            peerConnection.connectionState === "failed" ||
            peerConnection.connectionState === "disconnected"
          ) {
            result.status =
              peerConnection.connectionState === "failed"
                ? "error"
                : "disconnected";
            result.disconnectTime = Date.now();
            clearInterval(pingInterval);
            clearInterval(statsInterval);
            setResults((prev) =>
              prev.map((r) => (r.connectionId === connectionId ? result : r))
            );
          }
        };

        // Simulate network conditions if configured
        if (config.packetLossSimulation > 0 || config.latencySimulation > 0) {
          // Note: Actual network simulation would require more complex setup
          result.errors.push(
            "Network simulation not fully implemented in browser environment"
          );
        }

        // Create and set local description
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // For testing purposes, we'll create a loopback connection
        const answerPc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        answerPc.ondatachannel = (event) => {
          const channel = event.channel;
          channel.onmessage = (msgEvent) => {
            try {
              const data = JSON.parse(msgEvent.data);
              if (data.type === "ping") {
                channel.send(
                  JSON.stringify({ type: "pong", timestamp: data.timestamp })
                );
              }
            } catch (error) {
              console.error("Answer PC message error:", error);
            }
          };
        };

        await answerPc.setRemoteDescription(offer);
        const answer = await answerPc.createAnswer();
        await answerPc.setLocalDescription(answer);
        await peerConnection.setRemoteDescription(answer);

        return result;
      } catch (error) {
        result.status = "error";
        result.errors.push(`Connection error: ${error}`);
        result.disconnectTime = Date.now();
        return result;
      }
    },
    [config, createSyntheticStream]
  );

  // Start load test
  const startLoadTest = useCallback(async () => {
    setIsRunning(true);
    setResults([]);
    testStartTime.current = Date.now();

    // Create initial result objects
    const initialResults: LoadTestResult[] = [];
    for (let i = 0; i < config.numberOfConnections; i++) {
      initialResults.push({
        connectionId: `conn-${i}`,
        connectTime: 0,
        averageLatency: 0,
        packetsLost: 0,
        totalPackets: 0,
        bytesTransferred: 0,
        errors: [],
        status: "connecting",
      });
    }
    setResults(initialResults);

    // Create connections with staggered timing to avoid overwhelming
    for (let i = 0; i < config.numberOfConnections; i++) {
      setTimeout(async () => {
        const result = await createTestConnection(`conn-${i}`);
        setResults((prev) =>
          prev.map((r) => (r.connectionId === result.connectionId ? result : r))
        );
      }, i * 500); // 500ms delay between connections
    }

    // Set up test duration timer
    setTimeout(() => {
      stopLoadTest();
    }, config.duration * 1000);

    // Update overall stats periodically
    intervalRef.current = setInterval(() => {
      updateOverallStats();
    }, 2000);
  }, [config, createTestConnection]);

  // Stop load test
  const stopLoadTest = useCallback(() => {
    setIsRunning(false);

    // Close all connections
    connectionsRef.current.forEach((pc, connectionId) => {
      pc.close();
      setResults((prev) =>
        prev.map((r) =>
          r.connectionId === connectionId
            ? { ...r, status: "disconnected", disconnectTime: Date.now() }
            : r
        )
      );
    });
    connectionsRef.current.clear();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    updateOverallStats();
  }, []);

  // Update overall statistics
  const updateOverallStats = useCallback(() => {
    const successful = results.filter((r) => r.status === "connected").length;
    const failed = results.filter((r) => r.status === "error").length;

    const avgConnectionTime =
      results.length > 0
        ? results.reduce(
            (sum, r) => sum + (r.disconnectTime || Date.now()) - r.connectTime,
            0
          ) / results.length
        : 0;

    const totalBandwidth = results.reduce(
      (sum, r) => sum + r.bytesTransferred,
      0
    );
    const avgLatency =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.averageLatency, 0) / results.length
        : 0;

    const totalPacketLoss =
      results.reduce(
        (sum, r) =>
          sum +
          (r.totalPackets > 0 ? (r.packetsLost / r.totalPackets) * 100 : 0),
        0
      ) / Math.max(results.length, 1);

    setOverallStats({
      successfulConnections: successful,
      failedConnections: failed,
      averageConnectionTime: avgConnectionTime,
      totalBandwidthUsed: totalBandwidth,
      averageLatency: avgLatency,
      totalPacketLoss: totalPacketLoss,
    });
  }, [results]);

  // Export test results
  const exportResults = useCallback(() => {
    const exportData = {
      config,
      overallStats,
      results,
      testDuration: Date.now() - testStartTime.current,
      timestamp: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = `load_test_results_${new Date().toISOString()}.json`;

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  }, [config, overallStats, results]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 left-4 w-96 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 z-50">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Load Tester
        </h3>
        <div className="flex gap-2">
          <button
            onClick={exportResults}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded"
            disabled={results.length === 0}
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

      {/* Configuration */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
        <h4 className="font-medium text-gray-900 dark:text-white mb-2">
          Configuration
        </h4>
        <div className="space-y-2 text-sm">
          <div>
            <label className="block text-gray-600 dark:text-gray-300">
              Connections:
            </label>
            <input
              type="number"
              value={config.numberOfConnections}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  numberOfConnections: parseInt(e.target.value) || 1,
                }))
              }
              min="1"
              max="50"
              disabled={isRunning}
              className="w-full px-2 py-1 border rounded dark:bg-gray-600 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-gray-600 dark:text-gray-300">
              Duration (seconds):
            </label>
            <input
              type="number"
              value={config.duration}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  duration: parseInt(e.target.value) || 60,
                }))
              }
              min="10"
              max="3600"
              disabled={isRunning}
              className="w-full px-2 py-1 border rounded dark:bg-gray-600 dark:text-white"
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.videoEnabled}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    videoEnabled: e.target.checked,
                  }))
                }
                disabled={isRunning}
                className="mr-1"
              />
              <span className="text-gray-600 dark:text-gray-300">Video</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.audioEnabled}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    audioEnabled: e.target.checked,
                  }))
                }
                disabled={isRunning}
                className="mr-1"
              />
              <span className="text-gray-600 dark:text-gray-300">Audio</span>
            </label>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={isRunning ? stopLoadTest : startLoadTest}
          className={`px-3 py-2 rounded text-white ${
            isRunning
              ? "bg-red-500 hover:bg-red-600"
              : "bg-green-500 hover:bg-green-600"
          }`}
        >
          {isRunning ? "Stop Test" : "Start Test"}
        </button>
      </div>

      {/* Overall Stats */}
      {results.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
          <h4 className="font-medium text-gray-900 dark:text-white mb-2">
            Overall Results
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>Success: {overallStats.successfulConnections}</div>
            <div>Failed: {overallStats.failedConnections}</div>
            <div>Avg Latency: {overallStats.averageLatency.toFixed(0)}ms</div>
            <div>Packet Loss: {overallStats.totalPacketLoss.toFixed(1)}%</div>
            <div className="col-span-2">
              Bandwidth: {formatBytes(overallStats.totalBandwidthUsed)}
            </div>
          </div>
        </div>
      )}

      {/* Individual Results */}
      {results.length > 0 && (
        <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
          <h4 className="font-medium text-gray-900 dark:text-white mb-2">
            Connections
          </h4>
          <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
            {results.map((result) => (
              <div
                key={result.connectionId}
                className="flex justify-between items-center"
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {result.connectionId}
                </span>
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    result.status === "connected"
                      ? "bg-green-500 text-white"
                      : result.status === "connecting"
                      ? "bg-yellow-500 text-white"
                      : result.status === "error"
                      ? "bg-red-500 text-white"
                      : "bg-gray-500 text-white"
                  }`}
                >
                  {result.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadTester;
