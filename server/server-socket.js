/**
 * Socket.IO manager stub.
 * The unified server now manages socket.io directly in server.js.
 * This file exists so any legacy imports don't crash.
 */

let io = null;

function init(server) {
  // no-op: socket.io is initialized in server.js
}

function getIo() {
  return io;
}

function getSocketFromSocketID(socketId) {
  return io?.sockets?.sockets?.get(socketId) || null;
}

function addUser(user, socket) {
  // no-op stub
}

function removeUser(user, socket) {
  // no-op stub
}

export { init, getIo, getSocketFromSocketID, addUser, removeUser };
