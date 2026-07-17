import { useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection } from "geojson";
import type { QuartierGeoJson } from "@/features/quartiers/useQuartiers";

const FRANCE_CENTER: [number, number] = [46.6, 1.88];

function FitBounds({ data }: { data: FeatureCollection | null }) {
  const map = useMap();
  useEffect(() => {
    if (!data || !data.features.length) return;
    const bounds = L.geoJSON(data as never).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  }, [data, map]);
  return null;
}

/** Carte OpenStreetMap des polygones de quartiers, cadrée sur leur emprise. */
export function QuartiersMap({ quartiers }: { quartiers: QuartierGeoJson[] }) {
  const featureCollection: FeatureCollection | null = quartiers.length
    ? {
        type: "FeatureCollection",
        features: quartiers.map((q) => ({
          type: "Feature",
          geometry: q.geojson,
          properties: { id: q.id, name: q.name, color: q.color },
        })),
      }
    : null;

  return (
    // `isolate` : les panes Leaflet ont des z-index élevés, on les confine ici
    <div className="relative isolate h-96 w-full overflow-hidden rounded-lg border border-border">
      <MapContainer center={FRANCE_CENTER} zoom={5} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {featureCollection && (
          <GeoJSON
            key={quartiers.map((q) => q.id).join(",")}
            data={featureCollection}
            style={(feature) => ({
              color: (feature?.properties?.color as string | null) ?? "hsl(153 90% 32%)",
              weight: 2,
              fillOpacity: 0.3,
            })}
          />
        )}
        <FitBounds data={featureCollection} />
      </MapContainer>
    </div>
  );
}
