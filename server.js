const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files (including index.html)
app.use(express.static(__dirname));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API endpoint to run the script manually
app.post('/run-extractor', (req, res) => {
  console.log('Manual extractor execution requested');
  
  const extractorProcess = spawn('node', ['extract_token.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  let errorOutput = '';

  extractorProcess.stdout.on('data', (data) => {
    const message = data.toString();
    console.log('Manual extractor stdout:', message);
    output += message;
  });

  extractorProcess.stderr.on('data', (data) => {
    const message = data.toString();
    console.error('Manual extractor stderr:', message);
    errorOutput += message;
  });

  extractorProcess.on('close', (code) => {
    console.log(`Manual extractor process exited with code ${code}`);
    res.json({ 
      message: 'Manual extractor script executed', 
      exitCode: code,
      output: output,
      error: errorOutput
    });
  });

  extractorProcess.on('error', (error) => {
    console.error('Failed to start manual extractor process:', error);
    res.status(500).json({ error: 'Failed to start extractor', details: error.message });
  });
});

// API endpoint to check token status
app.get('/token-status', (req, res) => {
  const fs = require('fs');
  const tokenPath = path.join(__dirname, 'token.txt');
  
  if (fs.existsSync(tokenPath)) {
    const token = fs.readFileSync(tokenPath, 'utf8');
    res.json({ 
      hasToken: true, 
      tokenPreview: token.substring(0, 20) + '...',
      lastModified: fs.statSync(tokenPath).mtime
    });
  } else {
    res.json({ hasToken: false });
  }
});

// Start the continuous token extraction loop
console.log('Starting continuous token extraction loop...');

function startExtractionLoop() {
  const extractorProcess = spawn('node', ['extract_token.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  extractorProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    if (message) {
      console.log('Token extraction:', message);
    }
  });

  extractorProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message) {
      console.error('Token extraction error:', message);
    }
  });

  extractorProcess.on('close', (code) => {
    console.log(`Token extraction process exited with code ${code}, restarting in 5 minutes...`);
    // Restart the process after 5 minutes
    setTimeout(() => {
      console.log('Restarting token extraction loop...');
      startExtractionLoop();
    }, 5 * 60 * 1000); // 5 minutes
  });

  extractorProcess.on('error', (error) => {
    console.error('Failed to start token extraction process:', error);
    // Retry after 1 minute on error
    setTimeout(() => {
      console.log('Retrying token extraction after error...');
      startExtractionLoop();
    }, 60 * 1000); // 1 minute
  });
}

// Start the extraction loop immediately
startExtractionLoop();

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Health check: GET http://localhost:${PORT}/health`);
  console.log(`Token extraction endpoint: POST http://localhost:${PORT}/run-extractor`);
  console.log(`Token status endpoint: GET http://localhost:${PORT}/token-status`);
  console.log('Continuous token extraction loop started - will run every 5 minutes');
});