import { useEffect, useRef, useState } from "react";
import { Compass, ImageOff } from "lucide-react";
import { appwriteConfig } from "@/integrations/appwrite/client";

/**
 * 360° Google Street View of a point (pickup or drop-off). Phase 2: hosts see
 * the pickup panorama, guests see the drop-off panorama, so both know exactly
 * what the spot looks like on the ground. Falls back gracefully where Street
 * View has no coverage (common in rural areas).
 */
export function StreetView360({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panoRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [noCoverage, setNoCoverage] = useState(false);

  // Reuse the maps loader already present in RideRouteMap: the script tag is
  // shared, so if maps is loaded we're good; otherwise wait for it.
  useEffect(() => {
    if ((window as any).google?.maps) {
      setReady(true);
      return;
    }
    const existing = document.getElementById("google-maps-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      return;
    }
    const s = document.createElement("script");
    s.id = "google-maps-script";
    s.dataset.googleMaps = "places";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${appwriteConfig.googleMapsApiKey}&libraries=places,geometry`;
    s.async = true;
    s.defer = true;
    s.addEventListener("load", () => setReady(true));
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || lat == null || lng == null) return;
    const google = (window as any).google;
    const svService = new google.maps.StreetViewService();
    // Look for a panorama within 100 m of the point before rendering.
    svService.getPanorama(
      { location: { lat, lng }, radius: 100 },
      (data: any, status: any) => {
        if (status !== "OK" || !data?.location) {
          setNoCoverage(true);
          return;
        }
        setNoCoverage(false);
        panoRef.current = new google.maps.StreetViewPanorama(ref.current, {
          pano: data.location.pano,
          pov: { heading: 0, pitch: 0 },
          zoom: 0,
          addressControl: false,
          fullscreenControl: true,
          motionTracking: false,
          motionTrackingControl: false,
          showRoadLabels: false,
          linksControl: true,
        });
      },
    );
  }, [ready, lat, lng]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
      <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700 shadow">
        <Compass size={13} className="text-primary" />
        360° {label ?? "view"}
      </div>
      {noCoverage ? (
        <div className="grid aspect-square w-full place-items-center bg-gray-50 text-center text-sm text-gray-400">
          <div className="flex flex-col items-center gap-1 px-6">
            <ImageOff size={22} />
            <span>No 360° imagery available for this spot yet.</span>
          </div>
        </div>
      ) : (
        <div ref={ref} className="aspect-square w-full bg-gray-100" />
      )}
    </div>
  );
}
