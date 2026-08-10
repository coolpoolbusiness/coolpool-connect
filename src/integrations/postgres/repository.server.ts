// SERVER-ONLY. Postgres implementation of the data repository — the SQL
// replacement for src/data/appwrite-repository.ts. Function names and return
// shapes mirror the Appwrite repo exactly so call sites (via server functions)
// don't change. Reads first (they render the whole app); writes follow.
import type { Booking, PayoutRequest, Trip, TripStop, TripSeatReservation } from "@/lib/domain";
import { query, queryOne } from "./db.server";

const iso = (v: unknown): string | undefined =>
  v == null ? undefined : v instanceof Date ? v.toISOString() : String(v);
const n = (v: unknown): number => (v == null ? 0 : Number(v));
const optNum = (v: unknown): number | undefined => (v == null ? undefined : Number(v));

// ── Row mappers (PG snake_case row → domain object) ──────────────────────────
function toTrip(r: any): Trip {
  return {
    id: r.id,
    hostId: String(r.host_id || ""),
    fromLocation: String(r.from_location || ""),
    fromLat: n(r.from_lat),
    fromLng: n(r.from_lng),
    toLocation: String(r.to_location || ""),
    toLat: n(r.to_lat),
    toLng: n(r.to_lng),
    polyline: String(r.polyline || ""),
    totalDistanceKm: n(r.total_distance_km),
    totalPrice: n(r.total_price),
    pricePerKm: n(r.price_per_km),
    totalSeats: n(r.total_seats) || 1,
    departureAt: iso(r.departure_at) || new Date().toISOString(),
    arrivalAt: iso(r.arrival_at),
    durationMinutes: optNum(r.duration_minutes),
    hostDisplayName: r.host_display_name ?? undefined,
    hostRating: n(r.host_rating),
    hostRatingCount: n(r.host_rating_count),
    vehicleModel: r.vehicle_model ?? undefined,
    vehicleColor: r.vehicle_color ?? undefined,
    tripCode: r.trip_code ?? null,
    segmentPrices: r.segment_prices ?? null, // jsonb → object already
    status: String(r.status || "scheduled") as Trip["status"],
    notes: r.notes ?? null,
    vehicleId: r.vehicle_id ?? undefined,
    assignedDriverId: r.assigned_driver_id ?? undefined,
    seatConfig: Array.isArray(r.seat_config) ? r.seat_config.map(String) : undefined,
    currentLat: optNum(r.current_lat),
    currentLng: optNum(r.current_lng),
    currentHeading: optNum(r.current_heading),
    locationUpdatedAt: iso(r.location_updated_at),
    active: r.active !== false,
  };
}

function toTripStop(r: any): TripStop {
  return {
    id: r.id,
    tripId: String(r.trip_id || ""),
    stopIndex: n(r.stop_index),
    location: String(r.location || ""),
    lat: n(r.lat),
    lng: n(r.lng),
    stopType: String(r.stop_type || "pickup") as TripStop["stopType"],
    distanceFromOriginKm: n(r.distance_from_origin_km),
    priceFromOrigin: n(r.price_from_origin),
  };
}

function toBooking(r: any): Booking {
  return {
    id: r.id,
    tripId: String(r.trip_id || ""),
    travelerId: String(r.traveler_id || ""),
    fromStopIndex: n(r.from_stop_index),
    toStopIndex: n(r.to_stop_index),
    seatsBooked: n(r.seats_booked),
    segmentPrice: n(r.segment_price),
    passengerName: String(r.passenger_name || ""),
    passengerPhone: String(r.passenger_phone || ""),
    passengers: r.passengers_json ?? undefined, // jsonb
    status: String(r.status || "pending") as Booking["status"],
    createdAt: iso(r.created_at) || new Date().toISOString(),
    otp: r.otp ?? undefined,
    verified: r.verified ?? undefined,
  };
}

function toSeatReservation(r: any): TripSeatReservation {
  return {
    id: r.id,
    tripId: String(r.trip_id || ""),
    seatCode: String(r.seat_code || ""),
    bookingId: String(r.booking_id || ""),
    gender: r.gender ?? undefined,
  };
}

function toPayoutRequest(r: any): PayoutRequest {
  return {
    id: r.id,
    driverUserId: String(r.driver_user_id || ""),
    amount: n(r.amount),
    grossAmount: r.gross_amount != null ? Number(r.gross_amount) : null,
    platformFee: r.platform_fee != null ? Number(r.platform_fee) : null,
    status: String(r.status || "pending") as PayoutRequest["status"],
    requestedAt: iso(r.requested_at) || new Date().toISOString(),
    processedAt: iso(r.processed_at) ?? null,
    paymentReference: r.payment_reference ?? null,
    adminNote: r.admin_note ?? null,
    accountHolderName: String(r.account_holder_name || ""),
    accountNumber: String(r.account_number || ""),
    ifscCode: String(r.ifsc_code || ""),
    upiId: r.upi_id ?? null,
    tripId: r.trip_id ?? null,
    tripRoute: r.trip_route ?? null,
    tripDate: iso(r.trip_date) ?? null,
    deduction: r.deduction != null ? Number(r.deduction) : 0,
    paidAmount: r.paid_amount != null ? Number(r.paid_amount) : 0,
    entrySource: r.entry_source === "admin" ? "admin" : "host",
  };
}

