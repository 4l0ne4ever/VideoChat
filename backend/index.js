const express = require('express');
const bodyParser = require('body-parser');
const {Server} = require('socket.io');

const io = new Server(
    {cors: true,}
);
const app = express();

app.use(bodyParser.json());
const emailToSocketMapping = new Map();
const socketToEmailMapping = new Map();
const socketToRoomMapping = new Map();

// Performance metrics storage
const performanceMetrics = new Map(); // roomId -> metrics array
const roomMetrics = new Map(); // roomId -> aggregated metrics

io.on('connection', (socket) => {
    socket.on("join-room", (data) =>{
        const {roomId, emailId} = data;
        console.log("User joined room", data);
        emailToSocketMapping.set(emailId, socket.id);
        socketToEmailMapping.set(socket.id, emailId);
        socketToRoomMapping.set(socket.id, roomId);
        socket.join(roomId);
        socket.emit("joined-room", {roomId});
        socket.broadcast.to(roomId).emit("user-joined", {emailId});
    })

    socket.on("call-user", data =>{
        const {emailId, offer} = data;
        const fromEmail = socketToEmailMapping.get(socket.id);
        const socketId = emailToSocketMapping.get(emailId);
        console.log(`Sending call-user to ${emailId}, socketId: ${socketId}, from: ${fromEmail}`);
        socket.to(socketId).emit("incomming-call", {from: fromEmail, offer});
    })

    socket.on('call-accepted', (data)=>{
        const {emailId, ans} = data;
        const fromEmail = socketToEmailMapping.get(socket.id);
        const socketId = emailToSocketMapping.get(emailId);
        socket.to(socketId).emit('call-accepted', {ans, from: fromEmail})
    })

    socket.on('ice-candidate', (data) => {
        const {emailId, candidate} = data;
        const fromEmail = socketToEmailMapping.get(socket.id);
        const socketId = emailToSocketMapping.get(emailId);
        socket.to(socketId).emit('ice-candidate', {candidate, from: fromEmail});
    })

    // Handle mute state changes
    socket.on('mute-state-changed', (data) => {
        const {userId, isMuted} = data;
        const fromEmail = socketToEmailMapping.get(socket.id);
        const roomId = socketToRoomMapping.get(socket.id);
        console.log(`User ${fromEmail} ${isMuted ? 'muted' : 'unmuted'} in room ${roomId}`);
        // Broadcast to all users in the room except sender
        socket.broadcast.to(roomId).emit('mute-state-changed', {userId: fromEmail, isMuted});
    })

    // Handle video state changes
    socket.on('video-state-changed', (data) => {
        const {userId, isVideoOff} = data;
        const fromEmail = socketToEmailMapping.get(socket.id);
        const roomId = socketToRoomMapping.get(socket.id);
        console.log(`User ${fromEmail} video ${isVideoOff ? 'turned off' : 'turned on'} in room ${roomId}`);
        // Broadcast to all users in the room except sender
        socket.broadcast.to(roomId).emit('video-state-changed', {userId: fromEmail, isVideoOff});
    })

    // Handle explicit user disconnect (when clicking end call button)
    socket.on('user-disconnect', () => {
        const emailId = socketToEmailMapping.get(socket.id);
        const roomId = socketToRoomMapping.get(socket.id);

        if (emailId && roomId) {
            console.log(`User ${emailId} explicitly disconnected from room ${roomId}`);
            // Notify other users in the room that this user left
            socket.broadcast.to(roomId).emit("user-left", {emailId});

            // Clean up mappings
            emailToSocketMapping.delete(emailId);
            socketToEmailMapping.delete(socket.id);
            socketToRoomMapping.delete(socket.id);
        }
        
        // Acknowledge the disconnect
        socket.emit('disconnect-acknowledged');
    })

    // Handle performance metrics from clients
    socket.on('performance-metrics', (data) => {
        const emailId = socketToEmailMapping.get(socket.id);
        const roomId = socketToRoomMapping.get(socket.id);
        
        if (emailId && roomId) {
            const { timestamp, metrics } = data;
            
            // Store individual user metrics
            if (!performanceMetrics.has(roomId)) {
                performanceMetrics.set(roomId, []);
            }
            
            const roomMetricsArray = performanceMetrics.get(roomId);
            roomMetricsArray.push({
                userId: emailId,
                timestamp,
                ...metrics
            });
            
            // Keep only last 1000 metrics per room to prevent memory issues
            if (roomMetricsArray.length > 1000) {
                roomMetricsArray.splice(0, roomMetricsArray.length - 1000);
            }
            
            // Calculate room aggregate metrics
            calculateRoomMetrics(roomId);
            
            console.log(`Received performance metrics from ${emailId} in room ${roomId}`);
        }
    })

    // Handle performance metrics query
    socket.on('get-room-metrics', () => {
        const emailId = socketToEmailMapping.get(socket.id);
        const roomId = socketToRoomMapping.get(socket.id);
        
        if (emailId && roomId) {
            const metrics = roomMetrics.get(roomId) || null;
            socket.emit('room-metrics', metrics);
        }
    })

    socket.on('disconnect', () => {
        const emailId = socketToEmailMapping.get(socket.id);
        const roomId = socketToRoomMapping.get(socket.id);

        if (emailId && roomId) {
            console.log(`User ${emailId} disconnected from room ${roomId}`);
            // Notify other users in the room that this user left
            socket.broadcast.to(roomId).emit("user-left", {emailId});

            // Clean up mappings
            emailToSocketMapping.delete(emailId);
            socketToEmailMapping.delete(socket.id);
            socketToRoomMapping.delete(socket.id);
        }
    })
})

