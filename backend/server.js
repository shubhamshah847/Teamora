import app from "./src/app.js";
const port = Number(process.env.PORT) || 3001;
import http from "http";
import initializeSocket from "./src/utils/socket.js";

const server = http.createServer(app)

const io = initializeSocket(server);
app.set('io', io);




server.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});