// ── Trips ────────────────────────────────────────────────────────────────────
export async function listTrips(limit = 20): Promise<Trip[]> {
  return (await query("SELECT * FROM trips ORDER BY departure_at ASC LIMIT $1", [limit])).map(toTrip);
}

export async function listActiveTrips(limit = 200): Promise<Trip[]> {
  return (
    await query(
      "SELECT * FROM trips WHERE status = 'scheduled' AND active = true AND departure_at > now() ORDER BY departure_at ASC LIMIT $1",
      [limit],
    )
  ).map(toTrip);
}

export async function listAllTrips(limit = 1000): Promise<Trip[]> {
  return (await query("SELECT * FROM trips ORDER BY departure_at DESC LIMIT $1", [limit])).map(toTrip);
}

export async function getTripById(tripId: string): Promise<Trip | null> {
  const r = await queryOne("SELECT * FROM trips WHERE id = $1", [tripId]);
  return r ? toTrip(r) : null;
}

export async function getTripByCode(tripCode: string): Promise<Trip | null> {
  const r = await queryOne("SELECT * FROM trips WHERE trip_code = $1 LIMIT 1", [
    tripCode.trim().toUpperCase(),
  ]);
  return r ? toTrip(r) : null;
}

export async function listHostTrips(hostId: string): Promise<Trip[]> {
  return (
    await query("SELECT * FROM trips WHERE host_id = $1 ORDER BY departure_at DESC", [hostId])
  ).map(toTrip);
}

// ── Stops ────────────────────────────────────────────────────────────────────
export async function listTripStops(tripId: string): Promise<TripStop[]> {
  return (
    await query("SELECT * FROM trip_stops WHERE trip_id = $1 ORDER BY stop_index ASC", [tripId])
  ).map(toTripStop);
}

export async function listTripStopsByTripIds(tripIds: string[]): Promise<TripStop[]> {
  if (tripIds.length === 0) return [];
  return (
    await query("SELECT * FROM trip_stops WHERE trip_id = ANY($1) ORDER BY stop_index ASC", [tripIds])
  ).map(toTripStop);
}

// ── Bookings ─────────────────────────────────────────────────────────────────
export async function listTripBookings(tripId: string): Promise<Booking[]> {
  return (
    await query("SELECT * FROM bookings WHERE trip_id = $1 ORDER BY created_at DESC", [tripId])
  ).map(toBooking);
}

export async function listTravelerBookings(travelerId: string): Promise<Booking[]> {
  return (
    await query("SELECT * FROM bookings WHERE traveler_id = $1 ORDER BY created_at DESC", [travelerId])
  ).map(toBooking);
}

export async function listHostBookings(hostId: string): Promise<Booking[]> {
  return (
    await query(
      `SELECT b.* FROM bookings b JOIN trips t ON t.id = b.trip_id
        WHERE t.host_id = $1 ORDER BY b.created_at DESC`,
      [hostId],
    )
  ).map(toBooking);
}

export async function listAllBookings(limit = 1000): Promise<Booking[]> {
  return (await query("SELECT * FROM bookings ORDER BY created_at DESC LIMIT $1", [limit])).map(toBooking);
}

// ── Seat reservations ────────────────────────────────────────────────────────
export async function listTripSeatReservations(tripId: string): Promise<TripSeatReservation[]> {
  return (
    await query("SELECT * FROM trip_seat_reservations WHERE trip_id = $1", [tripId])
  ).map(toSeatReservation);
}

export async function listTripSeatReservationsByTripIds(
  tripIds: string[],
): Promise<TripSeatReservation[]> {
  const unique = [...new Set(tripIds.filter(Boolean))];
  if (unique.length === 0) return [];
  return (
    await query("SELECT * FROM trip_seat_reservations WHERE trip_id = ANY($1)", [unique])
  ).map(toSeatReservation);
}

// ── Payouts & bank ───────────────────────────────────────────────────────────
export async function listAllPayoutRequests(limit = 500): Promise<PayoutRequest[]> {
  return (
    await query("SELECT * FROM payout_requests ORDER BY requested_at DESC LIMIT $1", [limit])
  ).map(toPayoutRequest);
}

export async function listPayoutRequestsByDriver(driverUserId: string): Promise<PayoutRequest[]> {
  return (
    await query(
      "SELECT * FROM payout_requests WHERE driver_user_id = $1 ORDER BY requested_at DESC",
      [driverUserId],
    )
  ).map(toPayoutRequest);
}

export async function getBankAccount(driverUserId: string) {
  const r = await queryOne("SELECT * FROM bank_accounts WHERE driver_user_id = $1 LIMIT 1", [
    driverUserId,
  ]);
  if (!r) return null;
  return {
    id: r.id,
    driverUserId: String(r.driver_user_id || ""),
    accountHolderName: String(r.account_holder_name || ""),
    accountNumber: String(r.account_number || ""),
    ifscCode: String(r.ifsc_code || ""),
    upiId: r.upi_id ?? null,
  };
}
