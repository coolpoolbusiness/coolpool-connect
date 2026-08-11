import React, { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { appwriteConfig } from "@/integrations/appwrite/client";
import { message } from "antd";

interface RideRouteMapProps {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  polyline: string;
  isAirportDrop?: boolean;
  liveLocation?: { lat: number; lng: number; heading?: number | null } | null;
  /** Size classes for the (non-fullscreen) container. Defaults to a fixed
   *  height; pass "aspect-square w-full" for a square. */
  sizeClassName?: string;
}

// Top-view car on a soft white halo — readable on any map background. The car
// artwork points north (up); `heading` rotates it to the direction of travel.
function carIconUrl(heading: number): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="20" fill="white" fill-opacity="0.9"/>
  <g transform="rotate(${heading} 22 22)">
    <rect x="14" y="8" width="16" height="28" rx="6.5" fill="#16A34A" stroke="white" stroke-width="2"/>
    <rect x="12.6" y="14" width="2.6" height="7" rx="1.3" fill="#0f7a37"/>
    <rect x="28.8" y="14" width="2.6" height="7" rx="1.3" fill="#0f7a37"/>
    <rect x="12.6" y="25" width="2.6" height="7" rx="1.3" fill="#0f7a37"/>
    <rect x="28.8" y="25" width="2.6" height="7" rx="1.3" fill="#0f7a37"/>
    <rect x="16.5" y="13" width="11" height="6.5" rx="2.5" fill="#bbf7d0"/>
    <rect x="16.5" y="26.5" width="11" height="5" rx="2" fill="#bbf7d0"/>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Round to 10° steps so the icon isn't regenerated on every tiny GPS wobble. */
function roundedHeading(heading: number | null | undefined): number {
  if (heading == null || !Number.isFinite(heading)) return 0;
  return (Math.round(heading / 10) * 10 + 360) % 360;
}

export function RideRouteMap({
  fromLat,
  fromLng,
  toLat,
  toLng,
  polyline,
  isAirportDrop,
  liveLocation,
  sizeClassName = "h-48",
}: RideRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const carMarkerRef = useRef<any>(null);
  const lastHeadingRef = useRef<number | null>(null);
  // Last bounds the route was fitted to — re-applied when toggling fullscreen.
  const boundsRef = useRef<any>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    // If google maps is already loaded
    if ((window as any).google && (window as any).google.maps) {
      setMapsReady(true);
      return;
    }

    const scriptId = "google-maps-script";
    const existingScript =
      (document.getElementById(scriptId) as HTMLScriptElement) ||
      (document.querySelector("script[data-google-maps]") as HTMLScriptElement);

    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        setMapsReady(true);
      } else {
        existingScript.addEventListener("load", () => setMapsReady(true));
      }
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.dataset.googleMaps = "places";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${appwriteConfig.googleMapsApiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      setMapsReady(true);
    });
    script.addEventListener("error", () => {
      message.error("Failed to load Google Maps");
    });
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;

    const google = (window as any).google;

    // Initialize Map
    if (!googleMapRef.current) {
      googleMapRef.current = new google.maps.Map(mapRef.current, {
        zoom: 12,
        center: { lat: fromLat, lng: fromLng },
        disableDefaultUI: true,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
        ],
      });
    }

    const map = googleMapRef.current;

    let routePolyline: any = null;
    let directionsRenderer: any = null;

    let path: any[] = [];
    if (polyline) {
      try {
        path = google.maps.geometry.encoding.decodePath(polyline);
      } catch (e) {
        console.error("Failed to decode polyline", e);
      }
    }

    if (path.length > 2) {
      // Draw accurate route from saved polyline
      routePolyline = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: "#6C5CE7",
        strokeOpacity: 0.8,
        strokeWeight: 5,
      });
      routePolyline.setMap(map);

      const bounds = new google.maps.LatLngBounds();
      path.forEach((latLng: any) => bounds.extend(latLng));
      boundsRef.current = bounds;
      map.fitBounds(bounds, 40); // 40px padding for better view
    } else {
      // Fallback: Use Directions API if polyline is just a straight line or missing
      const directionsService = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: "#6C5CE7",
          strokeOpacity: 0.8,
          strokeWeight: 5,
        },
      });

      directionsService.route(
        {
          origin: { lat: fromLat, lng: fromLng },
          destination: { lat: toLat, lng: toLng },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result: any, status: any) => {
          if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
          } else {
            // Ultimate fallback to straight line
            routePolyline = new google.maps.Polyline({
              path: [
                { lat: fromLat, lng: fromLng },
                { lat: toLat, lng: toLng },
              ],
              geodesic: true,
              strokeColor: "#6C5CE7",
              strokeOpacity: 0.8,
              strokeWeight: 5,
            });
            routePolyline.setMap(map);
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: fromLat, lng: fromLng });
            bounds.extend({ lat: toLat, lng: toLng });
            boundsRef.current = bounds;
            map.fitBounds(bounds, 40);
          }
        },
      );
    }

    // Custom Icons
    const dotIcon = {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 6,
      fillColor: "#6C5CE7",
      fillOpacity: 1,
      strokeWeight: 2,
      strokeColor: "#FFFFFF",
    };

    const airportIcon = "https://maps.google.com/mapfiles/ms/icons/blue-dot.png";

    // Pickup Marker
    const pickupMarker = new google.maps.Marker({
      position: { lat: fromLat, lng: fromLng },
      map: map,
      icon: dotIcon,
      title: "Pickup",
    });

    // Drop Marker
    const dropMarker = new google.maps.Marker({
      position: { lat: toLat, lng: toLng },
      map: map,
      icon: isAirportDrop ? airportIcon : dotIcon,
      title: "Drop-off",
    });

    return () => {
      if (routePolyline) routePolyline.setMap(null);
      if (directionsRenderer) directionsRenderer.setMap(null);
      if (pickupMarker) pickupMarker.setMap(null);
      if (dropMarker) dropMarker.setMap(null);
    };
  }, [mapsReady, fromLat, fromLng, toLat, toLng, polyline, isAirportDrop]);

  // Live car marker — kept in a separate effect so it updates without
  // re-drawing the route/markers on every location ping.
  useEffect(() => {
    if (!mapsReady || !googleMapRef.current) return;
    const google = (window as any).google;
    const map = googleMapRef.current;

    if (!liveLocation) {
      if (carMarkerRef.current) {
        carMarkerRef.current.setMap(null);
        carMarkerRef.current = null;
      }
      return;
    }

    const position = { lat: liveLocation.lat, lng: liveLocation.lng };
    const heading = roundedHeading(liveLocation.heading);
    const icon = {
      url: carIconUrl(heading),
      scaledSize: new google.maps.Size(44, 44),
      anchor: new google.maps.Point(22, 22),
    };

    if (!carMarkerRef.current) {
      carMarkerRef.current = new google.maps.Marker({
        position,
        map,
        icon,
        title: "Your ride",
        zIndex: 999,
      });
      lastHeadingRef.current = heading;
    } else {
      carMarkerRef.current.setPosition(position);
      // Re-render the icon only when the direction meaningfully changes.
      if (lastHeadingRef.current !== heading) {
        carMarkerRef.current.setIcon(icon);
        lastHeadingRef.current = heading;
      }
    }

    // In fullscreen the map follows the car; the small card stays still so it
    // doesn't fight the user's scrolling.
    if (fullscreen) {
      map.panTo(position);
    }
  }, [mapsReady, liveLocation, fullscreen]);

  useEffect(() => {
    return () => {
      if (carMarkerRef.current) carMarkerRef.current.setMap(null);
    };
  }, []);

  // Fullscreen is a CSS toggle on the SAME map container (no reparenting, so
  // the live map keeps running) — Google Maps just needs a resize nudge and a
  // re-center after the container jumps size.
  useEffect(() => {
    const google = (window as any).google;
    const map = googleMapRef.current;
    if (!google?.maps || !map) return;
    google.maps.event.trigger(map, "resize");
    if (fullscreen && liveLocation) {
      map.panTo({ lat: liveLocation.lat, lng: liveLocation.lng });
      map.setZoom(15);
    } else if (boundsRef.current) {
      map.fitBounds(boundsRef.current, 40);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  // Lock page scroll + close on Escape while fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[2000] bg-black"
          : `w-full ${sizeClassName} rounded-2xl overflow-hidden border border-gray-100 shadow-sm relative`
      }
    >
      <div ref={mapRef} className="w-full h-full" />
      <button
        type="button"
        aria-label={fullscreen ? "Close full screen map" : "View map full screen"}
        onClick={() => setFullscreen((v) => !v)}
        className={`absolute z-10 flex items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-md transition hover:text-primary active:scale-95 ${
          fullscreen ? "right-4 top-4 h-11 w-11" : "right-2 top-2 h-9 w-9"
        }`}
      >
        {fullscreen ? <X size={20} /> : <Maximize2 size={16} />}
      </button>
      {fullscreen && liveLocation && (
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-gray-700 shadow-md">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Live — following the car
        </div>
      )}
    </div>
  );
}
