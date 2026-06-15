# Test Hole Collector

A mobile-first field app for collecting test-hole data and producing a print-ready deliverable.

## Run

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173`.

## Current Workflow

- Enter project metadata.
- Add one record per test hole.
- Upload an aerial, GIS export, drone image, or plan-sheet crop.
- Or choose a coordinate system and generate an Esri aerial from the selected test hole's northing/easting.
- Tap the map image to place the selected test hole.
- Use the phone camera/photo picker to attach photos.
- Print the deliverable preview to PDF.
- Export CSV for spreadsheets, GeoJSON for GIS/mapping tools, or JSON for app backup/restore.
- Export a `.thproject.json` project file for local job folders and office editing.

## Map Piggyback Options

- Uploaded aerial or plan image: fastest, works offline, best for matching a sheet deliverable.
- Google Maps handoff: use GPS on a test hole, then Open Map to inspect the point externally.
- GeoJSON export: bring collected points into ArcGIS Pro, QGIS, Google Earth, Civil 3D workflows, or web maps.
- Future upgrade: connect directly to ArcGIS Field Maps/Survey123, QField, Mapbox, or a county/agency tile service if live basemaps and coordinate systems are needed.

## Coordinate-Based Aerials

Set the project coordinate system before using `Aerial From N/E`. Common options are included for Florida State Plane NAD83 US feet, WGS84 lat/long, and Web Mercator. If the project uses another system, enter its EPSG/WKID in `Custom WKID`.

The app sends the selected hole's easting/northing to ArcGIS GeometryServer, converts it to lat/long, and centers an Esri World Imagery aerial on that point.

## Project Files

Use `Export Project` to save the current project as a `.thproject.json` file. That file can be kept in a local project folder and restored later with `Restore` for office edits. Projects are still stored locally per device/browser unless a cloud database is added later.
