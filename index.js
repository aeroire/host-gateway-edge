const WebSocket = require("ws");
const http = require("http");
const AWS = require("aws-sdk");
const WS_PORT = 5000;
const WEB_PORT = 8080;
const CHECK_INTERVAL = 10;

AWS.config.update({ region: 'us-east-1' })
var sqs = new AWS.SQS({ apiVersion: '2012-11-05' })

let QueueUrl;

var params = {
  QueueName: 'AEROIRE-DEV-host-message-queue',
};
sqs.getQueueUrl(params, function (err, data) {
  if (err) console.log(err, err.stack);
  else QueueUrl = data.QueueUrl;
});

function sendSQSMessage(message) {
  var params = {
    DelaySeconds: 0,
    MessageAttributes: {},
    MessageBody: message,
    QueueUrl: QueueUrl
  };

  sqs.sendMessage(params, function (err, data) {
    if (err) console.log("ERROR ", err);
    else console.log("SUCCESS ", data.MessageId);
  })
}


const server = new WebSocket.Server({ port: WS_PORT });

http.createServer(function (req, res) {
  res.write('Hello World!');
  res.end();
}).listen(WEB_PORT);
console.log("WEBSERVER ON PORT 8080 RUNNING!");


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
    sendSQSMessage(`REGISTER DONE: ${host_id}`)
    ws.send(
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
      console.log(registry);
      return ws.send(JSON.stringify(registry));
    default:
      break;
  }
  return;
}

server.on("connection", (socket, req) => {
  console.log(`CONNECTED to ${req.socket.remoteAddress}`);
  sendSQSMessage(`CONNECTED to ${req.socket.remoteAddress}`)
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
