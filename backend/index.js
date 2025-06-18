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

app.listen(8000, () => console.log('HTTP Server started on port 8000'));
io.listen(8001);
console.log('Socket.io server started on port 8001');