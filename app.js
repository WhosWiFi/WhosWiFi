var express = require('express');
var app = express();
var fs = require('fs');


app.get('/', function (req, res) {
    fs.readFile('index.html', function (err, data) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        return res.end();
      });
});

app.listen(5123, function () {
  console.log('Example app listening on port 5123!');
});