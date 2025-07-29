const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files (including index.html)
app.use(express.static(__dirname));

// API endpoint to run the script
app.post('/run-extractor', (req, res) => {
  exec('node extract_token.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).send('Script error');
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
    }
    res.send('Extractor script executed');
  });
});

// Automatically run the extractor script at server startup
exec('node extract_token.js', (error, stdout, stderr) => {
  if (error) {
    console.error(`Startup extractor error: ${error.message}`);
  }
  if (stderr) {
    console.error(`Startup extractor stderr: ${stderr}`);
  }
  if (stdout) {
    console.log(`Startup extractor stdout: ${stdout}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});