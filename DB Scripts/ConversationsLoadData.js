var AWS = require("aws-sdk");
var fs = require('fs');

AWS.config.update({
    region: "us-west-2",
    endpoint: "http://localhost:8000"
});

var docClient = new AWS.DynamoDB.DocumentClient();

console.log("Importing conversations into DynamoDB. Please wait.");

var allConversations = JSON.parse(fs.readFileSync('./public/conversation.json', 'utf8'));
allConversations.forEach(function(conv) {
    var params = {
        TableName: "Conversations",
        Item: {
            "user":  conv.user,
            "msg": conv.msg,
            "date":  conv.date
        }
    };

    docClient.put(params, function(err, data) {
       if (err) {
           console.error("Unable to add movie", conv.title, ". Error JSON:", JSON.stringify(err, null, 2));
       } else {
           console.log("PutItem succeeded:", conv.title);
       }
    });
});