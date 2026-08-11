import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Award,
  Share2,
  Star,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HostAvatar } from "@/components/HostAvatar";
import { StreetView360 } from "@/components/StreetView360";
import { RideRouteMap } from "@/components/RideRouteMap";
import { RidePrefChips } from "@/components/RidePrefChips";
import { useAuth } from "@/hooks/useAuth";
import {
  getHostPreferences,
  getTripById,
  getVehicleById,
  getVehicleByDriverUserId,
  listDriverProfilesByUserIds,
  listHostTrips,
  listReviewsForUser,
  listTripSeatReservations,
  listTripStops,
  getTripByCode,
} from "@/data/appwrite-repository";
import { appwriteConfig } from "@/integrations/appwrite/client";
import { formatCurrency } from "@/lib/pricing";
import { shareTrip, getTripShareUrl } from "@/lib/share-trip";
import { getSegmentPrice } from "@/lib/segment-pricing";
import { getHostTier } from "@/lib/host-tier";

dayjs.extend(relativeTime);

interface RideInfoSearch {
  fromStopIndex?: number;
  toStopIndex?: number;
  fromLabel?: string;
  toLabel?: string;
  segmentPrice?: number;
}

export const Route = createFileRoute("/ride/$tripId")({
  validateSearch: (search: Record<string, unknown>): RideInfoSearch => ({
    fromStopIndex: typeof search.fromStopIndex === "number" ? search.fromStopIndex : undefined,
    toStopIndex: typeof search.toStopIndex === "number" ? search.toStopIndex : undefined,
    fromLabel: typeof search.fromLabel === "string" ? search.fromLabel : undefined,
    toLabel: typeof search.toLabel === "string" ? search.toLabel : undefined,
    segmentPrice: typeof search.segmentPrice === "number" ? search.segmentPrice : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Ride details - Coolpool" },
      { name: "description", content: "Meet your host and view ride details before booking." },
    ],
  }),
  component: RideInfoPage,
});

function fileUrl(fileId: string) {
  return `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.driverDocsBucketId}/files/${fileId}/view?project=${appwriteConfig.projectId}`;
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/75 px-2 py-3 text-center shadow-sm ring-1 ring-black/5">
      <p className="truncate text-lg font-black text-gray-900">{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  );
}

