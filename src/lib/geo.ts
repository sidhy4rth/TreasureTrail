export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
}

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function geoErrorText(err: GeolocationPositionError | Error) {
  if ('code' in err) {
    if (err.code === 1) return 'Location is blocked. Allow location for this site in your browser settings, then reload. (iPhone: Settings → Privacy → Location Services → Safari Websites → While Using.)';
    if (err.code === 2) return "Your phone can't find a GPS signal. Turn on Location / GPS and step outside.";
    if (err.code === 3) return 'GPS is taking too long. Step into the open and try again.';
  }
  return err.message || 'Location failed.';
}

/**
 * Watches GPS and calls back with every fix, keeping the most accurate recent one.
 * Returns a stop function.
 */
export function watchGps(onFix: (f: Fix) => void, onError: (msg: string) => void): () => void {
  if (!('geolocation' in navigator)) {
    onError("This browser can't share location. Try Chrome or Safari.");
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp || Date.now() }),
    (e) => onError(geoErrorText(e)),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function fmtCoord(lat: number, lng: number) {
  return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lng).toFixed(5)}°${lng >= 0 ? 'E' : 'W'}`;
}
