/*
|--------------------------------------------------------------------------
| api.js -- server routes
|--------------------------------------------------------------------------
|
| This file defines the routes for your server.
|
*/

const express = require("express");

// api endpoints: all these paths will be prefixed with "/api/"
const router = express.Router();

//initialize socket
const socketManager = require("./server-socket");

router.post("/initsocket", (req, res) => {
  const socket = socketManager.getSocketFromSocketID(req.body.socketid);
  if (socket) {
    socketManager.addUser({ _id: "dashboard-demo" }, socket);
  }
  res.send({});
});

router.get("/health", (req, res) => {
  res.send({ ok: true });
});

// |------------------------------|
// | write your API methods below!|
// |------------------------------|

const agent = require("./services/callAgent");

router.post("/chat", async (req, res) => {
  try {
    const { message, conversation_id } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Provide 'message'" });
    }
    if (!agent.isConfigured()) {
      return res.status(503).json({
        error: "AI service not configured. Set KIBANA and ELASTICSEARCH_API_KEY in .env.",
      });
    }
    const result = await agent.converse(message, conversation_id);
    res.json({ conversation_id: result.conversation_id, response: result.response });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

// anything else falls to this "not found" case
router.all("*", (req, res) => {
  console.log(`API route not found: ${req.method} ${req.url}`);
  res.status(404).send({ msg: "API route not found" });
});

module.exports = router;
