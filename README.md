# Cafe Curator

Cafe Curator is a simple browser-based cafe finder that helps you discover nearby cafes, swipe through results, and save places you want to visit later.

## Features

- Finds cafes near your current location
- Lets you browse cafes as swipeable cards
- Save or skip cafes with swipe gestures or buttons
- View and manage your saved cafes in one place
- Adjust the search radius to explore a wider or smaller area
- Pulls cafe data and details from OpenStreetMap-based services

## How It Works

1. Click **Find Cafes Near Me** to allow location access.
2. The app loads nearby cafes from OpenStreetMap data.
3. Swipe right or click **Save** to keep a cafe.
4. Swipe left or click **Skip** to move on.
5. Open **My Saved Cafes** anytime to review your shortlist.

## Project Structure

- `index.html` - App layout and UI
- `styles.css` - Visual design and responsive styling
- `script.js` - Location lookup, cafe loading, swipe logic, and saved-cafe handling

## Data Sources

This project uses:

- [OpenStreetMap](https://www.openstreetmap.org/) for cafe data
- [Overpass API](https://overpass-api.de/) to query nearby cafes
- [Nominatim](https://nominatim.org/) for reverse geocoding
- [Wikimedia Commons](https://commons.wikimedia.org/) when cafe images are available

## Local Use

This is a static web app, so you can open it in a browser from a local server such as Live Server in VS Code.

If you want, the app can also be hosted on any static site platform.

## Notes

- Saved cafes are stored in your browser's local storage.
- Location access is required to search for nearby cafes.
- Cafe results depend on the data available in OpenStreetMap for your area.