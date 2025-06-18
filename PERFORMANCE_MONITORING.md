# WebRTC Video Chat - Performance Monitoring Guide

## Tổng quan

Project này đã được tích hợp các công cụ đánh giá hiệu suất toàn diện để monitor và phân tích chất lượng cuộc gọi video WebRTC. Hệ thống bao gồm:

## 1. Performance Monitor (Individual Client Metrics)

### Tính năng:

- **Real-time WebRTC Statistics**: Thu thập metrics từ RTCStatsReport
- **Network Performance**: Độ trễ, packet loss, jitter, bandwidth
- **Video Quality Metrics**: FPS, resolution, bitrate, quality limitations
- **Audio Quality Metrics**: Audio levels, codec performance
- **System Resource Usage**: Memory usage, network I/O
- **Export Data**: Xuất dữ liệu JSON để phân tích offline

### Metrics được thu thập:

```typescript
interface ConnectionStats {
  userId: string;
  connectionState: string;
  iceConnectionState: string;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  packetsLost: number;
  roundTripTime: number; // RTT in milliseconds
  jitter: number; // Jitter in milliseconds
  framesPerSecond: number; // Video FPS
  frameWidth: number; // Video resolution width
  frameHeight: number; // Video resolution height
  audioLevel: number; // Audio signal level
  availableOutgoingBitrate: number; // Available bandwidth
  retransmittedPacketsSent: number;
  nackCount: number; // Negative acknowledgments
  firCount: number; // Full Intra Request count
  pliCount: number; // Picture Loss Indication count
  qualityLimitationReason: string; // Video quality limitation reason
  qualityLimitationDurations: Record<string, number>;
  timestamp: number;
}
```

### Cách sử dụng:

1. Trong room, click nút **⚙️** (màu xanh lá) để mở Performance Monitor
2. Click **🔴 Record** để bắt đầu ghi lại metrics
3. Click **📥 Export** để xuất dữ liệu

## 2. Room Metrics Display (Aggregated Room-level Metrics)

### Tính năng:

- **Room-wide Statistics**: Metrics tổng hợp từ tất cả user trong room
- **Quality Distribution**: Phân bố chất lượng video/audio của toàn room
- **Network Health**: Trạng thái mạng chung của room
- **Real-time Updates**: Cập nhật tự động từ server

### Metrics được tính toán:

```typescript
interface RoomMetrics {
  roomId: string;
  totalUsers: number;
  averageLatency: number; // Trung bình RTT của room
  averagePacketLoss: number; // Trung bình packet loss %
  averageJitter: number; // Trung bình jitter ms
  dominantVideoQuality: string; // Chất lượng video phổ biến nhất
  dominantAudioQuality: string; // Chất lượng audio phổ biến nhất
  videoQualityDistribution: Record<string, number>;
  audioQualityDistribution: Record<string, number>;
  sampleCount: number; // Số lượng sample đã thu thập
  lastUpdated: number;
}
```

### Cách sử dụng:

1. Click nút **📊** (màu tím) để mở Room Metrics
2. Click **📊 Refresh** để cập nhật metrics thủ công
3. Metrics sẽ tự động cập nhật mỗi 30 giây

## 3. Load Tester (Stress Testing)

### Tính năng:

- **Multi-connection Testing**: Tạo nhiều kết nối đồng thời để test tải
- **Synthetic Media Streams**: Tạo video/audio stream giả lập
- **Network Simulation**: Mô phỏng packet loss và latency
- **Performance Benchmarking**: Đo hiệu suất hệ thống dưới tải cao
- **Automated Testing**: Chạy test tự động theo thời gian định trước

### Configuration Options:

```typescript
interface LoadTestConfig {
  numberOfConnections: number; // Số kết nối đồng thời (1-50)
  duration: number; // Thời gian test (giây)
  videoEnabled: boolean; // Bật/tắt video test
  audioEnabled: boolean; // Bật/tắt audio test
  bitrateLimit: number; // Giới hạn bitrate (kbps)
  packetLossSimulation: number; // Mô phỏng packet loss (%)
  latencySimulation: number; // Mô phỏng latency (ms)
}
```

### Cách sử dụng:

1. Click nút **🔧** (màu cam) để mở Load Tester
2. Cấu hình số lượng connections và thời gian test
3. Chọn enable video/audio
4. Click **Start Test** để bắt đầu
5. Click **📥 Export** để xuất kết quả test

## 4. Backend Performance Analytics

### API Endpoints:

#### GET /api/room-metrics/:roomId