function RideInfoPage() {
  const { tripId } = Route.useParams();
  const segmentSearch = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [carImageIdx, setCarImageIdx] = useState(0);
  const [locView, setLocView] = useState<"street" | "route">("street");
  // Rider-selected segment for shared links with no preset segment (multi-stop trips).
  const [pickedFromIndex, setPickedFromIndex] = useState<number | null>(null);
  const [pickedToIndex, setPickedToIndex] = useState<number | null>(null);

  // The URL param may be a human-readable trip code (e.g. 2606-CPTR-0001) from a
  // shared link, or a raw Appwrite id from older links — resolve either.
  const tripQuery = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => (/-CPTR-/i.test(tripId) ? getTripByCode(tripId) : getTripById(tripId)),
  });
  const trip = tripQuery.data;

  const hostProfileQuery = useQuery({
    queryKey: ["host-profile", trip?.hostId],
    queryFn: async () => {
      const profiles = await listDriverProfilesByUserIds([trip!.hostId]);
      return profiles[0] ?? null;
    },
    enabled: !!trip?.hostId,
  });

  const vehicleQuery = useQuery({
    queryKey: ["trip-vehicle", trip?.id, trip?.vehicleId, trip?.hostId],
    // Prefer the vehicle actually assigned to THIS trip (trip.vehicleId).
    // Falling back to the host's first vehicle would show the wrong car for
    // hosts who own more than one — that's the card/detail mismatch.
    queryFn: async () => {
      if (trip?.vehicleId) {
        const assigned = await getVehicleById(trip.vehicleId);
        if (assigned) return assigned;
      }
      return trip?.hostId ? getVehicleByDriverUserId(trip.hostId) : null;
    },
    enabled: !!trip?.hostId,
  });

  const prefsQuery = useQuery({
    queryKey: ["host-prefs", trip?.hostId],
    queryFn: () => getHostPreferences(trip!.hostId),
    enabled: !!trip?.hostId,
  });

  const stopsQuery = useQuery({
    queryKey: ["trip-stops", tripId],
    queryFn: () => listTripStops(tripId),
  });

  const reservationsQuery = useQuery({
    queryKey: ["trip-seat-reservations", tripId],
    queryFn: () => listTripSeatReservations(tripId),
    refetchInterval: 30_000,
  });

  const reviewsQuery = useQuery({
    queryKey: ["reviews-for-host", trip?.hostId],
    queryFn: () => listReviewsForUser(trip!.hostId),
    enabled: !!trip?.hostId,
  });

  const hostTripsQuery = useQuery({
    queryKey: ["host-trips", trip?.hostId],
    queryFn: () => listHostTrips(trip!.hostId),
    enabled: !!trip?.hostId,
  });

  const sortedStops = useMemo(
    () => [...(stopsQuery.data ?? [])].sort((a, b) => a.stopIndex - b.stopIndex),
    [stopsQuery.data],
  );

  if (tripQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary/20 border-b-primary" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="font-semibold text-muted-foreground">This ride could not be found.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          Find another ride
        </Button>
      </div>
    );
  }

  const hostProfile = hostProfileQuery.data;
  const vehicle = vehicleQuery.data;
  const hostName = trip.hostDisplayName || hostProfile?.fullName || "Coolpool host";
  const isVerified = hostProfile?.verificationStatus === "approved";
  const hostReviews = (reviewsQuery.data ?? []).filter(
    (review) => review.direction === "guest_to_host",
  );
  const completedTrips = (hostTripsQuery.data ?? []).filter(
    (hostTrip) => hostTrip.status === "completed",
  ).length;
  const calculatedRating =
    hostReviews.length > 0
      ? hostReviews.reduce((sum, review) => sum + review.stars, 0) / hostReviews.length
      : 0;
  const ratingAvg = hostProfile?.ratingAvg ?? trip.hostRating ?? calculatedRating;
  const ratingCount = hostProfile?.ratingCount ?? trip.hostRatingCount ?? hostReviews.length;
  const seatsLeft = Math.max(0, trip.totalSeats - (reservationsQuery.data?.length ?? 0));
  const carImages = vehicle?.carImages ?? [];
  const departure = dayjs(trip.departureAt);
  const firstStopIndex = sortedStops[0]?.stopIndex ?? 0;
  const lastStopIndex = sortedStops.at(-1)?.stopIndex ?? firstStopIndex;
  // A link carries a preset segment when it came from search (has stop indices).
  const hasPresetSegment =
    segmentSearch.fromStopIndex !== undefined && segmentSearch.toStopIndex !== undefined;
  // Show the rider a stop picker only on a plain shared link for a multi-stop trip.
  const showStopPicker = !hasPresetSegment && sortedStops.length > 2;
  const stopLabelByIndex = (idx: number) =>
    sortedStops.find((s) => s.stopIndex === idx)?.location;

  const fromStopIndex = hasPresetSegment
    ? segmentSearch.fromStopIndex!
    : (pickedFromIndex ?? firstStopIndex);
  const toStopIndex = hasPresetSegment
    ? segmentSearch.toStopIndex!
    : (pickedToIndex ?? lastStopIndex);

  const fromLabel = hasPresetSegment
    ? (segmentSearch.fromLabel ?? trip.fromLocation)
    : (stopLabelByIndex(fromStopIndex) ?? trip.fromLocation);
  const toLabel = hasPresetSegment
    ? (segmentSearch.toLabel ?? trip.toLocation)
    : (stopLabelByIndex(toStopIndex) ?? trip.toLocation);

  const computedSegmentPrice =
    sortedStops.length >= 2
      ? getSegmentPrice(trip, sortedStops, fromStopIndex, toStopIndex)
      : trip.totalSeats > 0
        ? trip.totalPrice / trip.totalSeats
        : 0;
  const displayPrice = hasPresetSegment
    ? (segmentSearch.segmentPrice ?? computedSegmentPrice)
    : computedSegmentPrice;
  const bookingSearchParams = {
    fromStopIndex,
    toStopIndex,
    fromLabel,
    toLabel,
    segmentPrice: displayPrice,
  };
  const bookingQuery = new URLSearchParams({
    fromStopIndex: String(fromStopIndex),
    toStopIndex: String(toStopIndex),
    fromLabel,
    toLabel,
    segmentPrice: String(displayPrice),
  });
  const bookingRedirect = `/booking/${tripId}?${bookingQuery.toString()}`;
  const durationLabel = trip.durationMinutes
    ? `${Math.floor(trip.durationMinutes / 60)}h ${trip.durationMinutes % 60}m`
    : null;
  const showHostNote =
    !!trip.notes && !trip.notes.toLowerCase().includes("created via routing wizard");
  // Booking closes 30 minutes before departure.
  const BOOKING_CUTOFF_MINUTES = 30;
  const bookingClosed = dayjs().isAfter(departure.subtract(BOOKING_CUTOFF_MINUTES, "minute"));
  const isUnavailable = seatsLeft === 0 || trip.status !== "scheduled" || bookingClosed;
  const unavailableReason =
    trip.status !== "scheduled"
      ? "Ride unavailable"
      : seatsLeft === 0
        ? "Sold out"
        : bookingClosed
          ? "Booking closed"
          : "Ride unavailable";

  return (
    <div className="flex min-h-screen flex-col bg-[#fffafd]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 pb-32 pt-28 sm:pt-32">
        <div className="flex items-center justify-between">
          <button
            onClick={() =>
              window.history.length > 1 ? window.history.back() : navigate({ to: "/" })
            }
            className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 transition-colors hover:text-primary"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <button
            onClick={async () => {
              const result = await shareTrip(trip);
              if (result === "copied") {
                toast.success("Trip link copied to clipboard!");
              } else if (result === "failed") {
                toast.info("Copy this link to share", {
                  description: getTripShareUrl(trip.tripCode ?? trip.id),
                  duration: 8000,
                });
              }
            }}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 transition-colors hover:text-primary"
          >
            <Share2 size={16} />
            Share
          </button>
        </div>

        <section className="relative overflow-hidden rounded-[2rem] border border-white bg-gradient-to-br from-fuchsia-50 via-white to-violet-50 px-5 py-7 text-center shadow-sm">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative mx-auto w-fit">
            <HostAvatar
              name={hostName}
              photoUrl={hostProfile?.photoUrl}
              size={144}
              className="border-4 border-white shadow-xl"
            />
            {isVerified && (
              <span
                className="absolute bottom-1 right-1 inline-flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-blue-500 text-white shadow-md"
                title="Verified host"
              >
                <ShieldCheck size={18} />
              </span>
            )}
          </div>

          <div className="relative mt-4">
            <h1 className="text-2xl font-black text-gray-950">{hostName}</h1>
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${getHostTier(completedTrips).badgeClass}`}
            >
              <Award size={13} />
              {getHostTier(completedTrips).label}
            </span>
            {ratingCount > 0 ? (
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-gray-700">
                <Star size={15} className="fill-amber-400 text-amber-400" />
                {ratingAvg.toFixed(1)}
                <span className="font-medium text-gray-400">
                  · {ratingCount} review{ratingCount === 1 ? "" : "s"}
                </span>
              </p>
            ) : null}
            {hostProfile?.bio && (
              <p className="mx-auto mt-3 max-w-md text-sm italic leading-relaxed text-gray-500">
                &ldquo;{hostProfile.bio}&rdquo;
              </p>
            )}
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2">
            <StatTile value={String(completedTrips)} label="trips" />
            <StatTile value={ratingCount > 0 ? `${ratingAvg.toFixed(1)}★` : "New"} label="rating" />
            <StatTile value={String(ratingCount)} label="reviews" />
          </div>
        </section>

        <Card className="rounded-3xl border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">
              This ride
            </p>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {seatsLeft} seat{seatsLeft === 1 ? "" : "s"} left
            </span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MapPin size={18} />
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-base font-black text-gray-900">
                <span className="truncate">{fromLabel.split(",")[0]}</span>
                <ArrowRight size={14} className="shrink-0 text-primary" />
                <span className="truncate">{toLabel.split(",")[0]}</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {fromLabel} to {toLabel}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 text-sm text-gray-600 sm:grid-cols-4">
            <span className="flex items-center gap-1.5">
              <CalendarDays size={14} />
              {departure.format("ddd, MMM D")}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {departure.format("h:mm A")}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin size={14} />
              {sortedStops.length} stops
            </span>
            {durationLabel && (
              <span className="flex items-center gap-1.5">
                <Clock size={14} />
                {durationLabel}
              </span>
            )}
          </div>

          {showStopPicker && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Board at
                </label>
                <Select
                  value={String(fromStopIndex)}
                  onValueChange={(val) => {
                    const next = Number(val);
                    setPickedFromIndex(next);
                    // Keep drop-off after the new boarding point.
                    if (toStopIndex <= next) {
                      const after = sortedStops.find((s) => s.stopIndex > next);
                      setPickedToIndex(after?.stopIndex ?? lastStopIndex);
                    }
                  }}
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedStops
                      .filter((s) => s.stopIndex < lastStopIndex)
                      .map((s) => (
                        <SelectItem key={s.stopIndex} value={String(s.stopIndex)}>
                          {s.location}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Get off at
                </label>
                <Select
                  value={String(toStopIndex)}
                  onValueChange={(val) => setPickedToIndex(Number(val))}
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedStops
                      .filter((s) => s.stopIndex > fromStopIndex)
                      .map((s) => (
                        <SelectItem key={s.stopIndex} value={String(s.stopIndex)}>
                          {s.location}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </Card>

        {typeof trip.toLat === "number" && typeof trip.toLng === "number" && (
          <section>
            {/* Segmented toggle — 360° drop-off (default) ↔ route map. Both
                render in the same square box below. */}
            <div className="relative mb-3 grid grid-cols-2 gap-1 rounded-full border border-border bg-[#f4d8f9] p-1">
              <span
                aria-hidden
                className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
                style={{ transform: locView === "route" ? "translateX(100%)" : "translateX(0)" }}
              />
              <button
                type="button"
                onClick={() => setLocView("street")}
                className={`relative z-10 rounded-full py-2 text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
                  locView === "street" ? "text-primary" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                360° Drop-off
              </button>
              <button
                type="button"
                onClick={() => setLocView("route")}
                className={`relative z-10 rounded-full py-2 text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
                  locView === "route" ? "text-primary" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Route map
              </button>
            </div>

            {locView === "street" ? (
              <StreetView360
                lat={trip.toLat}
                lng={trip.toLng}
                label={`Drop-off · ${toLabel.split(",")[0]}`}
              />
            ) : (
              <RideRouteMap
                fromLat={trip.fromLat}
                fromLng={trip.fromLng}
                toLat={trip.toLat}
                toLng={trip.toLng}
                polyline={trip.polyline ?? ""}
                sizeClassName="aspect-square"
              />
            )}
          </section>
        )}

        <Card className="overflow-hidden rounded-3xl border-gray-100 bg-white shadow-sm">
          {carImages.length > 0 && (
            <div className="relative aspect-[16/9] bg-gray-100">
              <img
                src={fileUrl(carImages[carImageIdx])}
                alt={`${vehicle?.modelName ?? "Host vehicle"} photo`}
                className="h-full w-full object-cover"
              />
              {carImages.length > 1 && (
                <>
                  <button
                    aria-label="Previous vehicle photo"
                    onClick={() =>
                      setCarImageIdx((carImageIdx - 1 + carImages.length) % carImages.length)
                    }
                    className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-md"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    aria-label="Next vehicle photo"
                    onClick={() => setCarImageIdx((carImageIdx + 1) % carImages.length)}
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-md"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white">
                    {carImageIdx + 1} / {carImages.length}
                  </span>
                </>
              )}
            </div>
          )}
          <div className="p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Vehicle</p>
            <div className="mt-3 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                <Car size={19} />
              </span>
              <div>
                <p className="font-black text-gray-900">
                  {vehicle?.modelName ?? trip.vehicleModel ?? "Vehicle details pending"}
                </p>
                <p className="mt-0.5 text-sm text-gray-500">
                  {[
                    vehicle?.color ?? trip.vehicleColor,
                    // Show passenger seats (capacity excludes the driver) so a
                    // 5-capacity car reads as "4 seats", matching the bookable count.
                    vehicle?.seatCapacity ? `${Math.max(1, vehicle.seatCapacity - 1)} seats` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {prefsQuery.data && (
          <Card className="rounded-3xl border-gray-100 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-gray-400">
              Ride preferences
            </p>
            <RidePrefChips prefs={prefsQuery.data} size="md" />
          </Card>
        )}

        {showHostNote && (
          <Card className="rounded-3xl border-gray-100 bg-white p-5 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-gray-400">
              <MessageSquareText size={14} />
              Note from {hostName.split(" ")[0]}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">{trip.notes}</p>
          </Card>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">
              Recent reviews
            </p>
            {hostReviews.length > 0 && (
              <span className="text-xs font-bold text-gray-400">{hostReviews.length} total</span>
            )}
          </div>
          {hostReviews.length > 0 ? (
            hostReviews.slice(0, 3).map((review) => (
              <Card key={review.id} className="rounded-3xl border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={13}
                        className={
                          star <= review.stars
                            ? "fill-amber-400 text-amber-400"
                            : "fill-gray-100 text-gray-100"
                        }
                      />
                    ))}
                  </div>
                  <p className="text-[10px] font-semibold text-gray-400">
                    {dayjs(review.createdAt).fromNow()}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {review.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Card>
            ))
          ) : (
            <Card className="rounded-3xl border-dashed border-gray-200 bg-white/70 p-6 text-center shadow-none">
              <CheckCircle2 className="mx-auto h-7 w-7 text-primary/60" />
              <p className="mt-2 text-sm font-bold text-gray-700">New host</p>
              <p className="mt-1 text-xs text-gray-400">
                No reviews yet. You could be among their first riders.
              </p>
            </Card>
          )}
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div className="shrink-0">
            <p className="text-xl font-black text-primary">{formatCurrency(displayPrice)}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">per seat</p>
          </div>
          {isUnavailable ? (
            <Button disabled size="lg" className="h-12 flex-1 rounded-2xl">
              {unavailableReason}
            </Button>
          ) : user ? (
            <Button
              asChild
              variant="hero"
              size="lg"
              className="h-12 flex-1 rounded-2xl text-base font-bold text-white"
            >
              <Link to="/booking/$tripId" params={{ tripId }} search={bookingSearchParams}>
                Book this ride
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              variant="hero"
              size="lg"
              className="h-12 flex-1 rounded-2xl text-base font-bold text-white"
            >
              <Link to="/members" search={{ redirect: bookingRedirect, google_auth: undefined }}>
                Sign in to book
              </Link>
            </Button>
          )}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
