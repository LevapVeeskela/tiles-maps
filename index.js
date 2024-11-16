const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Логирование в файл
const logToFile = (message, logFile = 'download.log') => {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
};

// Tile provider factory
class TileProviderFactory {
  static create(providerName, lang = null) {
    switch (providerName) {
      case 'google':
        return new GoogleTileProvider(lang);
      case 'yandex':
        return new YandexTileProvider(lang);
      case 'osm': // OpenStreetMap
        return new OpenStreetMapTileProvider();
      case 'bing': // Bing Maps
        return new BingTileProvider();
      default:
        throw new Error(`Provider "${providerName}" is not supported`);
    }
  }
}

// Google Maps provider
class GoogleTileProvider {
  constructor (lang) {
    this.name = 'google';
    this.langParam = lang ? `&hl=${lang}` : '';
  }

  getTileUrl(x, y, z) {
    return `https://mt.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}${this.langParam}`;
  }
}

// Yandex Maps provider
class YandexTileProvider {
  constructor (lang) {
    this.name = 'yandex';
    this.langParam = lang ? `&lang=${lang}` : '';
  }

  getTileUrl(x, y, z) {
    return `https://core-renderer-tiles.maps.yandex.net/tiles?l=sat&x=${x}&y=${y}&z=${z}${this.langParam}`;
  }
}

// OpenStreetMap provider
class OpenStreetMapTileProvider {
  constructor () {
    this.name = 'osm';
  }

  getTileUrl(x, y, z) {
    return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }
}

// Bing Maps provider
class BingTileProvider {
  constructor () {
    this.name = 'bing';
  }

  getTileUrl(x, y, z) {
    return `https://ecn.t${(x + y) % 4}.tiles.virtualearth.net/tiles/a${quadKey(x, y, z)}.png?g=1`;
  }
}

// Convert x, y, z to Bing's quadkey format
function quadKey(x, y, z) {
  let key = '';
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    key += digit;
  }
  return key;
}

// Check if tile is within bounds
function isTileInBounds(x, y, z, bounds) {
  const n = Math.pow(2, z);
  const lon_deg = x / n * 360.0 - 180.0;
  const lat_rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const lat_deg = lat_rad * 180.0 / Math.PI;

  return lat_deg >= bounds.south && lat_deg <= bounds.north && lon_deg >= bounds.west && lon_deg <= bounds.east;
}

// Save tile to disk
async function saveTile(tileUrl, x, y, z, provider) {
  const outputDir = path.join('tiles', provider, z.toString(), x.toString());
  const outputFile = path.join(outputDir, `${y}.png`);

  if (fs.existsSync(outputFile)) {
    console.log(`Tile already exists: ${outputFile}`);
    return;
  }

  try {
    const response = await axios.get(tileUrl, { responseType: 'arraybuffer' });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputFile, response.data);
    console.log(`Saved tile: ${outputFile}`);
    logToFile(`Saved tile: ${outputFile}`);
  } catch (error) {
    console.error(`Failed to save tile: ${tileUrl}`);
    logToFile(`Failed to save tile: ${tileUrl}`);
    throw error;
  }
}

// Parallel tile download
async function downloadTilesParallel(providerInstance, z, bounds, lang, maxThreads = 6) {
  const tilePromises = [];
  let totalTiles = 0;
  let completedTiles = 0;

  for (let x = 0; x < Math.pow(2, z); x++) {
    for (let y = 0; y < Math.pow(2, z); y++) {
      if (!bounds || isTileInBounds(x, y, z, bounds)) {
        totalTiles++;
      }
    }
  }

  for (let x = 0; x < Math.pow(2, z); x++) {
    for (let y = 0; y < Math.pow(2, z); y++) {
      if (!bounds || isTileInBounds(x, y, z, bounds)) {
        tilePromises.push(async () => {
          const tileUrl = providerInstance.getTileUrl(x, y, z);
          try {
            await saveTile(tileUrl, x, y, z, providerInstance.name);
            completedTiles++;
            const progress = ((completedTiles / totalTiles) * 100).toFixed(2);
            console.log(`Progress: ${progress}% (${completedTiles}/${totalTiles})`);
            logToFile(`Progress: ${progress}% (${completedTiles}/${totalTiles})`);
          } catch (error) {
            fs.appendFileSync('failed_tiles.log', `${providerInstance.name},${z},${x},${y}\n`);
          }
        });

        if (tilePromises.length === maxThreads) {
          await Promise.all(tilePromises.map(promise => promise()));
          tilePromises.length = 0;
        }
      }
    }
  }

  if (tilePromises.length > 0) {
    await Promise.all(tilePromises.map(promise => promise()));
  }
}

// Download tiles for a range of zoom levels
async function downloadZoomRange(provider, zoomStart, zoomEnd, bounds, lang = 'ru', maxThreads = 6) {
  zoomEnd = zoomEnd || zoomStart;

  for (let z = zoomStart; z <= zoomEnd; z++) {
    console.log(`Starting download for zoom level ${z}...`);
    logToFile(`Starting download for zoom level ${z}...`);
    const providerInstance = TileProviderFactory.create(provider, lang);
    await downloadTilesParallel(providerInstance, z, bounds, lang, maxThreads);
    console.log(`Completed download for zoom level ${z}`);
    logToFile(`Completed download for zoom level ${z}`);
  }
}

// Main function
(async function main() {
  const provider = process.argv[2];
  const zoomStart = parseInt(process.argv[3]);
  const zoomEnd = parseInt(process.argv[4]) || zoomStart;
  const bounds = process.argv[5] ? JSON.parse(process.argv[5]) : null;
  const lang = process.argv[6] || 'ru';
  const maxThreads = parseInt(process.argv[7]) || 6;

  if (!provider || isNaN(zoomStart)) {
    console.error('Usage: node index.js    [lang] [maxThreads]');
    process.exit(1);
  }

  console.log(`Starting download for provider: ${provider}, Zoom range: ${zoomStart}-${zoomEnd}, Bounds: ${bounds ? JSON.stringify(bounds) : 'none'}, Lang: ${lang}, Max threads: ${maxThreads}`);
  logToFile(`Starting download for provider: ${provider}, Zoom range: ${zoomStart}-${zoomEnd}, Bounds: ${bounds ? JSON.stringify(bounds) : 'none'}, Lang: ${lang}, Max threads: ${maxThreads}`);
  await downloadZoomRange(provider, zoomStart, zoomEnd, bounds, lang, maxThreads);
})();