Lấy metrics tổng hợp của room

```json
{
  "roomId": "room123",
  "totalUsers": 5,
  "averageLatency": 45,
  "averagePacketLoss": 0.2,
  "averageJitter": 12.5,
  "dominantVideoQuality": "good",
  "dominantAudioQuality": "excellent",
  "videoQualityDistribution": {
    "excellent": 2,
    "good": 2,
    "fair": 1
  },
  "audioQualityDistribution": {
    "excellent": 4,
    "good": 1
  },
  "sampleCount": 150,
  "lastUpdated": 1640995200000
}
```

#### GET /api/performance-data/:roomId

Lấy raw performance data với filtering

```
Query parameters:
- startTime: ISO timestamp
- endTime: ISO timestamp
- userId: Filter by specific user
```

### Socket Events:

#### Client → Server:

- `performance-metrics`: Gửi metrics từ client
- `get-room-metrics`: Request room metrics

#### Server → Client:

- `room-metrics`: Response room metrics
- `room-metrics-update`: Real-time room metrics update

## 5. Quality Assessment Algorithm

### Video Quality Scoring:

- **Excellent (80-100)**: Low packet loss (<1%), RTT <100ms, FPS ≥24, low jitter
- **Good (60-79)**: Moderate packet loss (1-3%), RTT 100-200ms, FPS 15-23
- **Fair (40-59)**: Higher packet loss (3-5%), RTT 200-300ms, FPS 10-14
- **Poor (<40)**: High packet loss (>5%), RTT >300ms, FPS <10

### Audio Quality Scoring:

- **Excellent (85-100)**: Very low packet loss (<0.5%), RTT <100ms, jitter <20ms
- **Good (70-84)**: Low packet loss (0.5-2%), RTT 100-150ms, jitter 20-30ms
- **Fair (50-69)**: Moderate issues, RTT 150-250ms, jitter 30-50ms
- **Poor (<50)**: Significant issues, high latency/jitter/packet loss

## 6. Performance Optimization Tips

### Network Optimization:

1. **Monitor RTT**: Giữ RTT dưới 150ms cho audio, 200ms cho video
2. **Packet Loss**: Duy trì packet loss dưới 1% cho quality tốt
3. **Jitter Management**: Giữ jitter dưới 30ms cho audio ổn định
4. **Bandwidth**: Đảm bảo đủ bandwidth cho số lượng participants

### System Resource:

1. **Memory Usage**: Monitor heap size, tránh memory leak
2. **CPU Usage**: Optimize video encoding/decoding
3. **Connection Limits**: Test với số lượng user thực tế

### Scaling Considerations:

1. **Horizontal Scaling**: Sử dụng multiple servers cho rooms lớn
2. **Media Servers**: Cân nhắc SFU/MCU cho >4-6 participants
3. **Geographic Distribution**: Deploy servers gần user locations

## 7. Troubleshooting Common Issues

### High Latency:

- Check network routing
- Verify STUN/TURN server placement
- Monitor server response times

### Packet Loss:

- Network congestion
- Insufficient bandwidth
- Hardware issues

### Video Quality Issues:

- CPU overload
- Network bandwidth limitations
- Camera/encoding problems

### Audio Problems:

- Echo cancellation issues
- Microphone quality
- Audio codec compatibility

## 8. Monitoring Dashboard Setup

Để setup monitoring dashboard production:

1. **Prometheus Integration**: Export metrics sang Prometheus
2. **Grafana Dashboards**: Tạo visual dashboards
3. **Alerting**: Setup alerts cho quality degradation
4. **Log Aggregation**: Collect logs từ tất cả components

### Example Grafana Queries:

```promql
# Average latency by room
avg(webrtc_latency_ms) by (room_id)

# Packet loss rate
rate(webrtc_packets_lost_total[5m]) / rate(webrtc_packets_total[5m]) * 100

# Connection success rate
rate(webrtc_connections_successful[5m]) / rate(webrtc_connections_total[5m]) * 100
```

## 9. Testing Scenarios

### Basic Functional Tests:

- 2-user video call
- Audio-only call
- Screen sharing
- Connection recovery

### Performance Tests:

- Maximum concurrent users
- Network degradation scenarios
- Extended duration calls
- Resource usage under load

### Stress Tests:

- Connection saturation
- Memory leak detection
- CPU usage spikes
- Network failure recovery

Hệ thống monitoring này cung cấp đầy đủ thông tin cần thiết để đánh giá, tối ưu và troubleshoot hiệu suất của WebRTC video chat application.
