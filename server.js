const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

app.get('/tiles/:provider/:z/:x/:y.png', (req, res) => {
  const { provider, z, x, y } = req.params;
  const tilePath = path.join(__dirname, 'tiles', provider, z, x, `${y}.png`);
  
  res.sendFile(tilePath, (err) => {
    if (err) {
      res.status(404).send('Tile not found');
    }
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
