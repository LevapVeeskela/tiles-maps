# tiles-maps
leaflet-cluster testing and get local tile for any provide maps

# Example download googleMap for world
## cmd.exe
node index.js google 1 5 null ru 6

# Example download googleMap for Belarus 
## cmd.exe
node index.js google 6 16 "{\"north\": 56.2, \"south\": 51.2, \"west\": 23.2, \"east\": 32.8}" ru 15
## powershell
node index.js google 6 16 '{\"north\": 56.2, \"south\": 51.2, \"west\": 23.2, \"east\": 32.8}' ru 15

# Example download googleMap for Minsk
## cmd.exe
node index.js google 6 16 "{\"north\": 54.025, \"south\": 53.800, \"west\": 27.35, \"east\": 27.75}" ru 15
## powershell
node index.js google 6 16 '{\"north\": 54.025, \"south\": 53.800, \"west\": 27.35, \"east\": 27.75}' ru 15


# Example tile url for google maps
https://mt.google.com/vt/lyrs=y&x=1159&y=673&z=11&hl=ru
