import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  AutoComplete,
  ConfigProvider,
  DatePicker,
  Form,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";

/* Ant Design theme injected directly into the component tree — this is
   the only reliable way to override font sizes in Ant Design v5+ because
   the CSS-in-JS hash-scoped selectors beat any external stylesheet. */
const SEARCH_INPUT_THEME = {
  token: {
    borderRadius: 0,
    fontSize: 32, // 2rem — balanced for mobile, adjusts up with CSS media query for desktop
    fontSizeLG: 32,
    controlHeight: 56, // 3.5rem — responsive height
    controlHeightLG: 64,
  },
} as const;

// Desktop theme with larger font sizes
const SEARCH_INPUT_THEME_DESKTOP = {
  token: {
    borderRadius: 0,
    fontSize: 48, // 3rem — readable hero size for desktop
    fontSizeLG: 48,
    controlHeight: 72, // tall enough to hold 3rem text comfortably
    controlHeightLG: 80,
  },
} as const;
import {
  ArrowRight,
  ArrowLeftRight,
  ArrowUpDown,
  Star,
  Search,
  PlusCircle,
  Share2,
} from "lucide-react";
import dayjs, { Dayjs } from "dayjs";
import { Button as UiButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RidePrefChips } from "@/components/RidePrefChips";
import { HostAvatar } from "@/components/HostAvatar";
import { useQuery } from "@tanstack/react-query";
import {
  listTrips,
  listTripStopsByTripIds,
  listTripSeatReservationsByTripIds,
  getMultipleHostPreferences,
  getVehiclesByDriverUserIds,
  getVehiclesByIds,
  listDriverProfilesByUserIds,
} from "@/data/appwrite-repository";
import type { DriverProfile, RidePreferences, TripStop } from "@/lib/domain";
import { haversineKm, routeCitySegmentsMatch, stripCountrySuffix } from "@/lib/geo";
import { formatCurrency } from "@/lib/pricing";
import { getSegmentPrice } from "@/lib/segment-pricing";
import { estimateSegmentTimes, type SegmentTimes } from "@/lib/segment-times";
import { appwriteConfig } from "@/integrations/appwrite/client";
import { shareTrip, getTripShareUrl } from "@/lib/share-trip";
import { cn } from "@/lib/utils";
import { SERVICE_CITY, BENGALURU_AIRPORTS } from "@/lib/config";

interface PlacePrediction {
  description: string;
}

interface PlacesAutocompleteServiceLike {
  getPlacePredictions: (
    request: { input: string; types?: string[] },
    callback: (predictions: PlacePrediction[] | null, status: string) => void,
  ) => void;
}

interface GoogleMapsWindow {
  google?: {
    maps?: {
      places?: {
        AutocompleteService?: new () => PlacesAutocompleteServiceLike;
      };
    };
  };
}

type TripRow = Awaited<ReturnType<typeof listTrips>>[number];

/** Which two stops along a trip's route a passenger searched between, and the
 *  per-seat price for that segment (vs. the trip's full-route price). */
export interface MatchedSegment {
  fromStopIndex: number;
  toStopIndex: number;
  fromLabel: string;
  toLabel: string;
  price: number;
  times: SegmentTimes;
}

type SearchResult = TripRow & { matchedSegment: MatchedSegment };

const NEARBY_THRESHOLD_KM = 40;

type NearbyResult = TripRow & {
  nearbySegment: {
    fromStop: TripStop;
    toStop: TripStop;
    fromDevKm: number;
    toDevKm: number;
    price: number;
    times: SegmentTimes;
  };
};

interface TripSearchContextValue {
  loading: boolean;
  searched: boolean;
  results: SearchResult[];
  nearbyResults: NearbyResult[];
  closestResults: NearbyResult[];
  allScheduledTrips: TripRow[];
  fromOptions: { value: string; label: string }[];
  toOptions: { value: string; label: string }[];
  searchPlaces: (query: string, target: "from" | "to") => void;
  onSearch: (values: { from: string; to: string; date?: Dayjs }) => Promise<void>;
  summary: string;
}

const TripSearchContext = createContext<TripSearchContextValue | null>(null);

function useTripSearchContext() {
  const ctx = useContext(TripSearchContext);
  if (!ctx) throw new Error("TripSearch components must be inside TripSearchProvider");
  return ctx;
}

