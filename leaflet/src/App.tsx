import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L, { latLngBounds, LatLngExpression, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import styles from './styles.module.scss';

const BOUNDS_MINSK = {
  north: 54.025,
  south: 53.800,
  west: 27.35,
  east: 27.75
};

const bounds = latLngBounds(
  [BOUNDS_MINSK.south, BOUNDS_MINSK.west],
  [BOUNDS_MINSK.north, BOUNDS_MINSK.east]
);

const generateMarkers = (count: number): LatLngExpression[] => {
  const markers = [] as LatLngExpression[];
  for (let i = 0; i < count; i++) {
    const lat = BOUNDS_MINSK.south + Math.random() * (BOUNDS_MINSK.north - BOUNDS_MINSK.south);
    const lng = BOUNDS_MINSK.west + Math.random() * (BOUNDS_MINSK.east - BOUNDS_MINSK.west);
    markers.push([lat, lng]);
  }
  return markers;
};

const MapComponent = () => {
  const mapRef = useRef<LeafletMap | null>(null);
  const [mapType, setMapType] = useState<'google' | 'yandex'>('google');
  const markers = useMemo(() => generateMarkers(1000000), []);

  const tileLayerUrls = useMemo(() => ({
    google: "http://localhost:3000/tiles/google/{z}/{x}/{y}.png",
    yandex: "http://localhost:3000/tiles/yandex/{z}/{x}/{y}.png"
  }),[]);

  useEffect(() => {
    mapRef.current = L.map('map', {
      center: [53.9, 27.6],
      zoom: 12,
      minZoom: 12,
      maxZoom: 14,
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,
    });

    const tileLayer = L.tileLayer(tileLayerUrls[mapType], {
      attribution: mapType === 'google' ? 'Google' : 'Yandex',
    });
    tileLayer.addTo(mapRef.current);

    const markerClusterGroup = L.markerClusterGroup();
    markers.forEach((position, idx) => {
      const marker = L.marker(position).bindPopup(`Маркер #${idx + 1}`);
      markerClusterGroup.addLayer(marker);
    });
    mapRef.current.addLayer(markerClusterGroup);

    const LayerControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create('div', styles.layerSwitcher);
        container.style.backgroundColor = 'white';
        container.style.padding = '5px';
        container.style.cursor = 'pointer';

        const googleButton = L.DomUtil.create('button', '', container);
        googleButton.innerText = 'Google Map';
        googleButton.onclick = () => handleMapTypeChange('google');

        const yandexButton = L.DomUtil.create('button', '', container);
        yandexButton.innerText = 'Yandex Map';
        yandexButton.onclick = () => handleMapTypeChange('yandex');

        return container;
      }
    });
    
    const layerControl = new LayerControl();
    mapRef.current.addControl(layerControl);

    return () => {
      mapRef.current?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, []);

  const handleMapTypeChange = useCallback((type: 'google' | 'yandex') => {
    setMapType(type);

    if (mapRef.current) {
      mapRef.current.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          mapRef.current?.removeLayer(layer);
        }
      });

      const newTileLayer = L.tileLayer(tileLayerUrls[type], {
        attribution: type === 'google' ? 'Google' : 'Yandex',
      });
      newTileLayer.addTo(mapRef.current);
    }
  }, [tileLayerUrls]);

  return (
    <div className={styles.mapContainer}>
      <div id="map" className={styles.containerMap}></div>
    </div>
  );
};

export default MapComponent;
