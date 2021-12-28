const WebSocket = require("ws");
const AWS = require("aws-sdk");
const os = require("os");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(cors());
app.use(morgan('combined'));



const WS_PORT = 5000;
const WEB_PORT = 8080;
const CHECK_INTERVAL = 10;
const HOSTNAME = os.hostname()
const TABLE = "host-table"


app.post('/action', function (req, res) {
  const data = req.body
  const host_id = data.host_id;
  if (!registry.hasOwnProperty(host_id)) {
    res.send("NOT FOUND");
    return;
  };
  registry[data.host_id].ws.send(
    JSON.stringify(data)
  );
  res.send("OK");
  return;
})

app.listen(WEB_PORT, function () {
  console.log(`WEBSERVER on port ${WEB_PORT}`);
})

AWS.config.update({ region: 'us-east-1' })

var docClient = new AWS.DynamoDB.DocumentClient();


function addHostEntry(host_id) {
  var params = {
    TableName: TABLE,
    Item: {
      "host_id": host_id,
      "gateway_hostname": HOSTNAME
    }
  }

  docClient.put(params, function (err, data) {
    if (err) {
      console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
    }
  });
}


const server = new WebSocket.Server({ port: WS_PORT });


function heartBeat() {
  this.isAlive = true;
}

var registry = {};

function getIdFromObject(obj) {
  for (const id in registry) {
    if (obj == registry[id].ws) {
      return id;
    }
  }
  return null;
}

function registrationHandler(ws, payload) {
  key = payload.key;
  host_id = payload.host_id;

  if (key == "ABC123" || key == "ABC456") {
    // simulate succesful authentication and registration
    registry[host_id] = {};
    registry[host_id].authenticated = true;
    registry[host_id].ws = ws;
    console.log(`REGISTER DONE: ${host_id}`);
    addHostEntry(host_id);
    registry[host_id].ws.send(
      JSON.stringify({
        message: "OK",
      })
    );
    return;
  }
  ws.terminate();
  return;
}

function handleMessage(ws, message) {
  switch (message.command) {
    case "register":
      return registrationHandler(ws, message.payload);
    case "debug":
      return ws.send(JSON.stringify(registry));
    default:
      break;
  }
  return;
}

server.on("connection", (socket, req) => {
  console.log(`CONNECTED to ${req.socket.remoteAddress}`);
  socket.isAlive = true;
  socket.on("pong", heartBeat);

  socket.on("message", (message) => {
    if (typeof registry[socket] != "undefined") {
      console.log(`Message from [${registry[socket].host_id}]: ${message}`);
    }
    message = JSON.parse(message.toString());
    handleMessage(socket, message);
  });
});

const check_interval = setInterval(function check() {
  server.clients.forEach(function eachWS(ws) {
    id = getIdFromObject(ws);
    if (id == null) {
      ws.send("REGISTRATION TIME OUT");
      return ws.terminate();
    }
    if (ws.isAlive == false) {
      console.log(`CLOSING SOCKET WITH [${id}]: REASON (No response)`);
      delete registry[id];
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, CHECK_INTERVAL * 1000);



