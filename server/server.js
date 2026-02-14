/*
|--------------------------------------------------------------------------
| server.js -- The core of your server
|--------------------------------------------------------------------------
|
| This file defines how your server starts up. Think of it as the main() of your server.
| At a high level, this file does the following things:
| - Connect to the database
| - Sets up server middleware (i.e. addons that enable things like json parsing, user login)
| - Hooks up all the backend routes specified in api.js
| - Fowards frontend routes that should be handled by the React router
| - Sets up error handling in case something goes wrong when handling a request
| - Actually starts the webserver
*/

// validator runs some basic checks to make sure you've set everything up correctly
// this is a tool provided by staff, so you don't need to worry about it
const validator = require("./validator");
validator.checkSetup();

//allow us to use process.ENV
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

//import libraries needed for the webserver to work!
const http = require("http");
const express = require("express"); // backend framework for our node server.

const api = require("./api");

// socket stuff
const socketManager = require("./server-socket");

// create a new express server
const app = express();
app.use(validator.checkRoutes);

// IMPORTANT: Twilio sends application/x-www-form-urlencoded by default
app.use(express.urlencoded({ extended: false }));

// allow us to process POST requests
app.use(express.json());

// Twilio routes first (has specific /api/calls, /twilio/* paths)
const twilioRoutes = require("./twilio");
app.use("/", twilioRoutes);

// General API routes (has catch-all 404, so must come after twilio)
app.use("/api", api);

// load the compiled react files, which will serve /index.html and /bundle.js
const reactPath = path.resolve(__dirname, "..", "client", "dist");
app.use(express.static(reactPath));

// for all other routes, render index.html and let react router handle it
app.get("*", (req, res) => {
  res.sendFile(path.join(reactPath, "index.html"), (err) => {
    if (err) {
      console.log("Error sending client/dist/index.html:", err.status || 500);
      res.status(err.status || 500).send("Error sending client/dist/index.html - have you run `npm run build`?");
    }
  });
});

// any server errors cause this function to run
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) {
    // 500 means Internal Server Error
    console.log("The server errored when processing a request!");
    console.log(err);
  }

  res.status(status);
  res.send({
    status: status,
    message: err.message,
  });
});

// hardcode port to 3000 for now
const port = 3000;
const server = http.Server(app);
socketManager.init(server);

server.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