function squashLower(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function primarySegment(value: string) {
  return squashLower(value).split(",")[0]?.trim() ?? "";
}

function matchesLocation(tripLocation: string, searchLocation: string) {
  const tripFull = squashLower(tripLocation);
  const searchFull = squashLower(searchLocation);
  if (!searchFull) return true;
  if (tripFull.includes(searchFull) || searchFull.includes(tripFull)) return true;
  return routeCitySegmentsMatch(primarySegment(tripLocation), primarySegment(searchLocation));
}

/** A trip's full ordered route — origin, intermediate stops, and destination —
 *  any of which can serve as a pickup or drop-off point for a passenger. Used
 *  when a trip has no saved stops, so it behaves like a simple A→B route. */
function fallbackStops(trip: TripRow): TripStop[] {
  const pricePerSeat = trip.totalSeats > 0 ? trip.totalPrice / trip.totalSeats : trip.totalPrice;
  return [
    {
      id: "",
      tripId: trip.id,
      stopIndex: 0,
      location: trip.fromLocation,
      lat: trip.fromLat,
      lng: trip.fromLng,
      stopType: "pickup",
      distanceFromOriginKm: 0,
      priceFromOrigin: 0,
    },
    {
      id: "",
      tripId: trip.id,
      stopIndex: 1,
      location: trip.toLocation,
      lat: trip.toLat,
      lng: trip.toLng,
      stopType: "drop",
      distanceFromOriginKm: trip.totalDistanceKm,
      priceFromOrigin: pricePerSeat,
    },
  ];
}

/** Finds the pickup/drop-off stop pair matching `fromNeedle`/`toNeedle` along
 *  the route — covers both the trip's main endpoints and any intermediate
 *  stops, so passengers can search by a stop along the way. If both needles
 *  are empty, matches the full route (origin to destination). */
function findMatchedSegment(
  route: TripStop[],
  fromNeedle: string,
  toNeedle: string,
): { fromStop: TripStop; toStop: TripStop } | null {
  const sorted = [...route].sort((a, b) => a.stopIndex - b.stopIndex);
  if (sorted.length < 2) return null;
  if (!fromNeedle && !toNeedle) {
    return { fromStop: sorted[0], toStop: sorted[sorted.length - 1] };
  }
  for (let i = 0; i < sorted.length; i++) {
    const pickup = sorted[i];
    if (pickup.stopType === "drop") continue;
    if (fromNeedle && !matchesLocation(pickup.location, fromNeedle)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const drop = sorted[j];
      if (drop.stopType === "pickup") continue;
      if (toNeedle && !matchesLocation(drop.location, toNeedle)) continue;
      return { fromStop: pickup, toStop: drop };
    }
  }
  return null;
}

/** Finds the closest pickup/drop-off pair to the given coordinates along a
 *  trip's route. Used as a fallback when no exact text match is found. */
function findNearbySegment(
  route: TripStop[],
  fromCoords: { lat: number; lng: number },
  toCoords: { lat: number; lng: number },
): { fromStop: TripStop; toStop: TripStop; fromDevKm: number; toDevKm: number } | null {
  const sorted = [...route].sort((a, b) => a.stopIndex - b.stopIndex);
  if (sorted.length < 2) return null;

  let bestFrom: TripStop | null = null;
  let bestFromDev = Infinity;
  for (const stop of sorted) {
    if (stop.stopType === "drop") continue;
    const dev = haversineKm({ lat: stop.lat, lng: stop.lng }, fromCoords);
    if (dev < bestFromDev) {
      bestFromDev = dev;
      bestFrom = stop;
    }
  }
  if (!bestFrom) return null;

  const fromStop = bestFrom;
  let bestTo: TripStop | null = null;
  let bestToDev = Infinity;
  for (const stop of sorted) {
    if (stop.stopType === "pickup") continue;
    if (stop.stopIndex <= fromStop.stopIndex) continue;
    const dev = haversineKm({ lat: stop.lat, lng: stop.lng }, toCoords);
    if (dev < bestToDev) {
      bestToDev = dev;
      bestTo = stop;
    }
  }
  if (!bestTo) return null;

  return { fromStop, toStop: bestTo, fromDevKm: bestFromDev, toDevKm: bestToDev };
}

const SOUTH_INDIA_STATES = [
  "karnataka",
  "kerala",
  "tamil nadu",
  "andhra pradesh",
  "telangana",
  "goa",
  "puducherry",
];

const TRIP_SEARCH_LABEL = "trip-search-label";
const TRIP_SEARCH_INPUT = "w-full trip-search-autocomplete";
const TRIP_SEARCH_INPUT_COMPACT = TRIP_SEARCH_INPUT;
const TRIP_SEARCH_DATE_CHIP =
  "w-full h-20 rounded-2xl text-3xl font-black tracking-wide transition-all duration-200 border-2 flex items-center justify-center whitespace-nowrap active:scale-95";
const TRIP_SEARCH_ICON = "shrink-0 p-3 rounded-2xl bg-gray-100/80 text-gray-400";
const TRIP_SEARCH_AC_POPUP = { popupClassName: "trip-search-ac-dropdown" };

function UpcomingDateButtons({
  selectedDate,
  onSelect,
}: {
  selectedDate?: Dayjs;
  onSelect: (date: Dayjs) => void;
}) {
  const upcomingDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => dayjs().add(index + 2, "day")),
    [],
  );

  return (
    <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">
      {upcomingDates.map((date) => {
        const selected = date.isSame(selectedDate, "day");
        return (
          <button
            key={date.format("YYYY-MM-DD")}
            type="button"
            aria-label={`Select ${date.format("dddd, MMMM D")}`}
            aria-pressed={selected}
            onClick={() => onSelect(date)}
            className={cn(
              "min-w-0 h-12 sm:h-14 rounded-xl border text-center transition-all duration-200 active:scale-95",
              selected
                ? "bg-gradient-primary !text-white border-transparent shadow-glow-sm scale-[1.03]"
                : "bg-white text-gray-600 border-gray-200 hover:border-primary/50 hover:text-primary",
            )}
          >
            <span
              className={cn(
                "block text-[9px] sm:text-[10px] font-extrabold uppercase tracking-tight leading-none",
                selected && "!text-white",
              )}
            >
              {date.format("ddd")}
            </span>
            <span
              className={cn(
                "mt-1 block text-sm sm:text-base font-black leading-none",
                selected && "!text-white",
              )}
            >
              {date.format("D")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TripSearchProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [nearbyResults, setNearbyResults] = useState<NearbyResult[]>([]);
  const [closestResults, setClosestResults] = useState<NearbyResult[]>([]);
  const [allScheduledTrips, setAllScheduledTrips] = useState<TripRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [fromOptions, setFromOptions] = useState<{ value: string; label: string }[]>([]);
  const [toOptions, setToOptions] = useState<{ value: string; label: string }[]>([]);
  const autocompleteServiceRef = useRef<PlacesAutocompleteServiceLike | null>(null);

  useEffect(() => {
    const getService = () => {
      const maps = (window as Window & GoogleMapsWindow).google?.maps;
      if (!maps?.places?.AutocompleteService) return null;
      return new maps.places.AutocompleteService() as PlacesAutocompleteServiceLike;
    };

    const existingService = getService();
    if (existingService) {
      autocompleteServiceRef.current = existingService;
      return;
    }

    if (!appwriteConfig.googleMapsApiKey) return;

    const existingScript = document.querySelector(
      'script[data-google-maps="places"]',
    ) as HTMLScriptElement | null;
    const onLoaded = () => {
      const service = getService();
      if (service) autocompleteServiceRef.current = service;
    };

    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        onLoaded();
      } else {
        existingScript.addEventListener("load", onLoaded, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    // Load `geometry` alongside `places` so the trip-publish wizard can
    // reuse this same script tag without needing to inject a second one
    // (which makes Google show "You have included the Google Maps JavaScript
    // API multiple times" error).
    script.src = `https://maps.googleapis.com/maps/api/js?key=${appwriteConfig.googleMapsApiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "places";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        onLoaded();
      },
      { once: true },
    );
    document.head.appendChild(script);
  }, []);

  const searchPlaces = useCallback((query: string, target: "from" | "to") => {
    if (!query || query.trim().length < 2) {
      if (target === "from") setFromOptions([]);
      else setToOptions([]);
      return;
    }

    const service = autocompleteServiceRef.current;
    if (!service) return;

    const searchQuery = query;

    service.getPlacePredictions(
      {
        input: searchQuery,
        types: ["geocode"],
        componentRestrictions: { country: "in" },
      } as any as any,
      (predictions, status) => {
        const lowerQuery = query.toLowerCase();
        const isAirportQuery =
          lowerQuery.includes("air") ||
          lowerQuery.includes("flight") ||
          lowerQuery.includes("terminal") ||
          lowerQuery.includes("blr") ||
          lowerQuery.includes("kempegowda") ||
          lowerQuery.includes("hal") ||
          lowerQuery.includes("jakkur");

        if ((status !== "OK" || !predictions) && !isAirportQuery) {
          if (target === "from") setFromOptions([]);
          else setToOptions([]);
          return;
        }

        const safePredictions = predictions || [];

        let filteredPredictions = safePredictions.filter((p) => {
          const desc = p.description.toLowerCase();
          return SOUTH_INDIA_STATES.some((state) => desc.includes(state)) || isAirportQuery;
        });

        if (filteredPredictions.length === 0 && safePredictions.length > 0 && !isAirportQuery) {
          const outOfBoundsOptions = [
            { value: "", label: "🚫 Out of Service Area (South India & Goa only)", disabled: true },
          ] as any[];
          if (target === "from") setFromOptions(outOfBoundsOptions);
          else setToOptions(outOfBoundsOptions);
          return;
        }
        let options: any[] = filteredPredictions.map((p) => ({
          value: stripCountrySuffix(p.description),
          label: stripCountrySuffix(p.description),
        }));

        if (isAirportQuery) {
          const airportOptions = BENGALURU_AIRPORTS.map((a) => ({
            value: `${a.name}, ${SERVICE_CITY}`,
            label: (
              <div className="flex items-center gap-2">
                <span>✈️</span>
                <span className="font-medium text-gray-900">
                  {a.name} <span className="text-gray-400 font-normal">({a.code})</span>
                </span>
              </div>
            ),
          }));

          // Reverse array before unshifting to maintain order since we unshift one by one
          [...airportOptions].reverse().forEach((ao) => {
            if (!options.find((o) => o.value === ao.value)) {
              options.unshift(ao);
            }
          });
        }

        if (target === "from") setFromOptions(options);
        else setToOptions(options);
      },
    );
  }, []);

  const onSearch = useCallback(async (values: { from: string; to: string; date?: Dayjs }) => {
    const fromNeedle = values.from.trim();
    const toNeedle = values.to.trim();
    const searchDate = values.date;

    setLoading(true);
    try {
      const allTrips = await listTrips(200);

      setAllScheduledTrips(
        allTrips
          .filter((t) => t.status === "scheduled" && dayjs(t.departureAt).isAfter(dayjs()))
          .sort((a, b) => new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime()),
      );

      const stopsByTrip = new Map<string, TripStop[]>();
      try {
        const allStops = await listTripStopsByTripIds(allTrips.map((t) => t.id));
        for (const stop of allStops) {
          if (!stopsByTrip.has(stop.tripId)) stopsByTrip.set(stop.tripId, []);
          stopsByTrip.get(stop.tripId)!.push(stop);
        }
      } catch {
        // If stops can't be loaded, fall back to matching main endpoints only.
      }

      // Geocode both locations: validate South India AND extract coordinates for nearby search.
      let fromCoords: { lat: number; lng: number } | null = null;
      let toCoords: { lat: number; lng: number } | null = null;

      if ((window as any).google && (window as any).google.maps) {
        const geocoder = new (window as any).google.maps.Geocoder();
        const geocodeLocation = (
          address: string,
        ): Promise<{ valid: boolean; coords: { lat: number; lng: number } | null }> => {
          return new Promise((resolve) => {
            let settled = false;
            const settle = (v: { valid: boolean; coords: { lat: number; lng: number } | null }) => {
              if (settled) return;
              settled = true;
              resolve(v);
            };
            // Fall back after 5 s if the geocoder stalls (bad/expired API key, network issue).
            const timeoutId = setTimeout(() => settle({ valid: true, coords: null }), 5000);
            // Bias ambiguous names toward the service region: a bare
            // "Kamalanagar" otherwise top-hits Kamla Nagar (Delhi) and a valid
            // Andhra Pradesh place gets rejected.
            const southIndiaBounds = new (window as any).google.maps.LatLngBounds(
              { lat: 7.9, lng: 73.5 }, // SW — below Kanyakumari, west of Goa
              { lat: 20.0, lng: 85.0 }, // NE — northern AP/Telangana border
            );
            geocoder.geocode(
              { address, bounds: southIndiaBounds, region: "IN" },
              (geoResults: any, status: any) => {
                clearTimeout(timeoutId);
                if (status === "OK" && geoResults?.length) {
                  const stateOf = (r: any) => {
                    for (const component of r.address_components ?? []) {
                      if (component.types.includes("administrative_area_level_1")) {
                        return String(component.long_name).toLowerCase();
                      }
                    }
                    return "";
                  };
                  // Accept if ANY match is in the service region — one
                  // out-of-region top hit must not veto a valid southern place
                  // that shares its name.
                  const hit = geoResults.find((r: any) => {
                    const st = stateOf(r);
                    return SOUTH_INDIA_STATES.some((s) => st.includes(s));
                  });
                  const loc = (hit ?? geoResults[0]).geometry?.location;
                  settle({
                    valid: !!hit,
                    coords: loc ? { lat: loc.lat(), lng: loc.lng() } : null,
                  });
                } else {
                  settle({ valid: true, coords: null });
                }
              },
            );
          });
        };

        const [fromGeo, toGeo] = await Promise.all([
          geocodeLocation(values.from),
          geocodeLocation(values.to),
        ]);

        if (!fromGeo.valid || !toGeo.valid) {
          import("sonner").then((m) =>
            m.toast.error("We currently only operate in South India and Goa."),
          );
          return;
        }

        fromCoords = fromGeo.coords;
        toCoords = toGeo.coords;
      }

      const activeFilter = (trip: TripRow) =>
        (trip.status === "scheduled" || trip.status === "in_progress") &&
        (trip.status === "in_progress" || dayjs(trip.departureAt).isAfter(dayjs()));
      const dateFilter = (trip: TripRow) =>
        !searchDate || dayjs(trip.departureAt).isSame(searchDate, "day");

      const filtered = allTrips
        .filter(activeFilter)
        .filter(dateFilter)
        .map((trip): SearchResult | null => {
          const route = stopsByTrip.get(trip.id);
          const fullRoute = route && route.length >= 2 ? route : fallbackStops(trip);
          const segment = findMatchedSegment(fullRoute, fromNeedle, toNeedle);
          if (!segment) return null;
          return {
            ...trip,
            matchedSegment: {
              fromStopIndex: segment.fromStop.stopIndex,
              toStopIndex: segment.toStop.stopIndex,
              fromLabel: segment.fromStop.location,
              toLabel: segment.toStop.location,
              price: getSegmentPrice(trip, fullRoute, segment.fromStop.stopIndex, segment.toStop.stopIndex),
              times: estimateSegmentTimes(trip, fullRoute, segment.fromStop.stopIndex, segment.toStop.stopIndex),
            },
          };
        })
        .filter((trip): trip is SearchResult => trip !== null)
        .sort((a, b) => new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime());

      // Nearby computation — only runs when exact search returned nothing and we have coordinates.
      let nearbyArr: NearbyResult[] = [];
      let closestArr: NearbyResult[] = [];

      if (filtered.length === 0 && fromCoords && toCoords) {
        const fc = fromCoords;
        const tc = toCoords;

        const withNearby: NearbyResult[] = allTrips
          .filter(activeFilter)
          .filter(dateFilter)
          .flatMap((trip) => {
            const route = stopsByTrip.get(trip.id);
            const fullRoute = route && route.length >= 2 ? route : fallbackStops(trip);
            const seg = findNearbySegment(fullRoute, fc, tc);
            if (!seg) return [];
            return [
              {
                ...trip,
                nearbySegment: {
                  ...seg,
                  price: getSegmentPrice(trip, fullRoute, seg.fromStop.stopIndex, seg.toStop.stopIndex),
                  times: estimateSegmentTimes(trip, fullRoute, seg.fromStop.stopIndex, seg.toStop.stopIndex),
                },
              } as NearbyResult,
            ];
          });

        withNearby.sort(
          (a, b) =>
            a.nearbySegment.fromDevKm + a.nearbySegment.toDevKm -
            (b.nearbySegment.fromDevKm + b.nearbySegment.toDevKm),
        );

        nearbyArr = withNearby.filter(
          (t) =>
            t.nearbySegment.fromDevKm <= NEARBY_THRESHOLD_KM &&
            t.nearbySegment.toDevKm <= NEARBY_THRESHOLD_KM,
        );

        // If nothing within 40 km, surface the closest 6 trips regardless of distance.
        if (nearbyArr.length === 0) {
          closestArr = withNearby.slice(0, 6);
        }
      }

      setResults(filtered);
      setNearbyResults(nearbyArr);
      setClosestResults(closestArr);
      setSearched(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Unable to search trips.");
    } finally {
      setLoading(false);
    }
  }, []);

  const summary = useMemo(() => {
    if (!searched) return "";
    return results.length > 0 ? `${results.length} trip(s) found` : "No matching trips found";
  }, [searched, results.length]);

  const value = useMemo(
    () => ({
      loading,
      searched,
      results,
      nearbyResults,
      closestResults,
      allScheduledTrips,
      fromOptions,
      toOptions,
      searchPlaces,
      onSearch,
      summary,
    }),
    [loading, searched, results, nearbyResults, closestResults, allScheduledTrips, fromOptions, toOptions, searchPlaces, onSearch, summary],
  );

  return <TripSearchContext.Provider value={value}>{children}</TripSearchContext.Provider>;
}

export function TripSearchForm({ variant, id }: { variant: "landing" | "page"; id?: string }) {
  const { loading, fromOptions, toOptions, searchPlaces, onSearch, summary } =
    useTripSearchContext();
  const [form] = Form.useForm();
  // Unfocused search fields render a plain-text overlay instead of the input —
  // plain text always draws from the first character, so Android's input
  // scroll-position quirks (mid-name or blank-looking views) can't show.
  const fromValue = Form.useWatch("from", form);
  const toValue = Form.useWatch("to", form);
  const [searchFocus, setSearchFocus] = useState<null | "from" | "to">(null);
  // Focus/blur are handled on the WRAPPER divs via React capture events —
  // this antd version silently ignores onFocus/onBlur props on AutoComplete
  // (verified in-browser: the handlers never fired, which is why earlier
  // blur-based fixes never ran). Tap-to-retype: focusing a filled field
  // clears it (a focused input must never hold a long name — mobile renders
  // it scrolled mid-name); leaving without choosing restores the old value.
  const prevSearchValue = useRef<{ from?: string; to?: string }>({});
  const searchFieldFocus = (key: "from" | "to") => {
    setSearchFocus(key);
    const v = form.getFieldValue(key);
    if (typeof v === "string" && v) {
      prevSearchValue.current[key] = v;
      form.setFieldsValue({ [key]: "" });
    }
  };
  const searchFieldBlur = (key: "from" | "to") => {
    setSearchFocus(null);
    const v = form.getFieldValue(key);
    if (!(typeof v === "string" && v.trim()) && prevSearchValue.current[key]) {
      form.setFieldsValue({ [key]: prevSearchValue.current[key] });
    }
  };
  const selectedDate = Form.useWatch("date", form);
  const [locating, setLocating] = useState(false);

  const locateUser = useCallback(
    (highAccuracy = true) => {
      if (!navigator.geolocation) {
        import("sonner").then((m) =>
          m.toast.error("Geolocation is not supported by your browser."),
        );
        return;
      }

      setLocating(true);

      const handleIPFallback = async () => {
        try {
          const response = await fetch("https://ipapi.co/json/");
          const data = await response.json();
          if (data && data.city && !form.getFieldValue("from")) {
            // Include the state (ipapi's `region`) so the search-time geocoder
            // can't mistake the city for a same-named place elsewhere.
            const label = data.region ? `${data.city}, ${data.region}` : data.city;
            form.setFieldsValue({ from: label });
            import("sonner").then((m) => m.toast.success(`Detected via IP: ${label}`));
          }
        } catch (e) {
          console.error("IP Fallback failed:", e);
        } finally {
          setLocating(false);
        }
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          if ((window as any).google && (window as any).google.maps) {
            const geocoder = new (window as any).google.maps.Geocoder();
            geocoder.geocode(
              { location: { lat: latitude, lng: longitude } },
              (results: any, status: any) => {
                if (status === "OK" && results && results.length > 0) {
                  let city = "";
                  let state = "";
                  let stateDisplay = "";

                  for (const component of results[0].address_components) {
                    const types = component.types;
                    if (types.includes("administrative_area_level_1")) {
                      state = component.long_name.toLowerCase();
                      stateDisplay = component.long_name;
                    }
                    if (
                      types.includes("locality") ||
                      types.includes("administrative_area_level_2") ||
                      types.includes("sublocality") ||
                      types.includes("neighborhood")
                    ) {
                      if (!city) city = component.long_name;
                    }
                  }

                  const southIndiaStates = [
                    "karnataka",
                    "kerala",
                    "tamil nadu",
                    "andhra pradesh",
                    "telangana",
                    "goa",
                  ];
                  const isSouthIndia = state
                    ? southIndiaStates.some((s) => state.includes(s))
                    : true;

                  if (!isSouthIndia && state) {
                    import("sonner").then((m) =>
                      m.toast.error(
                        `Service currently unavailable in ${state}. We are live in South India & Goa!`,
                      ),
                    );
                  } else if (city && !form.getFieldValue("from")) {
                    // Always include the state: a bare locality name (e.g.
                    // "Kamalanagar") can geocode to a same-named place in
                    // another state at search time and fail region validation.
                    const label = stateDisplay ? `${city}, ${stateDisplay}` : city;
                    form.setFieldsValue({ from: label });
                    import("sonner").then((m) => m.toast.success(`Location detected: ${label}`));
                  }
                }
                setLocating(false);
              },
            );
          } else {
            setLocating(false);
          }
        },
        (error) => {
          // If high accuracy failed, try standard accuracy
          if (highAccuracy && (error.code === 2 || error.code === 3)) {
            locateUser(false);
            return;
          }

          // If all GPS attempts failed, use IP fallback
          console.log("GPS failed, trying IP fallback...");
          handleIPFallback();
        },
        { timeout: highAccuracy ? 5000 : 10000, enableHighAccuracy: highAccuracy },
      );
    },
    [form],
  );

  useEffect(() => {
    // Set default values
    if (!form.getFieldValue("to")) {
      form.setFieldsValue({ to: "Kempegowda International Airport" });
    }
    if (!form.getFieldValue("date")) {
      form.setFieldsValue({ date: dayjs() });
    }

    // Try auto-locate on mount
    locateUser();
  }, [form, locateUser]);

  useEffect(() => {
    const handleCityDetected = (e: Event) => {
      const customEvent = e as CustomEvent<{ from: string; to: string } | string>;
      const detail = customEvent.detail;

      if (typeof detail === "string") {
        if (!form.getFieldValue("from")) form.setFieldsValue({ from: detail });
      } else {
        if (!form.getFieldValue("from")) form.setFieldsValue({ from: detail.from });
        if (!form.getFieldValue("to")) form.setFieldsValue({ to: detail.to });
      }
    };

    window.addEventListener("coolpool:cityDetected", handleCityDetected);
    return () => window.removeEventListener("coolpool:cityDetected", handleCityDetected);
  }, [form]);

  useEffect(() => {
    const handleSetSearch = (e: Event) => {
      const detail = (e as CustomEvent<{ from: string; to: string; date?: Dayjs }>).detail;
      if (!detail) return;
      form.setFieldsValue({
        from: detail.from,
        to: detail.to,
        // Undefined date = show all upcoming trips on this route (don't pin to
        // a single calendar day, which hides near-future rides past midnight).
        date: detail.date,
      });
      form.submit();
      requestAnimationFrame(() => {
        document
          .getElementById("trip-search-results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    window.addEventListener("coolpool:setSearch", handleSetSearch);
    return () => window.removeEventListener("coolpool:setSearch", handleSetSearch);
  }, [form]);

  const swapLocations = () => {
    const { from, to } = form.getFieldsValue(["from", "to"]);
    form.setFieldsValue({ from: to ?? "", to: from ?? "" });
  };

  const closeKeyboard = () => {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement)) return;
    el.blur();
    // A chosen place name is often longer than the box; the cursor sits at its
    // end, so the field scrolls right and hides the start ("…a Pur"). Snap the
    // view back to the first character so the city/area name is what shows.
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(0, 0);
      } catch {
        /* input type may not support selection — scrollLeft still works */
      }
      el.scrollLeft = 0;
    });
  };

  if (variant === "page") {
    return (
      <Card
        id={id}
        className="bg-white p-4 border-gray-100 shadow-sm max-w-2xl mx-auto rounded-[2rem]"
      >
        <Form
          form={form}
          id="page-trip-search"
          layout="horizontal"
          onFinish={onSearch}
          className="flex items-center gap-3"
        >
          <div
            className="relative m-0 flex-1 min-w-0"
            onFocusCapture={() => searchFieldFocus("from")}
            onBlurCapture={() => searchFieldBlur("from")}
          >
            <Form.Item name="from" className="m-0">
              <AutoComplete
                {...TRIP_SEARCH_AC_POPUP}
                options={fromOptions}
                onSearch={(text) => searchPlaces(text, "from")}
                onSelect={closeKeyboard}
                placeholder="From"
                className={cn("bg-gray-50 rounded-2xl", TRIP_SEARCH_INPUT_COMPACT)}
                variant="borderless"
              />
            </Form.Item>
            {searchFocus !== "from" && !!fromValue && (
              <div className="pointer-events-none absolute inset-0 z-[5] flex items-center overflow-hidden rounded-2xl bg-gray-50 px-[11px]">
                <span
                  className="w-full truncate text-sm"
                  style={{ fontWeight: 800, color: "oklch(0.15 0.02 260)" }}
                >
                  {fromValue}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={swapLocations}
            aria-label="Swap pickup and destination"
            className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 active:scale-90 transition-all"
          >
            <ArrowLeftRight size={16} />
          </button>
          <div
            className="relative m-0 flex-1 min-w-0"
            onFocusCapture={() => searchFieldFocus("to")}
            onBlurCapture={() => searchFieldBlur("to")}
          >
            <Form.Item name="to" className="m-0">
              <AutoComplete
                {...TRIP_SEARCH_AC_POPUP}
                options={toOptions}
                onSearch={(text) => searchPlaces(text, "to")}
                onSelect={closeKeyboard}
                placeholder="To"
                className={cn("bg-gray-50 rounded-2xl", TRIP_SEARCH_INPUT_COMPACT)}
                variant="borderless"
              />
            </Form.Item>
            {searchFocus !== "to" && !!toValue && (
              <div className="pointer-events-none absolute inset-0 z-[5] flex items-center overflow-hidden rounded-2xl bg-gray-50 px-[11px]">
                <span
                  className="w-full truncate text-sm"
                  style={{ fontWeight: 800, color: "oklch(0.15 0.02 260)" }}
                >
                  {toValue}
                </span>
              </div>
            )}
          </div>
          <UiButton
            type="submit"
            variant="hero"
            size="sm"
            className="h-12 w-12 p-0 rounded-full shrink-0"
          >
            <ArrowRight size={20} />
          </UiButton>
        </Form>
      </Card>
    );
  }

  const todaySelected = dayjs().isSame(selectedDate, "day");
  const tomorrowSelected = dayjs().add(1, "day").isSame(selectedDate, "day");
  const selectDate = (date: Dayjs) => {
    form.setFieldsValue({ date });
    form.submit();
  };

  return (
    <div
      id={id}
      className="w-full max-w-[1440px] mx-auto px-0 sm:px-4 relative z-10 -mt-14 sm:-mt-20 animate-in fade-in slide-in-from-bottom-6 duration-700"
    >
      <div className="trip-search-card bg-white shadow-2xl border border-gray-100/80 ring-1 ring-black/[0.04] rounded-3xl overflow-hidden">
        <Form form={form} id="landing-trip-search" onFinish={onSearch}>
          {/* ── DESKTOP LAYOUT (lg and above) ── */}
          <ConfigProvider theme={SEARCH_INPUT_THEME_DESKTOP}>
            <div className="hidden lg:flex flex-col divide-y divide-gray-100">
              {/* Pickup */}
              <div
                className="px-6 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors group"
                onClick={() => !locating && locateUser()}
              >
                <p className={cn(TRIP_SEARCH_LABEL, "flex items-center gap-2")}>
                  Pickup
                  {locating && (
                    <span className="h-3 w-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  )}
                </p>
                <div
                  className="relative"
                  onFocusCapture={() => searchFieldFocus("from")}
                  onBlurCapture={() => searchFieldBlur("from")}
                >
                  <Form.Item
                    name="from"
                    rules={[{ required: true }]}
                    className="trip-search-form-item"
                  >
                    <AutoComplete
                      {...TRIP_SEARCH_AC_POPUP}
                      options={fromOptions}
                      onSearch={(t) => searchPlaces(t, "from")}
                      onSelect={closeKeyboard}
                      placeholder="City or area"
                      variant="borderless"
                      className={TRIP_SEARCH_INPUT}
                    />
                  </Form.Item>
                  {searchFocus !== "from" && !!fromValue && (
                    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center overflow-hidden bg-white">
                      <span
                        className="w-full truncate text-[48px]"
                        style={{ fontWeight: 800, color: "oklch(0.15 0.02 260)" }}
                      >
                        {fromValue}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Destination */}
              <div className="relative px-6 py-4 hover:bg-gray-50/60 transition-colors group">
                <button
                  type="button"
                  onClick={swapLocations}
                  aria-label="Swap pickup and destination"
                  className="absolute right-6 -top-6 z-10 flex items-center justify-center h-11 w-11 rounded-full bg-white border border-gray-200 text-gray-400 shadow-sm hover:text-primary hover:border-primary/40 active:scale-90 transition-all"
                >
                  <ArrowUpDown size={18} />
                </button>
                <p className={TRIP_SEARCH_LABEL}>Destination</p>
                <div
                  className="relative"
                  onFocusCapture={() => searchFieldFocus("to")}
                  onBlurCapture={() => searchFieldBlur("to")}
                >
                  <Form.Item
                    name="to"
                    rules={[{ required: true }]}
                    className="trip-search-form-item"
                  >
                    <AutoComplete
                      {...TRIP_SEARCH_AC_POPUP}
                      options={toOptions}
                      onSearch={(t) => searchPlaces(t, "to")}
                      onSelect={closeKeyboard}
                      placeholder="Where to?"
                      variant="borderless"
                      className={TRIP_SEARCH_INPUT}
                    />
                  </Form.Item>
                  {searchFocus !== "to" && !!toValue && (
                    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center overflow-hidden bg-white">
                      <span
                        className="w-full truncate text-[48px]"
                        style={{ fontWeight: 800, color: "oklch(0.15 0.02 260)" }}
                      >
                        {toValue}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Date section */}
              <div className="px-6 py-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      form.setFieldsValue({ date: dayjs() });
                      form.submit();
                    }}
                    className={cn(
                      TRIP_SEARCH_DATE_CHIP,
                      todaySelected
                        ? "bg-gradient-primary !text-white border-transparent shadow-glow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:border-primary/50 hover:text-primary",
                    )}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      form.setFieldsValue({ date: dayjs().add(1, "day") });
                      form.submit();
                    }}
                    className={cn(
                      TRIP_SEARCH_DATE_CHIP,
                      tomorrowSelected
                        ? "bg-gradient-primary !text-white border-transparent shadow-glow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:border-primary/50 hover:text-primary",
                    )}
                  >
                    Tomorrow
                  </button>
                </div>
                <UpcomingDateButtons selectedDate={selectedDate} onSelect={selectDate} />
                <Form.Item name="date" className="hidden">
                  <DatePicker />
                </Form.Item>
              </div>
            </div>
          </ConfigProvider>

          {/* ── MOBILE LAYOUT (below lg) ── */}
          <ConfigProvider theme={SEARCH_INPUT_THEME}>
            <div className="lg:hidden">
              {/* Pickup row */}
              <div
                className="px-5 pt-4 pb-3 cursor-pointer"
                onClick={() => !locating && locateUser()}
              >
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-2">
                  Pickup
                  {locating && (
                    <span className="h-3 w-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  )}
                </p>
                <div
                  className="relative"
                  onFocusCapture={() => searchFieldFocus("from")}
                  onBlurCapture={() => searchFieldBlur("from")}
                >
                  <Form.Item
                    name="from"
                    rules={[{ required: true }]}
                    className="trip-search-form-item"
                  >
                    <AutoComplete
                      {...TRIP_SEARCH_AC_POPUP}
                      options={fromOptions}
                      onSearch={(t) => searchPlaces(t, "from")}
                      onSelect={closeKeyboard}
                      placeholder="City"
                      variant="borderless"
                      className={TRIP_SEARCH_INPUT}
                    />
                  </Form.Item>
                  {searchFocus !== "from" && !!fromValue && (
                    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center overflow-hidden bg-white">
                      <span
                        className="w-full truncate text-[32px]"
                        style={{ fontWeight: 800, color: "oklch(0.15 0.02 260)" }}
                      >
                        {fromValue}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Destination row */}
              <div className="relative border-t border-gray-100 px-5 pt-3 pb-3">
                <button
                  type="button"
                  onClick={swapLocations}
                  aria-label="Swap pickup and destination"
                  className="absolute right-5 -top-5 z-10 flex items-center justify-center h-10 w-10 rounded-full bg-white border border-gray-200 text-gray-400 shadow-sm hover:text-primary hover:border-primary/40 active:scale-90 transition-all"
                >
                  <ArrowUpDown size={18} />
                </button>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">
                  Destination
                </p>
                <div
                  className="relative"
                  onFocusCapture={() => searchFieldFocus("to")}
                  onBlurCapture={() => searchFieldBlur("to")}
                >
                  <Form.Item
                    name="to"
                    rules={[{ required: true }]}
                    className="trip-search-form-item"
                  >
                    <AutoComplete
                      {...TRIP_SEARCH_AC_POPUP}
                      options={toOptions}
                      onSearch={(t) => searchPlaces(t, "to")}
                      onSelect={closeKeyboard}
                      placeholder="Where to?"
                      variant="borderless"
                      className={TRIP_SEARCH_INPUT}
                    />
                  </Form.Item>
                  {searchFocus !== "to" && !!toValue && (
                    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center overflow-hidden bg-white">
                      <span
                        className="w-full truncate text-[32px]"
                        style={{ fontWeight: 800, color: "oklch(0.15 0.02 260)" }}
                      >
                        {toValue}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Date section */}
              <div className="border-t border-gray-100 px-5 pt-3 pb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                  When are you travelling?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      form.setFieldsValue({ date: dayjs() });
                      form.submit();
                    }}
                    className={cn(
                      "flex-1 h-14 rounded-2xl text-xl font-black border-2 transition-all duration-200 active:scale-95",
                      todaySelected
                        ? "bg-gradient-primary !text-white border-transparent shadow-glow-sm"
                        : "bg-white text-gray-700 border-gray-200",
                    )}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      form.setFieldsValue({ date: dayjs().add(1, "day") });
                      form.submit();
                    }}
                    className={cn(
                      "flex-1 h-14 rounded-2xl text-xl font-black border-2 transition-all duration-200 active:scale-95",
                      tomorrowSelected
                        ? "bg-gradient-primary !text-white border-transparent shadow-glow-sm"
                        : "bg-white text-gray-700 border-gray-200",
                    )}
                  >
                    Tomorrow
                  </button>
                </div>
                <UpcomingDateButtons selectedDate={selectedDate} onSelect={selectDate} />
                <Form.Item name="date" className="hidden">
                  <DatePicker />
                </Form.Item>
              </div>

              {/* Explicit search action so editing From/To (without tapping a
                  date chip) has an obvious way to run the search. */}
              <div className="px-5 pb-4">
                <button
                  type="button"
                  onClick={() => form.submit()}
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary text-base font-bold text-white shadow-glow transition active:scale-[0.98] disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Searching…
                    </>
                  ) : (
                    <>
                      <Search className="h-5 w-5" /> Search rides
                    </>
                  )}
                </button>
              </div>
            </div>
          </ConfigProvider>
        </Form>
      </div>
    </div>
  );
}

/**
 * Shared result-row layout: departure time on the left, route + vehicle + seats
 * + host in the middle, price on the right (mirrors the "result page" sheet).
 * Wrap it in the caller's <Link> so each list keeps its own route/search params.
 */
function TripResultRowBody({
  tripId,
  tripCode,
  fromLabel,
  toLabel,
  isSegment = false,
  topSlot,
  hostName,
  hostPhotoUrl,
  vehicleLabel,
  hostRating,
  hostRatingCount,
  departure,
  arrival,
  durationLabel,
  seatsLeft,
  price,
  prefs,
}: {
  tripId: string;
  tripCode?: string | null;
  fromLabel: string;
  toLabel: string;
  isSegment?: boolean;
  topSlot?: ReactNode;
  hostName: string;
  hostPhotoUrl?: string | null;
  vehicleLabel: string;
  hostRating?: number;
  hostRatingCount?: number;
  departure: dayjs.Dayjs;
  arrival?: dayjs.Dayjs;
  durationLabel?: string;
  seatsLeft: number;
  price: number;
  prefs?: RidePreferences;
}) {
  const soldOut = seatsLeft <= 0;

  const handleShare = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const result = await shareTrip({ id: tripId, tripCode, fromLocation: fromLabel, toLocation: toLabel });
    const { toast } = await import("sonner");
    if (result === "copied") {
      toast.success("Trip link copied to clipboard!");
    } else if (result === "failed") {
      toast.info("Copy this link to share", {
        description: getTripShareUrl(tripCode ?? tripId),
        duration: 8000,
      });
    }
  };

  return (
    <Card className="relative rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md hover:border-primary transition-all duration-200 p-4 sm:p-5">
      {topSlot}
      <div className="flex items-stretch gap-4 sm:gap-5">
        {/* Times — left: green departure, red arrival */}
        <div className="flex w-[60px] shrink-0 flex-col justify-center text-left sm:w-[76px]">
          <p className="text-2xl font-black leading-none text-emerald-600 sm:text-3xl">
            {departure.format("H:mm")}
          </p>
          {durationLabel && (
            <p className="my-1 whitespace-nowrap text-[11px] font-medium leading-tight text-gray-400">
              {durationLabel}
            </p>
          )}
          {arrival && (
            <p className="text-xl font-black leading-none text-rose-500 sm:text-2xl">
              {arrival.format("H:mm")}
            </p>
          )}
        </div>

        <div className="w-px self-stretch bg-gray-100" />

        {/* Route · vehicle · host — center */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <p className="flex items-center gap-1.5 text-sm font-bold leading-tight text-gray-900">
            <span className="truncate">
              {fromLabel.split(",")[0]} → {toLabel.split(",")[0]}
            </span>
            {isSegment && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary">
                Segment
              </span>
            )}
          </p>
          <p className="truncate text-xs leading-tight text-gray-500">{vehicleLabel}</p>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <HostAvatar name={hostName} photoUrl={hostPhotoUrl} size={20} />
            <span className="truncate text-[11px] font-semibold text-gray-600">{hostName}</span>
            {(hostRatingCount ?? 0) > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-gray-700">
                <Star size={11} className="fill-amber-400 text-amber-400" />
                {(hostRating ?? 0).toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* Share + price + seats — right. Share sits BESIDE the price on one
            line (not stacked above it), so the two can never vertically
            overlap regardless of font metrics or card height. */}
        <div className="flex shrink-0 flex-col items-end justify-center text-right">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share this ride"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-400 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <Share2 size={15} />
            </button>
            <p className="whitespace-nowrap text-2xl font-black leading-tight text-gradient-primary sm:text-3xl">
              {formatCurrency(price)}
            </p>
          </div>
          <p className="mt-1.5 whitespace-nowrap text-xs font-bold">
            {soldOut ? (
              <span className="text-destructive">Sold out</span>
            ) : (
              <span className="text-primary">
                {seatsLeft} {seatsLeft === 1 ? "seat" : "seats"} left
              </span>
            )}
          </p>
        </div>
      </div>
      {prefs && <RidePrefChips prefs={prefs} className="mt-2 pt-2 border-t border-gray-100" />}
    </Card>
  );
}

export function TripSearchResults({ variant }: { variant: "landing" | "page" }) {
  const { loading, searched, results, nearbyResults, closestResults, allScheduledTrips } = useTripSearchContext();
  const { user, isDriver } = useAuth();
  const navigate = useNavigate();
  const resultsAnchorRef = useRef<HTMLDivElement>(null);

  const handleHostARide = () => {
    if (!user) {
      void navigate({ to: "/auth" });
    } else if (isDriver) {
      void navigate({ to: "/driver/dashboard", search: { module: "trips" } as any });
    } else {
      void navigate({ to: "/host" });
    }
  };

  const tripIds = useMemo(
    () => [
      ...new Set([
        ...results.map((t) => t.id),
        ...nearbyResults.map((t) => t.id),
        ...closestResults.map((t) => t.id),
      ]),
    ],
    [results, nearbyResults, closestResults],
  );
  const { data: seatReservations } = useQuery({
    queryKey: ["trip-seat-reservations", tripIds.join(",")],
    queryFn: () => listTripSeatReservationsByTripIds(tripIds),
    enabled: tripIds.length > 0,
    staleTime: 1000 * 30,
  });

  // Batch-fetch host ride preferences for all trips (results + allScheduledTrips)
  const hostIds = useMemo(
    () => [
      ...new Set(
        [
          ...results.map((t) => t.hostId),
          ...nearbyResults.map((t) => t.hostId),
          ...closestResults.map((t) => t.hostId),
          ...allScheduledTrips.map((t) => t.hostId),
        ].filter(Boolean),
      ),
    ],
    [results, nearbyResults, closestResults, allScheduledTrips],
  );

  // The exact vehicle assigned to each trip (trip.vehicleId). Resolving by id —
  // rather than the host's first vehicle — keeps the card and the ride-detail
  // page showing the same car for hosts who own more than one.
  const vehicleIds = useMemo(
    () => [
      ...new Set(
        [
          ...results.map((t) => t.vehicleId),
          ...nearbyResults.map((t) => t.vehicleId),
          ...closestResults.map((t) => t.vehicleId),
          ...allScheduledTrips.map((t) => t.vehicleId),
        ].filter((v): v is string => Boolean(v)),
      ),
    ],
    [results, nearbyResults, closestResults, allScheduledTrips],
  );
  const { data: vehiclesByIdMap } = useQuery({
    queryKey: ["trip-vehicles-by-id", vehicleIds.join(",")],
    queryFn: () => getVehiclesByIds(vehicleIds),
    enabled: vehicleIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  // IDs of trips already shown in matched results — used to exclude from "All rides"
  const matchedTripIds = useMemo(() => new Set(results.map((t) => t.id)), [results]);
  const { data: hostPrefsMap } = useQuery({
    queryKey: ["host-preferences-batch", hostIds.join(",")],
    queryFn: () => getMultipleHostPreferences(hostIds),
    enabled: hostIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  // Batch-fetch host bios
  const { data: hostProfiles } = useQuery({
    queryKey: ["host-profiles-batch", hostIds.join(",")],
    queryFn: () => listDriverProfilesByUserIds(hostIds),
    enabled: hostIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });
  const hostBioMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of hostProfiles ?? []) {
      if (p.bio) map.set(p.userId, p.bio);
    }
    return map;
  }, [hostProfiles]);
  // Full profile lookup — used to fill in host name/photo when older trips
  // were published without them.
  const hostProfileMap = useMemo(() => {
    const map = new Map<string, DriverProfile>();
    for (const p of hostProfiles ?? []) map.set(p.userId, p);
    return map;
  }, [hostProfiles]);
  // Vehicle fallback for trips published without vehicle details.
  const { data: hostVehiclesMap } = useQuery({
    queryKey: ["host-vehicles-batch", hostIds.join(",")],
    queryFn: () => getVehiclesByDriverUserIds(hostIds),
    enabled: hostIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });
  const reservedSeatsByTripId = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const reservation of seatReservations ?? []) {
      (map[reservation.tripId] ??= new Set()).add(reservation.seatCode);
    }
    return map;
  }, [seatReservations]);

  useEffect(() => {
    if (!searched || loading) return;
    const el = resultsAnchorRef.current;
    if (!el) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = () =>
      el.scrollIntoView({
        behavior: prefersReduced ? "instant" : "smooth",
        block: "start",
      });
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    return () => window.cancelAnimationFrame(id);
  }, [searched, loading]);

  if (!searched && !loading) return null;

  return (
    <div
      ref={resultsAnchorRef}
      id="trip-search-results"
      className={cn(
        "scroll-mt-28 space-y-6 w-full min-w-0",
        variant === "landing" && "pt-2 pb-4",
        variant === "page" && "pt-4",
      )}
    >
      {loading && (
        <Card className="rounded-3xl border-border/60 bg-card/80 p-10 sm:p-16 flex justify-center">
          <Spin size="large" />
        </Card>
      )}

      {/* Carousel horse: only when no exact results AND no nearby trips within 40 km */}
      {!loading && searched && results.length === 0 && nearbyResults.length === 0 && (
        <Card className="rounded-3xl border border-dashed border-destructive/40 bg-destructive/5 px-6 pb-8 pt-6 md:px-10 md:pb-12 text-center overflow-hidden">
          <div className="flex flex-col items-center">
            <img
              src="/carousel-horse.png"
              alt="Carousel horse — no rides found"
              className="w-32 sm:w-40 -mb-8 relative z-10 pointer-events-none select-none"
              loading="lazy"
            />
            <div className="w-full max-w-md rounded-3xl bg-white shadow-soft px-6 pt-12 pb-8 flex flex-col items-center gap-3">
              <h3 className="text-xl sm:text-2xl font-bold text-destructive">
                No trips found on this route
              </h3>
              <p className="text-gray-500 text-base leading-relaxed">
                No trips match this route yet. Try nearby cities or check back soon.
              </p>
              <div className="mt-2 flex flex-col items-center gap-3">
                <p className="text-sm font-semibold text-gray-500">Be the first!</p>
                <UiButton
                  onClick={handleHostARide}
                  style={{ color: "white" }}
                  className="rounded-full h-12 px-8 bg-gradient-primary !text-white [&_svg]:!text-white font-bold shadow-glow border-none hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <PlusCircle className="h-4 w-4 text-white" color="white" /> Host a Ride
                </UiButton>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Nearby trips (within 40 km) — replaces sad-cat */}
      {!loading && searched && results.length === 0 && nearbyResults.length > 0 && (
        <div className="space-y-4 w-full max-w-xl mx-auto min-w-0 pb-20">
          <div className="px-1">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900">
              Nearest trips to your route
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              No exact match — showing rides within {NEARBY_THRESHOLD_KM} km of your locations
            </p>
          </div>
          <div className="space-y-2.5">
            {nearbyResults.map((trip) => {
              const hostProfile = hostProfileMap.get(trip.hostId);
              const hostVehicle = hostVehiclesMap?.get(trip.hostId);
              const hostName = trip.hostDisplayName || hostProfile?.fullName || "Verified Host";
              const tripVehicle = trip.vehicleId ? vehiclesByIdMap?.get(trip.vehicleId) : undefined;
              const vehicleModel = tripVehicle?.modelName || trip.vehicleModel || hostVehicle?.modelName;
              const vehicleColor = tripVehicle?.color || trip.vehicleColor || hostVehicle?.color;
              const vehicleLabel = vehicleModel
                ? [vehicleModel, vehicleColor].filter(Boolean).join(" · ")
                : "Vehicle details pending";
              const seg = trip.nearbySegment;
              const departure = dayjs(seg.times.departureAt);
              const arrival = dayjs(seg.times.arrivalAt);
              const durationMinutes = Math.max(1, seg.times.durationMinutes);
              const durationLabel =
                durationMinutes >= 60
                  ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
                  : `${durationMinutes}m`;
              const seatsLeft = Math.max(
                0,
                trip.totalSeats - (reservedSeatsByTripId[trip.id]?.size ?? 0),
              );
              const prefs = hostPrefsMap?.get(trip.hostId);
              const fromKm = Math.round(seg.fromDevKm);
              const toKm = Math.round(seg.toDevKm);
              return (
                <Link
                  key={trip.id}
                  to="/ride/$tripId"
                  params={{ tripId: trip.tripCode ?? trip.id }}
                  search={{
                    fromStopIndex: seg.fromStop.stopIndex,
                    toStopIndex: seg.toStop.stopIndex,
                    fromLabel: seg.fromStop.location,
                    toLabel: seg.toStop.location,
                    segmentPrice: seg.price,
                  }}
                  className="block group"
                >
                  <TripResultRowBody
                    tripId={trip.id}
                    tripCode={trip.tripCode}
                    fromLabel={seg.fromStop.location}
                    toLabel={seg.toStop.location}
                    topSlot={
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          📍 Pickup {fromKm} km away
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          🏁 Drop {toKm} km away
                        </span>
                      </div>
                    }
                    hostName={hostName}
                    hostPhotoUrl={hostProfile?.photoUrl}
                    vehicleLabel={vehicleLabel}
                    hostRating={trip.hostRating}
                    hostRatingCount={trip.hostRatingCount}
                    departure={departure}
                    arrival={arrival}
                    durationLabel={durationLabel}
                    seatsLeft={seatsLeft}
                    price={seg.price}
                    prefs={prefs}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Closest trips (beyond 40 km) — shown below sad-cat as a last resort */}
      {!loading && searched && results.length === 0 && nearbyResults.length === 0 && closestResults.length > 0 && (
        <div className="space-y-4 w-full max-w-xl mx-auto min-w-0 pb-20">
          <div className="px-1">
            <h3 className="text-base font-bold tracking-tight text-gray-700">
              Other available trips
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              No trips near your route — here are the closest rides we found
            </p>
          </div>
          <div className="space-y-2.5">
            {closestResults.map((trip) => {
              const hostProfile = hostProfileMap.get(trip.hostId);
              const hostVehicle = hostVehiclesMap?.get(trip.hostId);
              const hostName = trip.hostDisplayName || hostProfile?.fullName || "Verified Host";
              const tripVehicle = trip.vehicleId ? vehiclesByIdMap?.get(trip.vehicleId) : undefined;
              const vehicleModel = tripVehicle?.modelName || trip.vehicleModel || hostVehicle?.modelName;
              const vehicleColor = tripVehicle?.color || trip.vehicleColor || hostVehicle?.color;
              const vehicleLabel = vehicleModel
                ? [vehicleModel, vehicleColor].filter(Boolean).join(" · ")
                : "Vehicle details pending";
              const seg = trip.nearbySegment;
              const departure = dayjs(seg.times.departureAt);
              const arrival = dayjs(seg.times.arrivalAt);
              const durationMinutes = Math.max(1, seg.times.durationMinutes);
              const durationLabel =
                durationMinutes >= 60
                  ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
                  : `${durationMinutes}m`;
              const seatsLeft = Math.max(
                0,
                trip.totalSeats - (reservedSeatsByTripId[trip.id]?.size ?? 0),
              );
              const prefs = hostPrefsMap?.get(trip.hostId);
              const fromKm = Math.round(seg.fromDevKm);
              const toKm = Math.round(seg.toDevKm);
              return (
                <Link
                  key={trip.id}
                  to="/ride/$tripId"
                  params={{ tripId: trip.tripCode ?? trip.id }}
                  search={{
                    fromStopIndex: seg.fromStop.stopIndex,
                    toStopIndex: seg.toStop.stopIndex,
                    fromLabel: seg.fromStop.location,
                    toLabel: seg.toStop.location,
                    segmentPrice: seg.price,
                  }}
                  className="block group"
                >
                  <TripResultRowBody
                    tripId={trip.id}
                    tripCode={trip.tripCode}
                    fromLabel={seg.fromStop.location}
                    toLabel={seg.toStop.location}
                    topSlot={
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          📍 Pickup {fromKm} km away
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          🏁 Drop {toKm} km away
                        </span>
                      </div>
                    }
                    hostName={hostName}
                    hostPhotoUrl={hostProfile?.photoUrl}
                    vehicleLabel={vehicleLabel}
                    hostRating={trip.hostRating}
                    hostRatingCount={trip.hostRatingCount}
                    departure={departure}
                    arrival={arrival}
                    durationLabel={durationLabel}
                    seatsLeft={seatsLeft}
                    price={seg.price}
                    prefs={prefs}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-4 w-full max-w-xl mx-auto min-w-0 pb-20">
          <div className="px-1">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900">
              {dayjs(results[0].departureAt).format("dddd, MMM DD")}
            </h3>
          </div>

          <div className="space-y-2.5">
            {results.map((trip) => {
              // Fall back to the host's profile and fleet for trips that were
              // published without a display name or vehicle attached.
              const hostProfile = hostProfileMap.get(trip.hostId);
              const hostVehicle = hostVehiclesMap?.get(trip.hostId);
              const hostName = trip.hostDisplayName || hostProfile?.fullName || "Verified Host";
              const tripVehicle = trip.vehicleId ? vehiclesByIdMap?.get(trip.vehicleId) : undefined;
              const vehicleModel = tripVehicle?.modelName || trip.vehicleModel || hostVehicle?.modelName;
              const vehicleColor = tripVehicle?.color || trip.vehicleColor || hostVehicle?.color;
              const vehicleLabel = vehicleModel
                ? [vehicleModel, vehicleColor].filter(Boolean).join(" · ")
                : "Vehicle details pending";
              // Show the passenger's own boarding/arrival times for partial
              // segments, not the full trip's endpoints.
              const segmentTimes = trip.matchedSegment.times;
              const departure = dayjs(segmentTimes.departureAt);
              const arrival = dayjs(segmentTimes.arrivalAt);
              const durationMinutes = Math.max(1, segmentTimes.durationMinutes);
              const durationLabel =
                durationMinutes >= 60
                  ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
                  : `${durationMinutes}m`;
              const seatsLeft = Math.max(
                0,
                trip.totalSeats - (reservedSeatsByTripId[trip.id]?.size ?? 0),
              );
              const prefs: RidePreferences | undefined = hostPrefsMap?.get(trip.hostId);
              const segment = trip.matchedSegment;
              const isFullRoute =
                segment.fromStopIndex === 0 &&
                matchesLocation(trip.fromLocation, segment.fromLabel) &&
                matchesLocation(trip.toLocation, segment.toLabel);
              return (
                <Link
                  key={trip.id}
                  to="/ride/$tripId"
                  params={{ tripId: trip.tripCode ?? trip.id }}
                  search={{
                    fromStopIndex: segment.fromStopIndex,
                    toStopIndex: segment.toStopIndex,
                    fromLabel: segment.fromLabel,
                    toLabel: segment.toLabel,
                    segmentPrice: segment.price,
                  }}
                  className="block group"
                >
                  <TripResultRowBody
                    tripId={trip.id}
                    tripCode={trip.tripCode}
                    fromLabel={segment.fromLabel}
                    toLabel={segment.toLabel}
                    isSegment={!isFullRoute}
                    hostName={hostName}
                    hostPhotoUrl={hostProfile?.photoUrl}
                    vehicleLabel={vehicleLabel}
                    hostRating={trip.hostRating}
                    hostRatingCount={trip.hostRatingCount}
                    departure={departure}
                    arrival={arrival}
                    durationLabel={durationLabel}
                    seatsLeft={seatsLeft}
                    price={segment.price}
                    prefs={prefs}
                  />
                </Link>
              );
            })}
          </div>

          {/* All available rides — every upcoming scheduled trip, excluding already-shown matches */}
          {(() => {
            const otherTrips = allScheduledTrips.filter((t) => !matchedTripIds.has(t.id));
            if (otherTrips.length === 0) return null;
            return (
              <div className="mt-8">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">
                  All available rides
                </h3>
                <div className="space-y-2.5">
                  {otherTrips.map((trip) => {
                    const hostProfile = hostProfileMap.get(trip.hostId);
                    const hostVehicle = hostVehiclesMap?.get(trip.hostId);
                    const hostName = trip.hostDisplayName || hostProfile?.fullName || "Verified Host";
                    const tripVehicle = trip.vehicleId ? vehiclesByIdMap?.get(trip.vehicleId) : undefined;
                    const vehicleModel = tripVehicle?.modelName || trip.vehicleModel || hostVehicle?.modelName;
                    const vehicleColor = tripVehicle?.color || trip.vehicleColor || hostVehicle?.color;
                    const vehicleLabel = vehicleModel
                      ? [vehicleModel, vehicleColor].filter(Boolean).join(" · ")
                      : "Vehicle details pending";
                    const departure = dayjs(trip.departureAt);
                    return (
                      <Link
                        key={trip.id}
                        to="/ride/$tripId"
                        params={{ tripId: trip.tripCode ?? trip.id }}
                        className="block group"
                      >
                        <Card className="rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md hover:border-primary transition-all duration-200 p-3 sm:p-4">
                          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                            <span className="truncate">{trip.fromLocation}</span>
                            <ArrowRight size={11} className="shrink-0" />
                            <span className="truncate">{trip.toLocation}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <HostAvatar name={hostName} photoUrl={hostProfile?.photoUrl} size={32} />
                              <div className="min-w-0">
                                <p className="font-bold text-sm text-gray-900 truncate leading-tight">{hostName}</p>
                                <p className="text-xs text-gray-500 truncate leading-tight">{vehicleLabel}</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {(trip.hostRatingCount ?? 0) > 0 ? (
                                <div className="inline-flex items-center gap-0.5 text-xs font-bold text-gray-800">
                                  <Star size={11} className="fill-amber-400 text-amber-400" />
                                  {(trip.hostRating ?? 0).toFixed(1)}
                                </div>
                              ) : (
                                <span className="text-[10px] font-semibold text-gray-400">New host</span>
                              )}
                              <p className="text-[11px] text-gray-500 mt-0.5">{departure.format("ddd, MMM D · HH:mm")}</p>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
