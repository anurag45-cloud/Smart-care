import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";

const pin = L.divIcon({
  className: "sc-leaflet-pin",
  html: '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0284C7;border:3px solid #fff;box-shadow:0 2px 8px rgba(2,132,199,.45)"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -24],
});

export default function MapView({ latitude, longitude, name, address, height = 320 }) {
  if (typeof latitude !== "number" || typeof longitude !== "number" || isNaN(latitude) || isNaN(longitude)) {
    return (
      <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500" style={{ height }} data-testid="map-unavailable">
        <MapPin className="h-8 w-8 mb-2 text-slate-400" />
        <p className="text-sm">Map location is not available for this hospital yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm z-0" style={{ height }} data-testid="hospital-map">
      <MapContainer center={[latitude, longitude]} zoom={15} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]} icon={pin}>
          <Popup>
            <div className="text-sm">
              <strong>{name}</strong>
              {address && <div>{address}</div>}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