// Calculate aggregated metrics for a room
function calculateRoomMetrics(roomId) {
    const roomMetricsArray = performanceMetrics.get(roomId) || [];
    
    if (roomMetricsArray.length === 0) {
        return;
    }
    
    // Get recent metrics (last 30 seconds)
    const thirtySecondsAgo = Date.now() - 30000;
    const recentMetrics = roomMetricsArray.filter(m => m.timestamp > thirtySecondsAgo);
    
    if (recentMetrics.length === 0) {
        return;
    }
    
    // Calculate averages
    const totalUsers = new Set(recentMetrics.map(m => m.userId)).size;
    const avgLatency = recentMetrics.reduce((sum, m) => sum + (m.averageLatency || 0), 0) / recentMetrics.length;
    const avgPacketLoss = recentMetrics.reduce((sum, m) => sum + (m.totalPacketLoss || 0), 0) / recentMetrics.length;
    const avgJitter = recentMetrics.reduce((sum, m) => sum + (m.averageJitter || 0), 0) / recentMetrics.length;
    
    // Count quality distributions
    const videoQualityCounts = {};
    const audioQualityCounts = {};
    
    recentMetrics.forEach(m => {
        const vq = m.videoQuality || 'unknown';
        const aq = m.audioQuality || 'unknown';
        videoQualityCounts[vq] = (videoQualityCounts[vq] || 0) + 1;
        audioQualityCounts[aq] = (audioQualityCounts[aq] || 0) + 1;
    });
    
    // Determine dominant quality
    const dominantVideoQuality = Object.keys(videoQualityCounts).reduce((a, b) => 
        videoQualityCounts[a] > videoQualityCounts[b] ? a : b, 'unknown');
    const dominantAudioQuality = Object.keys(audioQualityCounts).reduce((a, b) => 
        audioQualityCounts[a] > audioQualityCounts[b] ? a : b, 'unknown');
    
    const aggregatedMetrics = {
        roomId,
        totalUsers,
        averageLatency: Math.round(avgLatency),
        averagePacketLoss: Math.round(avgPacketLoss * 100) / 100,
        averageJitter: Math.round(avgJitter * 100) / 100,
        dominantVideoQuality,
        dominantAudioQuality,
        videoQualityDistribution: videoQualityCounts,
        audioQualityDistribution: audioQualityCounts,
        sampleCount: recentMetrics.length,
        lastUpdated: Date.now()
    };
    
    roomMetrics.set(roomId, aggregatedMetrics);
    
    // Broadcast room metrics to all users in the room
    io.to(roomId).emit('room-metrics-update', aggregatedMetrics);
}

// API endpoint to get room performance metrics
app.get('/api/room-metrics/:roomId', (req, res) => {
    const { roomId } = req.params;
    const metrics = roomMetrics.get(roomId);
    
    if (metrics) {
        res.json(metrics);
    } else {
        res.status(404).json({ error: 'Room not found or no metrics available' });
    }
});

// API endpoint to get all performance metrics for analysis
app.get('/api/performance-data/:roomId', (req, res) => {
    const { roomId } = req.params;
    const rawMetrics = performanceMetrics.get(roomId) || [];
    
    // Get query parameters for filtering
    const { startTime, endTime, userId } = req.query;
    
    let filteredMetrics = rawMetrics;
    
    if (startTime) {
        const start = new Date(startTime).getTime();
        filteredMetrics = filteredMetrics.filter(m => m.timestamp >= start);
    }
    
    if (endTime) {
        const end = new Date(endTime).getTime();
        filteredMetrics = filteredMetrics.filter(m => m.timestamp <= end);
    }
    
    if (userId) {
        filteredMetrics = filteredMetrics.filter(m => m.userId === userId);
    }
    
    res.json({
        roomId,
        metricsCount: filteredMetrics.length,
        metrics: filteredMetrics
    });
});

// Clean up old metrics periodically (every 5 minutes)
setInterval(() => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    
    for (const [roomId, metrics] of performanceMetrics.entries()) {
        const filteredMetrics = metrics.filter(m => m.timestamp > fiveMinutesAgo);
        
        if (filteredMetrics.length === 0) {
            // Remove empty rooms
            performanceMetrics.delete(roomId);
            roomMetrics.delete(roomId);
        } else {
            performanceMetrics.set(roomId, filteredMetrics);
        }
    }
    
    console.log(`Cleaned up old metrics. Active rooms: ${performanceMetrics.size}`);
}, 5 * 60 * 1000);

app.listen(8000, () => console.log('HTTP Server started on port 8000'));
io.listen(8001);
console.log('Socket.io server started on port 8001');