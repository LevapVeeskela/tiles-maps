const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BOUNDS_BELARUS = { north: 56.2, south: 51.2, west: 23.2, east: 32.8 };
const BOUNDS_MINSK = {
  north: 54.025,   // северная широта
  south: 53.800,   // южная широта
  west: 27.35,     // западная долгота
  east: 27.75      // восточная долгота
};

class TileProvider {
  constructor (baseUrl, options) {
    this.baseUrl = baseUrl;
    this.options = options;
  }

  getTileUrl(x, y, z) {
    let url = this.baseUrl;
    url = url.replace('{x}', x).replace('{y}', y).replace('{z}', z);
    Object.keys(this.options).forEach(key => {
      url = url.replace(`{${key}}`, this.options[key]);
    });
    return url;
  }
}

class TileProviderFactory {
  static create(providerName) {
    switch (providerName) {
      case 'google':
        return new TileProvider('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {});
      case 'yandex':
        return new TileProvider('https://core-renderer-tiles.maps.yandex.net/tiles?l=map&v=21.07.10-0&x={x}&y={y}&z={z}&scale=1&lang=ru_RU', {});
      default:
        throw new Error(`Provider "${providerName}" is not supported`);
    }
  }
}

// Преобразование широты и долготы в координаты тайла
function latLonToTile(lat, lon, zoom) {
  const xTile = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const yTile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  return { x: xTile, y: yTile };
}

// Сохранение неудачной попытки загрузки в лог
function logFailedTile(x, y, z, provider) {
  const logEntry = `${provider},${z},${x},${y}\n`;
  fs.appendFileSync('failed_tiles.log', logEntry);
  console.log(`Logged failed tile: Provider=${provider}, Zoom=${z}, x=${x}, y=${y}`);
}

// Сохранение тайла на диске
async function saveTile(url, x, y, z, provider) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const dir = path.join(__dirname, 'tiles', provider, `${z}`, `${x}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${y}.png`), response.data);
    console.log(`Tile saved: Provider=${provider}, Zoom=${z}, x=${x}, y=${y}`);
  } catch (error) {
    console.error(`Failed to download tile: Provider=${provider}, Zoom=${z}, x=${x}, y=${y}`);
    logFailedTile(x, y, z, provider);
  }
}

// Основная функция для скачивания тайлов для заданного провайдера и границ
async function downloadTiles(minZoom, maxZoom, providerName, bounds) {
  const provider = TileProviderFactory.create(providerName);

  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const { x: xMin, y: yMin } = latLonToTile(bounds.north, bounds.west, zoom);
    const { x: xMax, y: yMax } = latLonToTile(bounds.south, bounds.east, zoom);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const tileUrl = provider.getTileUrl(x, y, zoom);
        await saveTile(tileUrl, x, y, zoom, providerName);
      }
    }
  }
}

// Метод для повторной попытки скачивания тайлов из лога
async function retryFailedTiles() {
  if (!fs.existsSync('failed_tiles.log')) {
    console.log("No failed tiles log found.");
    return;
  }

  const failedTiles = fs.readFileSync('failed_tiles.log', 'utf-8').trim().split('\n');
  const remainingFailedTiles = [];

  for (const line of failedTiles) {
    const [provider, z, x, y] = line.split(',');
    const providerInstance = TileProviderFactory.create(provider);
    const tileUrl = providerInstance.getTileUrl(x, y, z);

    try {
      await saveTile(tileUrl, x, y, z, provider);
    } catch (error) {
      // Если снова не удалось скачать тайл, добавляем его в новый лог
      remainingFailedTiles.push(line);
    }
  }

  // Перезаписываем лог только оставшимися неудачными попытками
  fs.writeFileSync('failed_tiles.log', remainingFailedTiles.join('\n'));
  console.log("Retry of failed tiles complete.");
}

// Пример вызова для скачивания тайлов Google и Yandex для Беларуси
downloadTiles(12, 14, 'google', BOUNDS_MINSK);
// downloadTiles(12, 17, 'yandex', BOUNDS_MINSK);

// Вызов для повторной попытки скачивания неудачных тайлов
// retryFailedTiles();
