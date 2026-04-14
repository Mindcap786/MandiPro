const http = require('http');
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      console.log('--- ERROR RECEIVED FROM BROWSER ---');
      console.log(body);
      console.log('-----------------------------------');
      res.end('ok');
    });
  } else {
    res.end('ready');
  }
});
server.listen(3001, () => console.log('Listening on 3001 for error logs...'));
