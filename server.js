var express = require("express");
var app = express();
var path = require('path');
var AWS = require('aws-sdk');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 8070;
var fs = require('fs');
var dateFormat = require('dateformat');
var convs = [];
var clientList = [];

AWS.config.update({
    region: "us-west-2",
    endpoint: "http://localhost:8000",
    accessKeyId: "aws-access",
    secretAccessKey: "secret-key"
});

function readSettings() {
    var _settings = JSON.parse(fs.readFileSync('settings.json'));
    return _settings;
}

function readChatLog() {
    try {
        var _chatLog = JSON.parse(fs.readFileSync('./public/conversation.json'));
    } catch (err) {
        console.log('No conversation.json file found, creating...');
        writeMessagesToFile(convs);
        var _chatLog = convs;
    };

    return _chatLog;
}

var settings = readSettings();

server.listen(port, function() {
    console.log('Server listening at port %d', port);
    
    setInterval(function() {
        settings = readSettings();
    }, 1000);

    setInterval(function() {
        if (settings.File) {
            writeMessagesToFile(convs);
        }
    }, 5000);

    convs = readChatLog();
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', __dirname + '/tpl');
app.set('view engine', "jade");
app.engine('jade', require('jade').__express);
app.get("/", function(req, res){
    res.render("page");
});

// Chatroom
var numUsers = 0;

io.on('connection', function(socket) {
    var addedUser = false;
    
    socket.emit('catch up', convs);

    // Client emits 'new message', this listens then executes
    socket.on('new message', function(msg, username) {
        var username = socket.username;
        var now = new Date();
        var date = JSON.stringify(dateFormat(now, "mmmm dS, yyyy, h:MM:ss TT"));
        var chatMsg = {
            username: username,
            message: msg,
            date: date
        }

        socket.broadcast.emit('new message', chatMsg);
        
        convs.push(chatMsg);

        // Limit the conversations array to the settings.Storage value
        if (convs.length > settings.Storage) {
            var iterate = convs.length - settings.Storage;
            for (var i = 0; i < iterate; i++) {
                convs.shift();
            }
        }

        if (settings.Database) {
            writeMessageToDB(username, msg, date);
        }

        console.log('message added to feed - conversation count: ', convs.length);
    });

    //Client emits 'add user', this listens then executes
    socket.on('add user', function(username){
        if(addedUser) return;

        //store the username in the socket session for this client
        socket.username = username;
        ++numUsers;
        clientList.push(username);
        addedUser = true;
        socket.emit('login', {
            numUsers: numUsers,
            clientList: clientList
        });

        // globablly echo (all clients) that a person has connected
        socket.broadcast.emit('user joined', {
            username: socket.username,
            numUsers: numUsers,
            clientList: clientList
        });

    });

    // when client emits 'typing', broadcast to others
    socket.on('typing', function(){
        socket.broadcast.emit('typing', {
            username: socket.username
        });
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function() {
        if(addedUser) {
            --numUsers;

            var index = clientList.indexOf(socket.username);
            clientList.splice(index, 1);

            // globally echo that this client has left
            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers,  
                clientList: clientList
            });
        }
    });
});

// Write to JSON File
function writeMessagesToFile(convs) {
    fs.writeFile('./public/conversation.json', JSON.stringify(convs), 'utf-8', function(err){
        if(err) throw err
    });
}

// Save to DynamoDB
function writeMessageToDB(username, msg, date) {
    var docClient = new AWS.DynamoDB.DocumentClient();
    var table = "MessageList";
    var params = {
        TableName: table,
        Item: {
            "name": username,
            "msg": msg,
            "date": date
        }
    };

    console.log("Adding new conversation...");
    docClient.put(params, function(err, data){
        if(err) {
            console.error("Unable to add conversation. Error JSON: ", JSON.stringify(err, null, 2));
        } else {
            console.log("Added conversation to: ", table);
        }
    });
}
