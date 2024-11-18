const fs = require('fs');
const path = require('path');
const process = require('process');
const dayjs = require('dayjs');
const axios = require('axios');

const FAILED_TILES_LOG = 'failed_tiles.log';
const LOG_FOLDER = 'logs';
const TILE_FOLDER = 'tiles';
const MAX_LOG_LINES = 150000;

if (!fs.existsSync(LOG_FOLDER)) {
  fs.mkdirSync(LOG_FOLDER);
}

function getLogFileName() {
  const date = dayjs().format('YYYY-MM-DD_HH-mm-ss');
  return path.join(LOG_FOLDER, `log_${date}.log`);
}

let logFileName = getLogFileName();
let logLines = 0;

function logToFile(message) {
  if (logLines >= MAX_LOG_LINES) {
    logFileName = getLogFileName();
    logLines = 0;
  }
  fs.appendFileSync(logFileName, `${new Date().toISOString()} - ${message}\n`);
  logLines++;
}

function isTileInBounds(x, y, z, bounds) {
  if (!bounds) return true;
  const n = Math.pow(2, z);
  const lon_deg = x / n * 360.0 - 180.0;
  const lat_rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const lat_deg = lat_rad * 180.0 / Math.PI;

  return lat_deg >= bounds.south && lat_deg <= bounds.north && lon_deg >= bounds.west && lon_deg <= bounds.east;
}

async function saveTile(tileUrl, x, y, z, provider) {
  const outputDir = path.join(TILE_FOLDER, provider, z.toString(), x.toString());
  const outputFile = path.join(outputDir, `${y}.png`);

  if (fs.existsSync(outputFile)) {
    logToFile(`Tile already exists: ${outputFile}`);
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

async function downloadTilesForZoom(providerInstance, z, bounds, maxThreads, lang) {
  const tilePromises = [];
  let totalTiles = 0;
  let completedTiles = 0;

  // Count total tiles before download
  for (let x = 0; x < Math.pow(2, z); x++) {
    for (let y = 0; y < Math.pow(2, z); y++) {
      if (!bounds || isTileInBounds(x, y, z, bounds)) {
        totalTiles++;
      }
    }
  }

  logToFile(`Total tiles to download for zoom level ${z}: ${totalTiles}`);

  // Main download loop
  for (let x = 0; x < Math.pow(2, z); x++) {
    for (let y = 0; y < Math.pow(2, z); y++) {
      if (!bounds || isTileInBounds(x, y, z, bounds)) {
        tilePromises.push(async () => {
          const tileUrl = providerInstance.getTileUrl(x, y, z, lang);
          try {
            await saveTile(tileUrl, x, y, z, providerInstance.name, lang);
            completedTiles++;
            const progress = ((completedTiles / totalTiles) * 100).toFixed(2);
            console.log(`Progress for zoom level ${z}: ${progress}% (${completedTiles}/${totalTiles})`);
            logToFile(`Progress for zoom level ${z}: ${progress}% (${completedTiles}/${totalTiles})`);
          } catch (error) {
            fs.appendFileSync(FAILED_TILES_LOG, `${providerInstance.name},${z},${x},${y},${lang}\n`);
            logToFile(`Failed tile: ${z},${x},${y},${lang}`);
          }
        });

        if (tilePromises.length === maxThreads) {
          await Promise.all(tilePromises.map(promise => promise()));
          tilePromises.length = 0;
        }
      }
    }
  }

  // Process remaining promises
  if (tilePromises.length > 0) {
    await Promise.all(tilePromises.map(promise => promise()));
  }

  logToFile(`All tiles downloaded for zoom level ${z}.`);
}

async function processFailedTiles(providerInstance, maxThreads) {
  if (!fs.existsSync(FAILED_TILES_LOG)) return;

  const failedTiles = fs.readFileSync(FAILED_TILES_LOG, 'utf-8').trim().split('\n');
  if (failedTiles.length === 0) return;

  const tilePromises = [];
  let completedTiles = 0;
  const totalTiles = failedTiles.length;

  logToFile(`Retrying ${totalTiles} failed tiles.`);

  for (const line of failedTiles) {
    const [providerName, z, x, y, lang] = line.split(',');
    tilePromises.push(async () => {
      const tileUrl = providerInstance.getTileUrl(parseInt(x), parseInt(y), parseInt(z), lang);
      try {
        await saveTile(tileUrl, parseInt(x), parseInt(y), parseInt(z), providerName, lang);
        completedTiles++;
        const progress = ((completedTiles / totalTiles) * 100).toFixed(2);
        console.log(`Retry Progress: ${progress}% (${completedTiles}/${totalTiles})`);
        logToFile(`Retry Progress: ${progress}% (${completedTiles}/${totalTiles})`);
      } catch (error) {
        logToFile(`Failed tile again: ${z},${x},${y},${lang}`);
      }
    });

    if (tilePromises.length === maxThreads) {
      await Promise.all(tilePromises.map(promise => promise()));
      tilePromises.length = 0;
    }
  }

  // Process remaining failed tiles
  if (tilePromises.length > 0) {
    await Promise.all(tilePromises.map(promise => promise()));
  }

  fs.unlinkSync(FAILED_TILES_LOG); // Remove the file after processing
  logToFile('Finished processing failed tiles.');
}

// Tile provider factory
class TileProviderFactory {
  static create(providerName, lang = null) {
    switch (providerName) {
      case 'google':
        return new GoogleTileProvider(lang);
      case 'yandex':
        return new YandexTileProvider(lang);
      case 'osm':
        return new OpenStreetMapTileProvider();
      case 'bing':
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

async function main() {
  const providerName = process.argv[2];
  const zoomStart = parseInt(process.argv[3]);
  const zoomEnd = parseInt(process.argv[4]) || zoomStart;
  const bounds = process.argv[5] ? JSON.parse(process.argv[5]) : null;
  const lang = process.argv[6] || 'ru';
  const maxThreads = parseInt(process.argv[7]) || 6;

  const providerInstance = TileProviderFactory.create(providerName, lang);

  await processFailedTiles(providerInstance, maxThreads);

  for (let z = zoomStart; z <= zoomEnd; z++) {
    console.log(`Starting download for zoom level ${z}...`);
    logToFile(`Starting download for zoom level ${z}...`);
    await downloadTilesForZoom(providerInstance, z, bounds, maxThreads, lang);
    console.log(`Completed download for zoom level ${z}`);
    logToFile(`Completed download for zoom level ${z}`);
  }

  await processFailedTiles(providerInstance, maxThreads);
}

main().catch(err => {
  console.error('An error occurred:', err);
});
