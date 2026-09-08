import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, CreditCard } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SeatMap } from "@/components/SeatMap";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import {
  getTripById,
  getHostPreferences,
  getVehicleByDriverUserId,
  getVehicleById,
  listDriverProfilesByUserIds,
  listTripSeatReservations,
  listTripStops,
  listTravelerBookings,
} from "@/data/appwrite-repository";
import { account } from "@/integrations/appwrite/client";
import { finalizeBookingServer } from "@/integrations/appwrite/booking-server";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/integrations/razorpay/payment";
import { formatCurrency } from "@/lib/pricing";
import { normalizePhone } from "@/lib/identity-normalizers";
import { getSegmentPrice } from "@/lib/segment-pricing";
import { estimateSegmentTimes } from "@/lib/segment-times";
import { buildSeatLayout } from "@/lib/seatLayout";
import { toast } from "sonner";
import { RideRouteMap } from "@/components/RideRouteMap";
import { RidePrefChips } from "@/components/RidePrefChips";
import { HostAvatar } from "@/components/HostAvatar";
import type { PassengerGender } from "@/lib/domain";

type PassengerForm = {
  name: string;
  phone: string;
  gender: PassengerGender | "";
  /** When true, this seat is for someone else — don't auto-fill the booker's details. */
  forSomeoneElse?: boolean;
};

interface BookingSearch {
  fromStopIndex?: number;
  toStopIndex?: number;
  fromLabel?: string;
  toLabel?: string;
  segmentPrice?: number;
}

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/**
 * Ensures Razorpay's checkout.js is loaded and `window.Razorpay` is ready.
 * Resolves true once available, false if the script can't load. Safe to call
 * repeatedly — reuses an in-flight or already-loaded script.
 */
function ensureRazorpayLoaded(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).Razorpay) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    const existing = document.getElementById("razorpay-checkout-js") as HTMLScriptElement | null;
    const onReady = () => resolve(!!(window as any).Razorpay);
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).Razorpay) return resolve(true);
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", () => resolve(false), { once: true });
    document.body.appendChild(script);
  });
}

export const Route = createFileRoute("/booking/$tripId")({
  validateSearch: (search: Record<string, unknown>): BookingSearch => ({
    fromStopIndex: typeof search.fromStopIndex === "number" ? search.fromStopIndex : undefined,
    toStopIndex: typeof search.toStopIndex === "number" ? search.toStopIndex : undefined,
    fromLabel: typeof search.fromLabel === "string" ? search.fromLabel : undefined,
    toLabel: typeof search.toLabel === "string" ? search.toLabel : undefined,
    segmentPrice: typeof search.segmentPrice === "number" ? search.segmentPrice : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Book seats — Coolpool" },
      { name: "description", content: "Choose seats for your ride." },
    ],
  }),
  component: BookingTripPage,
});

