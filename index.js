var express = require("express");
var app = express();
var path = require('path');
var AWS = require('aws-sdk');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.port || 8070;
var fs = require('fs');
var dateFormat = require('dateformat');


AWS.config.update({
    region: "us-west-2",
    endpoint: "http://localhost:8000",
    accessKeyId: "aws-access",
    secretAccessKey: "secret-key"
});


server.listen(port, function() {
    console.log('Server listening at port %d', port);
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

    // Client emits 'new message', this listens then executes
    socket.on('new message', function(msg, username) {
        var username = socket.username;
        var now = new Date();
        var date = JSON.stringify(dateFormat(now, "mmmm dS, yyyy, h:MM:ss TT"));
        socket.broadcast.emit('new message', {
            user: username,
            message: msg

        });
        
        // Write to JSON File
        fs.readFile('./public/conversation.json', 'utf-8', function(err, data){
            if(err) throw err

            var convObjects = JSON.parse(data)
            convObjects.convs.push({
                name: username,
                msg: msg,
                date: date
            })

            fs.writeFile('./public/conversation.json', JSON.stringify(convObjects), 'utf-8', function(err){
                if(err) throw err
                console.log('Done!');
            });
        });
        
        // Save to DynamoDB
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
                console.log("Added conversation: ", JSON.stringify(data, null, 2));
            }
        });

        // Read from DynamoDB -- TEST --
        var testName = "Jason";
        var testDate = "\"December 1st, 2017, 6:02:26 PM\"";

        var tparams = {
            TableName: table,
            Key:{
                "name": testName,
                "date": testDate
            }
        };

        docClient.get(tparams, function(err, data){
            if(err) {
                console.error("Unable to retrieve message. Error JSON: ", JSON.stringify(err, null, 2));
            } else {
                console.log("Successfully retrieved message: ", JSON.stringify(data, null, 2));
            }
        });

    });

    //Client emits 'add user', this listens then executes
    socket.on('add user', function(username){
        if(addedUser) return;

        //store the username in the socket session for this client
        socket.username = username;
        ++numUsers;
        addedUser = true;
        socket.emit('login', {
            numUsers: numUsers
        });

        // globablly echo (all clients) that a person has connected
        socket.broadcast.emit('user joined', {
            username: socket.username,
            numUsers: numUsers
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

            // globally echo that this client has left
            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers   
            });
        }
    });
});