function BookingTripPage() {
  const { tripId } = Route.useParams();
  const segmentSearch = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [passengers, setPassengers] = useState<PassengerForm[]>([
    { name: "", phone: "", gender: "" },
  ]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [callConsentGiven, setCallConsentGiven] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);

  // Warm up Razorpay checkout.js on mount (best-effort; we also await it at pay time).
  useEffect(() => {
    void ensureRazorpayLoaded();
  }, []);

  // Keep passengers array length in sync with number of selected seats (at least 1 row)
  useEffect(() => {
    const target = Math.max(1, selected.size);
    setPassengers((prev) => {
      if (prev.length === target) return prev;
      if (prev.length < target) {
        return [
          ...prev,
          ...Array.from({ length: target - prev.length }, () => ({
            name: "",
            phone: "",
            gender: "" as const,
          })),
        ];
      }
      return prev.slice(0, target);
    });
  }, [selected.size]);

  const updatePassenger = (idx: number, patch: Partial<PassengerForm>) => {
    setPassengers((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const tripQuery = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => getTripById(tripId),
    retry: 1,
  });

  const vehicleQuery = useQuery({
    queryKey: ["vehicle-for-trip", tripQuery.data?.vehicleId, tripQuery.data?.hostId],
    queryFn: async () => {
      if (!tripQuery.data) return null;
      if (tripQuery.data.vehicleId) return getVehicleById(tripQuery.data.vehicleId);
      return getVehicleByDriverUserId(tripQuery.data.hostId);
    },
    enabled: !!tripQuery.data,
  });

  const hostProfileQuery = useQuery({
    queryKey: ["host-profile", tripQuery.data?.hostId],
    queryFn: async () => {
      if (!tripQuery.data) return null;
      const profiles = await listDriverProfilesByUserIds([tripQuery.data.hostId]);
      return profiles[0] ?? null;
    },
    enabled: !!tripQuery.data,
  });

  const hostPrefsQuery = useQuery({
    queryKey: ["host-prefs", tripQuery.data?.hostId],
    queryFn: () =>
      tripQuery.data ? getHostPreferences(tripQuery.data.hostId) : Promise.resolve(null),
    enabled: !!tripQuery.data,
  });

  const reservationsQuery = useQuery({
    queryKey: ["trip-seat-reservations", tripId],
    queryFn: () => listTripSeatReservations(tripId),
    enabled: !!tripId,
    refetchInterval: 30_000,
  });

  const stopsQuery = useQuery({
    queryKey: ["trip-stops", tripId],
    queryFn: () => listTripStops(tripId),
    enabled: !!tripId,
  });

  const pastBookingsQuery = useQuery({
    queryKey: ["traveler-bookings", user?.$id],
    queryFn: () => listTravelerBookings(user!.$id),
    enabled: !!user?.$id,
  });

  // Gender captured once at signup (baked into the member code) — lets the
  // booker's own seat skip the manual gender picker at checkout.
  const selfGender: PassengerGender | null = useMemo(() => {
    const g = String((user?.prefs as any)?.gender ?? "")
      .trim()
      .toLowerCase();
    return g === "male" || g === "female" ? (g as PassengerGender) : null;
  }, [user?.prefs]);

  useEffect(() => {
    if (!user) return;

    setPassengers((prev) => {
      const first = prev[0] || { name: "", phone: "", gender: "" };
      // Don't prefill the booker's details when this seat is for someone else.
      if (first.forSomeoneElse) return prev;
      let { name, phone, gender } = first;
      const recent =
        pastBookingsQuery.data && pastBookingsQuery.data.length > 0
          ? [...pastBookingsQuery.data].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )[0]
          : undefined;

      if (!name) {
        if (user.name) name = user.name;
        else if (recent?.passengerName) name = recent.passengerName;
      }
      if (!phone) {
        if (user.prefs?.defaultPhone) phone = user.prefs.defaultPhone;
        else if ((user as any).phone) phone = (user as any).phone;
        else if (recent?.passengerPhone) phone = recent.passengerPhone;
      }
      if (!gender && selfGender) gender = selfGender;
      if (name === first.name && phone === first.phone && gender === first.gender) return prev;
      const next = [...prev];
      next[0] = { ...first, name, phone, gender };
      return next;
    });
  }, [user, pastBookingsQuery.data, selfGender]);

  const layoutCapacity = useMemo(() => {
    const vehicleCap = vehicleQuery.data?.seatCapacity;
    if (vehicleCap) return vehicleCap;
    // Fallback: totalSeats = offered seats count; >= 6 means 7-seater trip, else 5-seater
    const tripCap = tripQuery.data?.totalSeats ?? 0;
    return tripCap >= 6 ? 7 : 5;
  }, [vehicleQuery.data?.seatCapacity, tripQuery.data?.totalSeats]);

  const layout = useMemo(() => buildSeatLayout(layoutCapacity), [layoutCapacity]);
  const seatLabelByCode = useMemo(() => {
    const m: Record<string, string> = {};
    layout.forEach((s) => {
      m[s.seatCode] = s.displayLabel;
    });
    return m;
  }, [layout]);

  const occupiedCodes = useMemo(
    () => new Set(reservationsQuery.data?.map((r) => r.seatCode) ?? []),
    [reservationsQuery.data],
  );
  const occupiedGenderByCode = useMemo(
    () =>
      new Map(
        (reservationsQuery.data ?? [])
          .filter((reservation) => reservation.gender)
          .map((reservation) => [reservation.seatCode, reservation.gender!]),
      ),
    [reservationsQuery.data],
  );

  /** Seat reservations are publicly readable; booking docs are not visible across travelers. */
  const remainingTripSeats = useMemo(() => {
    const trip = tripQuery.data;
    if (!trip) return 0;
    const sold = reservationsQuery.data?.length ?? 0;
    return Math.max(0, trip.totalSeats - sold);
  }, [tripQuery.data, reservationsQuery.data]);

  const sortedStops = useMemo(
    () => [...(stopsQuery.data ?? [])].sort((a, b) => a.stopIndex - b.stopIndex),
    [stopsQuery.data],
  );

  const segment = useMemo(() => {
    const trip = tripQuery.data;
    const firstStop = sortedStops[0];
    const lastStop = sortedStops[sortedStops.length - 1];
    const fromStopIndex = segmentSearch.fromStopIndex ?? firstStop?.stopIndex ?? 0;
    const toStopIndex = segmentSearch.toStopIndex ?? lastStop?.stopIndex ?? 0;
    const fromLabel = segmentSearch.fromLabel ?? trip?.fromLocation ?? "";
    const toLabel = segmentSearch.toLabel ?? trip?.toLocation ?? "";
    const price =
      segmentSearch.segmentPrice ??
      (trip && sortedStops.length >= 2
        ? getSegmentPrice(trip, sortedStops, fromStopIndex, toStopIndex)
        : trip && trip.totalSeats > 0
          ? trip.totalPrice / trip.totalSeats
          : 0);
    return { fromStopIndex, toStopIndex, fromLabel, toLabel, price };
  }, [tripQuery.data, sortedStops, segmentSearch]);

  const pricePerSeat = segment.price;

  // Boarding/arrival times for the passenger's own segment — estimated by
  // distance along the route when boarding at a mid-route stop.
  const segmentTimes = useMemo(() => {
    const trip = tripQuery.data;
    if (!trip) return null;
    return estimateSegmentTimes(trip, sortedStops, segment.fromStopIndex, segment.toStopIndex);
  }, [tripQuery.data, sortedStops, segment.fromStopIndex, segment.toStopIndex]);

  const buildBookingPayload = () => {
    if (!user || !tripQuery.data) throw new Error("Not signed in.");
    const codes = [...selected];
    if (codes.length === 0) throw new Error("Select at least one seat.");

    const trimmed = passengers.slice(0, codes.length).map((p) => ({
      name: p.name.trim(),
      // Accepts a plain 10-digit number or one with a "+91"/"91" country
      // code prefix — either way it's normalized down to the local 10 digits.
      phone: normalizePhone(p.phone),
      gender: p.gender,
    }));
    if (trimmed.some((p) => !p.name || !p.phone || !p.gender)) {
      throw new Error("Enter name, phone, and gender for every passenger.");
    }
    if (trimmed.some((p) => p.phone.length !== 10)) {
      throw new Error("Each mobile number must be exactly 10 digits.");
    }

    const primaryPhone = trimmed[0].phone;
    return { codes, trimmed, primaryPhone };
  };

  const confirmBooking = async (payment: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    if (!user || !tripQuery.data) throw new Error("Not signed in.");
    const { codes, trimmed, primaryPhone } = buildBookingPayload();

    if (!user.prefs?.defaultPhone || user.prefs.defaultPhone !== primaryPhone) {
      try {
        await account.updatePrefs({ ...(user.prefs || {}), defaultPhone: primaryPhone });
      } catch (e) {
        console.error("Failed to update user prefs", e);
      }
    }

    const joinedName = trimmed
      .map((p, i) => {
        const label = seatLabelByCode[codes[i]] ?? codes[i];
        return `Seat ${label}: ${p.name}`;
      })
      .join(" | ");
    const joinedPhone = trimmed.map((p) => p.phone).join(" | ");
    const structuredPassengers = trimmed.map((passenger, index) => ({
      seatCode: codes[index],
      name: passenger.name,
      phone: passenger.phone,
      gender: passenger.gender as PassengerGender,
    }));

    // Booking creation runs SERVER-SIDE with admin rights: the document must
    // grant read/update to the trip host, which a traveler's browser session
    // is not allowed to do (Appwrite rejects cross-user permission grants).
    // The server re-verifies the Razorpay signature before writing anything.
    const { bookingId } = await finalizeBookingServer({
      data: {
        booking: {
          tripId: tripQuery.data.id,
          travelerId: user.$id,
          fromStopIndex: segment.fromStopIndex,
          toStopIndex: segment.toStopIndex,
          segmentPrice: Math.round(pricePerSeat * codes.length * 100) / 100,
          passengerName: joinedName,
          passengerPhone: joinedPhone,
          passengers: structuredPassengers,
          seatCodes: codes,
        },
        payment,
      },
    });
    return { bookingId };
  };

  const handlePayOnline = async () => {
    try {
      buildBookingPayload(); // validate form before opening modal
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please fill all details.");
      return;
    }

    setPaymentPending(true);
    try {
      // Make sure checkout.js is actually loaded before we try to open it.
      const ready = await ensureRazorpayLoaded();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Razorpay = (window as any).Razorpay;
      if (!ready || !Razorpay) {
        toast.error(
          "Payment gateway couldn't load. Check your internet (or disable ad-blockers) and try again.",
        );
        setPaymentPending(false);
        return;
      }

      const amountPaise = Math.round(totalAmount * 100);
      const order = await createRazorpayOrder({
        data: { amountPaise, receipt: `coolpool_${Date.now()}` },
      });
      const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string;

      const rzp = new Razorpay({
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "Coolpool",
        description: `Booking: ${segment.fromLabel} → ${segment.toLabel}`,
        prefill: {
          // The booker's number lives in prefs.defaultPhone (or the first
          // passenger row) — user.phone is usually empty for phone+PIN accounts.
          contact:
            passengers[0]?.phone ||
            (user?.prefs as { defaultPhone?: string } | undefined)?.defaultPhone ||
            user?.phone ||
            "",
        },
        theme: { color: "#7C3AED" },
        // Surface UPI as the first, prominent payment block, with all other
        // enabled methods shown below it. (UPI must also be enabled for the
        // account in the Razorpay dashboard for it to actually render.)
        config: {
          display: {
            blocks: {
              upi: {
                name: "Pay via UPI",
                instruments: [{ method: "upi" }],
              },
            },
            sequence: ["block.upi", "block.other"],
            preferences: { show_default_blocks: true },
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          // Verify the signature first; then create the booking. We report which
          // step failed so a captured-but-unconfirmed payment is never silent.
          try {
            try {
              await verifyRazorpayPayment({ data: response });
            } catch (e) {
              console.error("[payment] signature verification failed", e, response);
              throw new Error(
                "Payment couldn't be verified. If money was deducted it will be auto-refunded — please contact support with your payment ID: " +
                  response.razorpay_payment_id,
              );
            }

            let booking;
            try {
              booking = await confirmBooking(response);
            } catch (e) {
              console.error("[payment] booking creation failed after payment", e, response);
              throw new Error(
                (e instanceof Error ? e.message : "Couldn't confirm your booking") +
                  ` — payment received (ID: ${response.razorpay_payment_id}). Please contact support to finalise or refund.`,
              );
            }

            toast.success("Payment successful! Booking confirmed.");
            await queryClient.invalidateQueries({ queryKey: ["trip-seat-reservations", tripId] });
            await queryClient.invalidateQueries({ queryKey: ["traveler-bookings"] });
            navigate({ to: "/trips", search: { booking: booking.bookingId } as any });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong after payment.", {
              duration: 12000,
            });
          } finally {
            setPaymentPending(false);
          }
        },
        modal: {
          ondismiss: () => {
            toast.info("Payment cancelled.");
            setPaymentPending(false);
          },
        },
      });

      rzp.on("payment.failed", (response: { error: { description: string } }) => {
        toast.error(response.error?.description ?? "Payment failed. Please try again.");
        setPaymentPending(false);
      });

      rzp.open();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not initiate payment.");
      setPaymentPending(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      void navigate({
        to: "/members",
        search: { redirect: `/booking/${tripId}` },
        replace: true,
      });
    }
  }, [authLoading, user, navigate, tripId]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-hero">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (tripQuery.isPending) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (tripQuery.isError || !tripQuery.data) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container mx-auto px-4 py-16 max-w-lg flex-1">
          <Card className="p-8 rounded-3xl text-center space-y-4">
            <p className="font-semibold">Trip not found</p>
            <Button asChild variant="outline">
              <Link to="/">Back to home</Link>
            </Button>
          </Card>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const trip = tripQuery.data;

  if (trip.status !== "scheduled" && trip.status !== "in_progress") {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container mx-auto px-4 py-16 max-w-lg flex-1">
          <Card className="p-8 rounded-3xl text-center space-y-4">
            <p className="font-semibold">This trip is not open for booking.</p>
            <Button asChild variant="outline">
              <Link to="/">Back to home</Link>
            </Button>
          </Card>
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Booking closes 30 minutes before departure.
  if (dayjs().isAfter(dayjs(trip.departureAt).subtract(30, "minute"))) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container mx-auto px-4 py-16 max-w-lg flex-1">
          <Card className="p-8 rounded-3xl text-center space-y-4">
            <p className="font-semibold">Booking closed for this trip.</p>
            <p className="text-sm text-muted-foreground">
              Bookings close 30 minutes before departure. Please find another ride.
            </p>
            <Button asChild variant="outline">
              <Link to="/">Find another ride</Link>
            </Button>
          </Card>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const toggleSeat = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else if (next.size < remainingTripSeats) next.add(code);
      return next;
    });
  };

  const vehicleMissing = vehicleQuery.data == null && vehicleQuery.isFetched;
  const passengerDetailsComplete =
    selected.size > 0 &&
    passengers
      .slice(0, selected.size)
      .every((passenger) => passenger.name.trim() && passenger.phone.trim() && passenger.gender);

  // No platform fees — travellers pay exactly the host's price, nothing extra.
  const totalAmount = selected.size > 0 ? pricePerSeat * selected.size : 0;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-hero">
      <SiteHeader />
      <main className="container mx-auto px-3 sm:px-4 pt-24 pb-10 md:pt-28 md:pb-14 max-w-6xl flex-1">
        <Button variant="ghost" className="mb-3 gap-2 -ml-2 h-9" asChild>
          <a href="/#find-a-ride">
            <ArrowLeft className="h-4 w-4" />
            Find rides
          </a>
        </Button>

        {/* Compact header */}
        <Card className="p-4 sm:p-5 rounded-3xl border-border/60 shadow-soft bg-card/90 backdrop-blur-sm mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Book your seat</h1>
              <div className="mt-2 flex items-center gap-2 text-sm sm:text-base">
                <span className="font-semibold truncate">{segment.fromLabel}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-semibold truncate">{segment.toLabel}</span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {segmentTimes ? (
                  <>
                    Boarding {segmentTimes.isEstimated ? "~" : ""}
                    {new Date(segmentTimes.departureAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {" · arrives "}
                    {segmentTimes.isEstimated ? "~" : ""}
                    {new Date(segmentTimes.arrivalAt).toLocaleTimeString([], {
                      timeStyle: "short",
                    })}
                    {segmentTimes.isEstimated && (
                      <span className="text-muted-foreground/70"> (estimated)</span>
                    )}
                  </>
                ) : (
                  new Date(trip.departureAt).toLocaleString()
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                {formatCurrency(pricePerSeat)} / seat
              </span>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                {remainingTripSeats} left
              </span>
            </div>
          </div>
          {(trip.hostDisplayName || hostProfileQuery.data) && (
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2.5">
              <HostAvatar
                name={trip.hostDisplayName || hostProfileQuery.data?.fullName}
                photoUrl={hostProfileQuery.data?.photoUrl}
                size={40}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">
                  {trip.hostDisplayName || hostProfileQuery.data?.fullName || "Verified Host"}
                </p>
                <p className="text-xs text-muted-foreground">Your host</p>
              </div>
            </div>
          )}
          {hostPrefsQuery.data && (
            <div className="mt-3 pt-3 border-t border-border/60">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Ride rules
              </p>
              <RidePrefChips prefs={hostPrefsQuery.data} size="md" />
            </div>
          )}
          {vehicleMissing && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              Vehicle profile not found — seat layout is estimated.
            </p>
          )}
        </Card>

        {remainingTripSeats === 0 ? (
          <Card className="p-8 rounded-3xl text-center">
            <p className="font-medium">This trip is fully booked.</p>
            <Button className="mt-4" asChild variant="outline">
              <a href="/#find-a-ride">Find another ride</a>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
            {/* Left column: seats + route */}
            <div className="space-y-4 min-w-0">
              <Card className="p-4 sm:p-5 rounded-3xl border-border/60 shadow-soft bg-card/90 backdrop-blur-sm">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Choose your seats
                </h2>
                <SeatMap
                  slots={layout}
                  occupiedCodes={occupiedCodes}
                  occupiedGenderByCode={occupiedGenderByCode}
                  selectedCodes={selected}
                  onTogglePassengerSeat={toggleSeat}
                  maxSelectable={remainingTripSeats}
                  seatConfig={trip.seatConfig}
                  disabled={paymentPending || reservationsQuery.isPending}
                />
              </Card>

              {trip.polyline &&
                !!trip.fromLat &&
                !!trip.fromLng &&
                !!trip.toLat &&
                !!trip.toLng && (
                  <Card className="p-4 sm:p-5 rounded-3xl border-border/60 shadow-soft bg-card/90 backdrop-blur-sm overflow-hidden">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                      Route preview
                    </h2>
                    <div className="rounded-2xl overflow-hidden">
                      <RideRouteMap
                        fromLat={trip.fromLat}
                        fromLng={trip.fromLng}
                        toLat={trip.toLat}
                        toLng={trip.toLng}
                        polyline={trip.polyline}
                        isAirportDrop={
                          (trip.toLocation || "").toLowerCase().includes("air") ||
                          (trip.toLocation || "").toLowerCase().includes("flight") ||
                          (trip.toLocation || "").toLowerCase().includes("terminal")
                        }
                      />
                    </div>
                  </Card>
                )}
            </div>

            {/* Right column: details + payment + summary (sticky on desktop) */}
            <Card className="p-4 sm:p-5 rounded-3xl border-border/60 shadow-soft bg-card/90 backdrop-blur-sm lg:sticky lg:top-24 space-y-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Passenger{passengers.length > 1 ? "s" : ""}
                </h2>
                <div className="space-y-4">
                  {passengers.map((p, idx) => {
                    const seatCode = [...selected][idx];
                    return (
                      <div
                        key={idx}
                        className="rounded-2xl border border-border/60 bg-card/60 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-primary">
                            Passenger {idx + 1}
                          </span>
                          {seatCode && (
                            <span className="inline-flex items-center justify-center rounded-2xl bg-primary/10 text-primary px-3 py-1.5 text-2xl font-extrabold leading-none">
                              {seatLabelByCode[seatCode] ?? seatCode}
                            </span>
                          )}
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!p.forSomeoneElse}
                            onChange={(e) => {
                              const on = e.target.checked;
                              // Clear the prefilled booker details so the friend's go in.
                              updatePassenger(
                                idx,
                                on
                                  ? { forSomeoneElse: true, name: "", phone: "", gender: "" }
                                  : { forSomeoneElse: false },
                              );
                            }}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          <span className="text-xs font-medium text-muted-foreground">
                            Booking this seat for someone else (enter their details)
                          </span>
                        </label>
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`p-name-${idx}`}
                            className="text-xs font-semibold text-muted-foreground"
                          >
                            Full name
                          </Label>
                          <Input
                            id={`p-name-${idx}`}
                            value={p.name}
                            onChange={(e) => updatePassenger(idx, { name: e.target.value })}
                            placeholder="Full name"
                            className="h-14 rounded-2xl border-border/80 bg-background/80 font-semibold placeholder:text-muted-foreground/40"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            Gender
                          </Label>
                          {idx === 0 && !p.forSomeoneElse && selfGender ? (
                            <div
                              className={`h-14 rounded-2xl border flex items-center px-4 text-base font-bold capitalize ${
                                selfGender === "male"
                                  ? "border-blue-500 bg-blue-50 text-blue-700"
                                  : "border-pink-500 bg-pink-50 text-pink-700"
                              }`}
                            >
                              {selfGender}
                              <span className="ml-auto text-xs font-medium normal-case text-muted-foreground">
                                From your profile
                              </span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {(["male", "female"] as const).map((gender) => (
                                <button
                                  key={gender}
                                  type="button"
                                  onClick={() => updatePassenger(idx, { gender })}
                                  className={`h-14 rounded-2xl border text-base font-bold capitalize transition-colors ${
                                    p.gender === gender
                                      ? gender === "male"
                                        ? "border-blue-500 bg-blue-50 text-blue-700"
                                        : "border-pink-500 bg-pink-50 text-pink-700"
                                      : "border-border/60 bg-background text-muted-foreground hover:border-primary/40"
                                  }`}
                                >
                                  {gender}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`p-phone-${idx}`}
                            className="text-xs font-semibold text-muted-foreground"
                          >
                            Mobile number
                          </Label>
                          <Input
                            id={`p-phone-${idx}`}
                            value={p.phone}
                            inputMode="numeric"
                            maxLength={10}
                            onChange={(e) =>
                              updatePassenger(idx, {
                                // Digits only, capped at 10.
                                phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                              })
                            }
                            placeholder="10-digit mobile number"
                            className="h-14 rounded-2xl border-border/80 bg-background/80 font-semibold placeholder:text-muted-foreground/40"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-border/60">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Payment
                </h2>
                <div className="flex items-center gap-3 rounded-2xl border border-primary/40 px-3 py-2.5 bg-primary/5">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Pay online via Razorpay</span>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {selected.size} seat{selected.size === 1 ? "" : "s"} ×{" "}
                    {formatCurrency(pricePerSeat)}
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(pricePerSeat * selected.size)}
                  </span>
                </div>
                <div className="pt-2 border-t border-border/60 flex justify-between items-baseline">
                  <span className="font-bold">Total</span>
                  <span className="text-2xl font-extrabold text-primary">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  No booking or platform fees — you pay exactly the host's price.
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-border/60">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={termsAccepted}
                    onCheckedChange={(v) => setTermsAccepted(!!v)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-muted-foreground leading-snug">
                    I accept the{" "}
                    <Link to="/terms" target="_blank" className="text-primary underline">
                      Terms &amp; Conditions
                    </Link>{" "}
                    and{" "}
                    <Link to="/refund-policy" target="_blank" className="text-primary underline">
                      Refund Policy
                    </Link>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={callConsentGiven}
                    onCheckedChange={(v) => setCallConsentGiven(!!v)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-muted-foreground leading-snug">
                    I give consent to be called regarding my booking
                  </span>
                </label>
              </div>

              <Button
                variant="hero"
                size="lg"
                className="w-full rounded-2xl h-12 text-base"
                style={{ color: "#fff" }}
                disabled={
                  paymentPending ||
                  selected.size === 0 ||
                  remainingTripSeats === 0 ||
                  !termsAccepted ||
                  !callConsentGiven ||
                  !passengerDetailsComplete
                }
                onClick={() => void handlePayOnline()}
              >
                {paymentPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing payment…
                  </>
                ) : (
                  `Pay & book${selected.size > 0 ? ` • ${formatCurrency(totalAmount)}` : ""}`
                )}
              </Button>
              {!paymentPending &&
                (selected.size === 0 ||
                  !passengerDetailsComplete ||
                  !termsAccepted ||
                  !callConsentGiven) && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    {selected.size === 0
                      ? "Select a seat to continue."
                      : !passengerDetailsComplete
                        ? "Add each passenger's name, phone & gender."
                        : !termsAccepted
                          ? "Please accept the Terms & Refund Policy."
                          : "Tick the consent box to continue."}
                  </p>
                )}
            </Card>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
