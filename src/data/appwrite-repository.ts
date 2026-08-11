import { ID, Permission, Query, Role, type Models } from "appwrite";
import { databases, storage, appwriteConfig } from "@/integrations/appwrite/client";
import { getCollectionIds } from "@/integrations/appwrite/schema";
import { routeCitySegmentsMatch } from "@/lib/geo";
import { getBookingPassengers } from "@/lib/booking-passengers";
import { normalizeEmail, normalizeLicense, normalizePhone } from "@/lib/identity-normalizers";
import { platformFee } from "@/lib/pricing";
import type {
  AppRole,
  BankAccount,
  Booking,
  BookingStatus,
  DriverProfile,
  DriverVehicle,
  HeroBanner,
  MusicType,
  PayoutRequest,
  PayoutStatus,
  BookingPassenger,
  PassengerGender,
  PricingRule,
  Review,
  ReviewDirection,
  RidePreferences,
  StopType,
  Trip,
  TripSeatReservation,
  TripShare,
  TripStatus,
  TripStop,
  DeletedAccount,
  VerificationStatus,
} from "@/lib/domain";

type Doc = Models.Document;

/** Parse the JSON segment-price matrix column; null/garbage → null (legacy trips). */
function parseSegmentPrices(raw: unknown): Record<string, number> | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = n;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function toTrip(doc: any): Trip {
  return {
    id: doc.$id,
    hostId: String(doc.host_id || ""),
    fromLocation: String(doc.from_location || ""),
    fromLat: Number(doc.from_lat || 0),
    fromLng: Number(doc.from_lng || 0),
    toLocation: String(doc.to_location || ""),
    toLat: Number(doc.to_lat || 0),
    toLng: Number(doc.to_lng || 0),
    polyline: String(doc.polyline || ""),
    totalDistanceKm: Number(doc.total_distance_km || 0),
    totalPrice: Number(doc.total_price || 0),
    pricePerKm: Number(doc.price_per_km || 0),
    totalSeats: Number(doc.total_seats || 1),
    departureAt: String(doc.departure_at || new Date().toISOString()),
    arrivalAt: doc.arrival_at ? String(doc.arrival_at) : undefined,
    durationMinutes: Number(doc.duration_minutes || 0) || undefined,
    hostDisplayName: doc.host_display_name ? String(doc.host_display_name) : undefined,
    hostRating: Number(doc.host_rating || 0),
    hostRatingCount: Number(doc.host_rating_count || 0),
    vehicleModel: doc.vehicle_model ? String(doc.vehicle_model) : undefined,
    vehicleColor: doc.vehicle_color ? String(doc.vehicle_color) : undefined,
    tripCode: doc.trip_code ? String(doc.trip_code) : null,
    segmentPrices: parseSegmentPrices(doc.segment_prices),
    status: String(doc.status || "scheduled") as TripStatus,
    notes: doc.notes ? String(doc.notes) : null,
    vehicleId: doc.vehicle_id ? String(doc.vehicle_id) : undefined,
    assignedDriverId: doc.assigned_driver_id ? String(doc.assigned_driver_id) : undefined,
    seatConfig:
      doc.seat_config && Array.isArray(doc.seat_config) ? doc.seat_config.map(String) : undefined,
    currentLat: doc.current_lat != null ? Number(doc.current_lat) : undefined,
    currentLng: doc.current_lng != null ? Number(doc.current_lng) : undefined,
    currentHeading: doc.current_heading != null ? Number(doc.current_heading) : undefined,
    locationUpdatedAt: doc.location_updated_at ? String(doc.location_updated_at) : undefined,
    active: doc.active !== false,
  };
}

/** Toggle a vehicle / driver / trip in or out of service. */
export async function setVehicleActive(vehicleId: string, active: boolean): Promise<void> {
  const c = ids();
  await databases.updateDocument(appwriteConfig.databaseId, c.vehicles, vehicleId, { active });
}

export async function setDriverActive(driverDocId: string, active: boolean): Promise<void> {
  const c = ids();
  await databases.updateDocument(appwriteConfig.databaseId, c.drivers, driverDocId, { active });
}

export async function setTripActive(tripId: string, active: boolean): Promise<void> {
  const c = ids();
  await databases.updateDocument(appwriteConfig.databaseId, c.trips, tripId, { active });
}

function toTripStop(doc: any): TripStop {
  return {
    id: doc.$id,
    tripId: String(doc.trip_id || ""),
    stopIndex: Number(doc.stop_index || 0),
    location: String(doc.location || ""),
    lat: Number(doc.lat || 0),
    lng: Number(doc.lng || 0),
    stopType: String(doc.stop_type || "pickup") as StopType,
    distanceFromOriginKm: Number(doc.distance_from_origin_km || 0),
    priceFromOrigin: Number(doc.price_from_origin || 0),
  };
}

function toBooking(doc: any): Booking {
  let passengers: BookingPassenger[] | undefined;
  if (doc.passengers_json) {
    try {
      const parsed = JSON.parse(String(doc.passengers_json));
      if (Array.isArray(parsed)) {
        passengers = parsed.filter(
          (passenger): passenger is BookingPassenger =>
            passenger &&
            typeof passenger.seatCode === "string" &&
            typeof passenger.name === "string" &&
            typeof passenger.phone === "string" &&
            (passenger.gender === "male" || passenger.gender === "female"),
        );
      }
    } catch {
      passengers = undefined;
    }
  }
  return {
    id: doc.$id,
    tripId: String(doc.trip_id || ""),
    travelerId: String(doc.traveler_id || ""),
    fromStopIndex: Number(doc.from_stop_index || 0),
    toStopIndex: Number(doc.to_stop_index || 0),
    seatsBooked: Number(doc.seats_booked || 0),
    segmentPrice: Number(doc.segment_price || 0),
    passengerName: String(doc.passenger_name || ""),
    passengerPhone: String(doc.passenger_phone || ""),
    passengers,
    status: String(doc.status || "pending") as BookingStatus,
    createdAt: String(doc.created_at ?? doc.$createdAt),
    ratingByHost: doc.rating_by_host ? Number(doc.rating_by_host) : undefined,
    commentByHost: doc.comment_by_host ? String(doc.comment_by_host) : undefined,
    otp: doc.otp ? String(doc.otp) : undefined,
    verified: doc.verified === true || doc.verified === "true",
  };
}

function toPricingRule(doc: any): PricingRule {
  return {
    id: doc.$id,
    minPricePerKm: Number(doc.min_price_per_km || 0),
    maxPricePerKm: Number(doc.max_price_per_km || 0),
    routeMatchToleranceKm: Number(doc.route_match_tolerance_km || 0),
    updatedAt: String(doc.updated_at ?? doc.$updatedAt),
  };
}

function toDriverProfile(doc: any): DriverProfile {
  return {
    id: doc.$id,
    userId: String(doc.user_id || ""),
    fullName: String(doc.full_name || ""),
    email: String(doc.email || ""),
    phone: String(doc.phone || ""),
    licenseNumber: String(doc.license_number || ""),
    city: String(doc.city || ""),
    bio: doc.bio ? String(doc.bio) : null,
    photoUrl: doc.photo_url ? String(doc.photo_url) : null,
    smokingAllowed: Boolean(doc.smoking_allowed ?? false),
    alcoholAllowed: Boolean(doc.alcohol_allowed ?? false),
    musicAllowed: Boolean(doc.music_allowed ?? false),
    musicType: doc.music_type ? String(doc.music_type) : null,
    musicOnly: Boolean(doc.music_only ?? false),
    petsAllowed: Boolean(doc.pets_allowed ?? false),
    verificationStatus: (doc.verification_status as VerificationStatus | undefined) ?? "approved",
    verificationNote: doc.verification_note ? String(doc.verification_note) : null,
    ratingAvg: doc.rating_avg != null ? Number(doc.rating_avg) : undefined,
    ratingCount: doc.rating_count != null ? Number(doc.rating_count) : undefined,
    active: doc.active !== false,
    memberCode: doc.member_code ? String(doc.member_code) : null,
    gender: doc.gender ? String(doc.gender) : null,
    idDocType:
      doc.id_doc_type === "aadhar" || doc.id_doc_type === "license" ? doc.id_doc_type : null,
    idFrontDoc: doc.id_front_doc ? String(doc.id_front_doc) : null,
    idBackDoc: doc.id_back_doc ? String(doc.id_back_doc) : null,
    selfieDoc: doc.selfie_doc ? String(doc.selfie_doc) : null,
  };
}

function toTripSeatReservation(doc: any): TripSeatReservation {
  return {
    id: doc.$id,
    tripId: String(doc.trip_id || ""),
    seatCode: String(doc.seat_code || ""),
    bookingId: String(doc.booking_id || ""),
    gender:
      doc.gender === "male" || doc.gender === "female"
        ? (doc.gender as PassengerGender)
        : undefined,
  };
}

function toDriverVehicle(doc: any): DriverVehicle {
  return {
    id: doc.$id,
    driverUserId: String(doc.driver_user_id || ""),
    modelName: String(doc.model_name || ""),
    plateNumber: String(doc.plate_number || ""),
    seatCapacity: Number(doc.seat_capacity || 1),
    color: doc.color ? String(doc.color) : null,
    registrationDoc: doc.registration_doc ? String(doc.registration_doc) : null,
    insuranceDoc: doc.insurance_doc ? String(doc.insurance_doc) : null,
    carImages: doc.car_images && Array.isArray(doc.car_images) ? doc.car_images.map(String) : [],
    verificationStatus: (doc.verification_status as VerificationStatus | undefined) ?? "approved",
    verificationNote: doc.verification_note ? String(doc.verification_note) : null,
    active: doc.active !== false,
  };
}

function toBankAccount(doc: any): BankAccount {
  return {
    id: doc.$id,
    driverUserId: String(doc.driver_user_id || ""),
    accountHolderName: String(doc.account_holder_name || ""),
    accountNumber: String(doc.account_number || ""),
    ifscCode: String(doc.ifsc_code || ""),
    upiId: doc.upi_id ? String(doc.upi_id) : null,
  };
}

function toPayoutRequest(doc: any): PayoutRequest {
  return {
    id: doc.$id,
    driverUserId: String(doc.driver_user_id || ""),
    amount: Number(doc.amount || 0),
    grossAmount: doc.gross_amount != null ? Number(doc.gross_amount) : null,
    platformFee: doc.platform_fee != null ? Number(doc.platform_fee) : null,
    status: String(doc.status || "pending") as PayoutStatus,
    requestedAt: String(doc.requested_at || doc.$createdAt),
    processedAt: doc.processed_at ? String(doc.processed_at) : null,
    paymentReference: doc.payment_reference ? String(doc.payment_reference) : null,
    adminNote: doc.admin_note ? String(doc.admin_note) : null,
    accountHolderName: String(doc.account_holder_name || ""),
    accountNumber: String(doc.account_number || ""),
    ifscCode: String(doc.ifsc_code || ""),
    upiId: doc.upi_id ? String(doc.upi_id) : null,
    tripId: doc.trip_id ? String(doc.trip_id) : null,
    tripRoute: doc.trip_route ? String(doc.trip_route) : null,
    tripDate: doc.trip_date ? String(doc.trip_date) : null,
    deduction: doc.deduction != null ? Number(doc.deduction) : 0,
    paidAmount: doc.paid_amount != null ? Number(doc.paid_amount) : 0,
    entrySource: doc.entry_source === "admin" ? "admin" : "host",
  };
}

export interface CreateTripInput {
  hostId: string;
  fromLocation: string;
  fromLat: number;
  fromLng: number;
  toLocation: string;
  toLat: number;
  toLng: number;
  polyline: string;
  totalDistanceKm: number;
  totalPrice: number;
  pricePerKm: number;
  totalSeats: number;
  departureAt: string;
  arrivalAt?: string;
  durationMinutes?: number;
  hostDisplayName?: string;
  hostRating?: number;
  hostRatingCount?: number;
  vehicleModel?: string;
  vehicleColor?: string;
  notes?: string | null;
  status?: TripStatus;
  vehicleId?: string;
  assignedDriverId?: string;
  seatConfig?: string[];
  /** Human-readable trip ID minted once at creation, e.g. "2606-CPTR-0001". */
  tripCode?: string | null;
  /** Per-segment prices keyed "fromStopIndex-toStopIndex", exactly as the host set them. */
  segmentPrices?: Record<string, number> | null;
}

export interface CreateTripStopInput {
  tripId: string;
  hostId: string;
  stopIndex: number;
  location: string;
  lat: number;
  lng: number;
  stopType: StopType;
  distanceFromOriginKm: number;
  priceFromOrigin: number;
}

export interface CreateBookingInput {
  tripId: string;
  travelerId: string;
  fromStopIndex: number;
  toStopIndex: number;
  seatsBooked: number;
  segmentPrice: number;
  passengerName: string;
  passengerPhone: string;
  passengers?: BookingPassenger[];
  status?: BookingStatus;
  paymentMethod?: "pay_on_car" | "pay_online";
  paymentReference?: string | null;
}

export interface CreateDriverProfileInput {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  city: string;
  /** Carried over from the account's existing member code/gender (e.g. when a guest becomes a host). */
  memberCode?: string | null;
  gender?: string | null;
  /** Which ID document the host uploaded for identity verification. */
  idDocType?: "aadhar" | "license" | null;
  idFrontDoc?: string | null;
  idBackDoc?: string | null;
  selfieDoc?: string | null;
}

export interface CreateDriverVehicleInput {
  driverUserId: string;
  modelName: string;
  plateNumber: string;
  seatCapacity: number;
  color?: string;
  registrationDoc?: string;
  insuranceDoc?: string;
  carImages?: string[];
}

function ids() {
  return getCollectionIds();
}

export async function listTrips(limit = 20): Promise<Trip[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.trips, [
    Query.orderAsc("departure_at"),
    Query.limit(limit),
  ]);
  return result.documents.map(toTrip);
}

export async function getTripById(tripId: string): Promise<Trip> {
  const c = ids();
  const doc = await databases.getDocument(appwriteConfig.databaseId, c.trips, tripId);
  return toTrip(doc);
}

/**
 * Look up a trip by its human-readable code (e.g. "2606-CPTR-0001"), used for
 * shareable /ride/<code> links. Relies on the `idx_trip_code` index on the
 * trips collection. Codes are stored uppercase, so we normalize the input.
 */
export async function getTripByCode(tripCode: string): Promise<Trip> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.trips, [
    Query.equal("trip_code", tripCode.trim().toUpperCase()),
    Query.limit(1),
  ]);
  const doc = result.documents[0];
  if (!doc) throw new Error("Trip not found");
  return toTrip(doc);
}

export async function listTripStops(tripId: string): Promise<TripStop[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.tripStops, [
    Query.equal("trip_id", tripId),
    Query.orderAsc("stop_index"),
    Query.limit(100),
  ]);
  return result.documents.map(toTripStop);
}

export async function listTripStopsByTripIds(tripIds: string[]): Promise<TripStop[]> {
  const unique = [...new Set(tripIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.tripStops, [
    Query.equal("trip_id", unique),
    Query.orderAsc("stop_index"),
    Query.limit(1000),
  ]);
  return result.documents.map(toTripStop);
}

export async function listHostTrips(hostId: string): Promise<Trip[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.trips, [
    Query.equal("host_id", hostId),
    Query.orderAsc("departure_at"),
    Query.limit(100),
  ]);
  return result.documents.map(toTrip);
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const c = ids();

  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    c.trips,
    ID.unique(),
    {
      host_id: input.hostId,
      from_location: input.fromLocation,
      from_lat: input.fromLat,
      from_lng: input.fromLng,
      to_location: input.toLocation,
      to_lat: input.toLat,
      to_lng: input.toLng,
      polyline: input.polyline,
      total_distance_km: input.totalDistanceKm,
      total_price: input.totalPrice,
      price_per_km: input.pricePerKm,
      total_seats: input.totalSeats,
      departure_at: input.departureAt,
      arrival_at: input.arrivalAt ?? null,
      duration_minutes: input.durationMinutes ?? 0,
      host_display_name: input.hostDisplayName ?? null,
      host_rating: input.hostRating ?? 0,
      host_rating_count: input.hostRatingCount ?? 0,
      vehicle_model: input.vehicleModel ?? null,
      vehicle_color: input.vehicleColor ?? null,
      status: input.status ?? "scheduled",
      notes: input.notes ?? null,
      vehicle_id: input.vehicleId ?? null,
      assigned_driver_id: input.assignedDriverId ?? null,
      seat_config: input.seatConfig ?? [],
      trip_code: input.tripCode ?? null,
      segment_prices:
        input.segmentPrices && Object.keys(input.segmentPrices).length > 0
          ? JSON.stringify(input.segmentPrices)
          : null,
    },
    [
      // Public read so travelers can search trips without an Appwrite session (e.g. homepage modal).
      Permission.read(Role.any()),
      Permission.update(Role.user(input.hostId)),
      Permission.delete(Role.user(input.hostId)),
    ],
  );
  return toTrip(doc);
}

export async function updateTrip(tripId: string, input: Partial<CreateTripInput>): Promise<Trip> {
  const c = ids();

  if (input.fromLocation || input.toLocation) {
  }

  const doc = await databases.updateDocument(appwriteConfig.databaseId, c.trips, tripId, {
    host_id: input.hostId,
    from_location: input.fromLocation,
    from_lat: input.fromLat,
    from_lng: input.fromLng,
    to_location: input.toLocation,
    to_lat: input.toLat,
    to_lng: input.toLng,
    polyline: input.polyline,
    total_distance_km: input.totalDistanceKm,
    total_price: input.totalPrice,
    price_per_km: input.pricePerKm,
    total_seats: input.totalSeats,
    departure_at: input.departureAt,
    arrival_at: input.arrivalAt,
    duration_minutes: input.durationMinutes,
    host_display_name: input.hostDisplayName,
    host_rating: input.hostRating,
    host_rating_count: input.hostRatingCount,
    vehicle_model: input.vehicleModel,
    vehicle_color: input.vehicleColor,
    status: input.status,
    notes: input.notes,
    vehicle_id: input.vehicleId,
    assigned_driver_id: input.assignedDriverId,
    seat_config: input.seatConfig,
    // Only touch the price matrix when the caller provided one (undefined
    // fields are dropped by the SDK; an explicit empty table clears it).
    segment_prices:
      input.segmentPrices !== undefined
        ? input.segmentPrices && Object.keys(input.segmentPrices).length > 0
          ? JSON.stringify(input.segmentPrices)
          : null
        : undefined,
  });
  return toTrip(doc);
}

export async function updateTripLocation(
  tripId: string,
  lat: number,
  lng: number,
  heading?: number,
): Promise<void> {
  const c = ids();
  await databases.updateDocument(appwriteConfig.databaseId, c.trips, tripId, {
    current_lat: lat,
    current_lng: lng,
    location_updated_at: new Date().toISOString(),
    // Stationary pings carry no heading — keep the last known direction
    // instead of wiping it, so the car doesn't snap back to north at stops.
    ...(heading != null && Number.isFinite(heading)
      ? { current_heading: Math.round(heading) % 360 }
      : {}),
  });
}

// --- Trip share / "Track Ride" public links ---------------------------------

function toTripShare(doc: any): TripShare {
  return {
    id: doc.$id,
    token: String(doc.token),
    tripId: String(doc.trip_id),
    role: doc.role === "guest" ? "guest" : "host",
    bookingId: doc.booking_id ? String(doc.booking_id) : undefined,
    expiresAt: doc.expires_at ? String(doc.expires_at) : undefined,
    revoked: Boolean(doc.revoked),
  };
}

/** True when the trip_shares collection is configured for this environment. */
export function isTripShareEnabled(): boolean {
  return Boolean(ids().tripShares);
}

function randomShareToken(): string {
  // URL-safe, unguessable token. crypto when available, ID.unique() as fallback.
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${ID.unique()}${ID.unique()}`;
}

/**
 * Mint a public "track this ride" link for a trip. Reuses an existing active
 * share for the same trip+booking when one is present so we don't pile up
 * tokens. Returns null when the trip_shares collection isn't set up yet.
 */
export async function createTripShare(input: {
  tripId: string;
  bookingId?: string;
  role?: "host" | "guest";
  /** ISO string; defaults to 12h from now. */
  expiresAt?: string;
}): Promise<TripShare | null> {
  const c = ids();
  if (!c.tripShares) return null;

  // Reuse an existing, non-revoked share for this trip/booking if any.
  try {
    const filters = [Query.equal("trip_id", input.tripId), Query.limit(1)];
    if (input.bookingId) filters.splice(1, 0, Query.equal("booking_id", input.bookingId));
    const existing = await databases.listDocuments(
      appwriteConfig.databaseId,
      c.tripShares,
      filters,
    );
    const reusable = existing.documents.find((d) => !d.revoked);
    if (reusable) return toTripShare(reusable);
  } catch {
    // Listing failed (e.g. missing index) — fall through and create a new one.
  }

  const expiresAt = input.expiresAt ?? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    c.tripShares,
    ID.unique(),
    {
      token: randomShareToken(),
      trip_id: input.tripId,
      role: input.role ?? "host",
      booking_id: input.bookingId ?? null,
      expires_at: expiresAt,
      revoked: false,
    },
    // Anyone can read (the public track page); only the creator can mutate.
    [Permission.read(Role.any())],
  );
  return toTripShare(doc);
}

export async function getTripShareByToken(token: string): Promise<TripShare | null> {
  const c = ids();
  if (!c.tripShares) return null;
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.tripShares, [
    Query.equal("token", token),
    Query.limit(1),
  ]);
  const doc = result.documents[0];
  return doc ? toTripShare(doc) : null;
}

export async function revokeTripShare(shareId: string): Promise<void> {
  const c = ids();
  if (!c.tripShares) return;
  await databases.updateDocument(appwriteConfig.databaseId, c.tripShares, shareId, {
    revoked: true,
  });
}

export async function deleteTrip(tripId: string): Promise<void> {
  const c = ids();
  await databases.deleteDocument(appwriteConfig.databaseId, c.trips, tripId);
}

// --- Deleted-account archive (admin view) ------------------------------------

function toDeletedAccount(doc: any): DeletedAccount {
  return {
    id: doc.$id,
    userId: String(doc.user_id || ""),
    fullName: String(doc.full_name || ""),
    phone: String(doc.phone || ""),
    email: String(doc.email || ""),
    roles: String(doc.roles || ""),
    memberCode: doc.member_code ? String(doc.member_code) : null,
    deletedAt: String(doc.deleted_at || doc.$createdAt || ""),
  };
}

export async function listDeletedAccounts(): Promise<DeletedAccount[]> {
  const c = ids();
  if (!c.deletedAccounts) return [];
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.deletedAccounts, [
    Query.orderDesc("$createdAt"),
    Query.limit(200),
  ]);
  return result.documents.map(toDeletedAccount);
}

export async function deleteTripStop(stopId: string): Promise<void> {
  const c = ids();
  await databases.deleteDocument(appwriteConfig.databaseId, c.tripStops, stopId);
}

export async function createTripStop(input: CreateTripStopInput): Promise<TripStop> {
  const c = ids();
  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    c.tripStops,
    ID.unique(),
    {
      trip_id: input.tripId,
      stop_index: input.stopIndex,
      location: input.location,
      lat: input.lat,
      lng: input.lng,
      stop_type: input.stopType,
      distance_from_origin_km: input.distanceFromOriginKm,
      price_from_origin: input.priceFromOrigin,
    },
    [
      Permission.read(Role.any()),
      Permission.update(Role.user(input.hostId)),
      Permission.delete(Role.user(input.hostId)),
    ],
  );
  return toTripStop(doc);
}

export async function listTravelerBookings(travelerId: string): Promise<Booking[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.bookings, [
    Query.equal("traveler_id", travelerId),
    Query.orderDesc("$createdAt"),
    Query.limit(100),
  ]);
  return result.documents.map(toBooking);
}

function generateBookingOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function createBooking(
  input: CreateBookingInput & { hostIdForPermissions?: string },
): Promise<Booking> {
  const c = ids();

  const payload: Record<string, unknown> = {
    trip_id: input.tripId,
    traveler_id: input.travelerId,
    from_stop_index: input.fromStopIndex,
    to_stop_index: input.toStopIndex,
    seats_booked: input.seatsBooked,
    segment_price: input.segmentPrice,
    passenger_name: input.passengerName,
    passenger_phone: input.passengerPhone,
    status: input.status ?? "pending",
    otp: generateBookingOtp(),
    verified: false,
  };
  if (input.passengers) payload.passengers_json = JSON.stringify(input.passengers);
  if (input.paymentMethod) payload.payment_method = input.paymentMethod;
  if (input.paymentReference) payload.payment_reference = input.paymentReference;

  const bookingPerms = [
    Permission.read(Role.user(input.travelerId)),
    Permission.update(Role.user(input.travelerId)),
    ...(input.hostIdForPermissions
      ? [
          Permission.read(Role.user(input.hostIdForPermissions)),
          Permission.update(Role.user(input.hostIdForPermissions)),
        ]
      : []),
  ];

  let doc;
  try {
    doc = await databases.createDocument(
      appwriteConfig.databaseId,
      c.bookings,
      ID.unique(),
      payload,
      bookingPerms,
    );
  } catch (err) {
    // A missing optional attribute on the bookings collection must NEVER cost a
    // paid customer their booking. Strip every optional/metadata field and
    // retry with only the core booking data so the seat is still secured.
    console.warn(
      "[createBooking] create failed — retrying without optional attributes (otp/verified/payment_*/passengers).",
      err,
    );
    delete payload.otp;
    delete payload.verified;
    delete payload.payment_method;
    delete payload.payment_reference;
    delete payload.passengers_json;
    doc = await databases.createDocument(
      appwriteConfig.databaseId,
      c.bookings,
      ID.unique(),
      payload,
      bookingPerms,
    );
  }
  return toBooking(doc);
}

export async function verifyBookingOtp(bookingId: string, otp: string): Promise<Booking> {
  const c = ids();
  const existing = await databases.getDocument(appwriteConfig.databaseId, c.bookings, bookingId);
  const storedOtp = existing.otp ? String(existing.otp) : "";
  if (!storedOtp) {
    throw new Error("No OTP on file for this booking.");
  }
  if (storedOtp !== otp.trim()) {
    throw new Error("Incorrect OTP.");
  }
  const updated = await databases.updateDocument(appwriteConfig.databaseId, c.bookings, bookingId, {
    verified: true,
  });
  return toBooking(updated);
}

export async function deleteBooking(bookingId: string): Promise<void> {
  const c = ids();
  await databases.deleteDocument(appwriteConfig.databaseId, c.bookings, bookingId);
}

/** Stable doc id for optimistic locking (one reservation per trip + seat code). */
export function tripSeatReservationDocumentId(tripId: string, seatCode: string): string {
  const slug = seatCode.replace(/[^a-zA-Z0-9]/g, "_");
  const joined = `${tripId}_${slug}`;
  if (joined.length <= 36) return joined;
  return `${tripId.slice(-14)}_${slug}`.slice(0, 36);
}

export async function getVehicleByDriverUserId(
  driverUserId: string,
): Promise<DriverVehicle | null> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.vehicles, [
    Query.equal("driver_user_id", driverUserId),
    Query.limit(1),
  ]);
  const doc = result.documents[0];
  return doc ? toDriverVehicle(doc) : null;
}

/** Fetch the exact vehicle assigned to a trip by its document ID. */
export async function getVehicleById(vehicleId: string): Promise<DriverVehicle | null> {
  const c = ids();
  try {
    const doc = await databases.getDocument(appwriteConfig.databaseId, c.vehicles, vehicleId);
    return toDriverVehicle(doc);
  } catch {
    return null;
  }
}

export async function listVehiclesByDriverUserId(driverUserId: string): Promise<DriverVehicle[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.vehicles, [
    Query.equal("driver_user_id", driverUserId),
    Query.orderDesc("$createdAt"),
    Query.limit(50),
  ]);
  return result.documents.map(toDriverVehicle);
}

/** Batch-fetch one vehicle per host user ID (for trip result card fallbacks). */
export async function getVehiclesByDriverUserIds(
  driverUserIds: string[],
): Promise<Map<string, DriverVehicle>> {
  const unique = [...new Set(driverUserIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.vehicles, [
    Query.equal("driver_user_id", unique),
    Query.limit(100),
  ]);
  const map = new Map<string, DriverVehicle>();
  for (const doc of result.documents) {
    const vehicle = toDriverVehicle(doc);
    if (!map.has(vehicle.driverUserId)) map.set(vehicle.driverUserId, vehicle);
  }
  return map;
}

/** Batch-fetch vehicles by their document IDs (keyed by vehicle id). */
export async function getVehiclesByIds(vehicleIds: string[]): Promise<Map<string, DriverVehicle>> {
  const unique = [...new Set(vehicleIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.vehicles, [
    Query.equal("$id", unique),
    Query.limit(100),
  ]);
  const map = new Map<string, DriverVehicle>();
  for (const doc of result.documents) map.set(doc.$id, toDriverVehicle(doc));
  return map;
}

export async function deleteDriverVehicle(vehicleId: string): Promise<void> {
  const c = ids();
  await databases.deleteDocument(appwriteConfig.databaseId, c.vehicles, vehicleId);
}

export async function createDriverVehicle(input: CreateDriverVehicleInput): Promise<DriverVehicle> {
  const c = ids();
  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    c.vehicles,
    ID.unique(),
    {
      driver_user_id: input.driverUserId,
      model_name: input.modelName,
      plate_number: input.plateNumber,
      seat_capacity: input.seatCapacity,
      color: input.color ?? null,
      registration_doc: input.registrationDoc ?? null,
      insurance_doc: input.insuranceDoc ?? null,
      car_images: input.carImages ?? [],
    },
    [
      Permission.read(Role.user(input.driverUserId)),
      Permission.update(Role.user(input.driverUserId)),
      Permission.delete(Role.user(input.driverUserId)),
    ],
  );
  return toDriverVehicle(doc);
}

// ── Team Drivers (sub-drivers added by the ride host) ──
// Stored in the same drivers collection.
// NOTE: Requires an `owner_user_id` attribute (string, optional) in the Appwrite `drivers` collection.

function toDriverProfileWithOwner(doc: Models.Document): DriverProfile {
  return {
    id: doc.$id,
    userId: String(doc.user_id),
    fullName: String(doc.full_name),
    email: String(doc.email),
    phone: String(doc.phone),
    licenseNumber: String(doc.license_number),
    city: String(doc.city),
    ownerUserId: doc.owner_user_id ? String(doc.owner_user_id) : undefined,
  };
}

export async function listTeamDrivers(ownerUserId: string): Promise<DriverProfile[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("owner_user_id", ownerUserId),
    Query.orderDesc("$createdAt"),
    Query.limit(100),
  ]);
  return result.documents.map(toDriverProfileWithOwner);
}

export interface CreateTeamDriverInput {
  ownerUserId: string;
  fullName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  city: string;
}

function duplicateDriverMessage(
  kind: "phone" | "email" | "license",
  driver: DriverProfile,
): string {
  const value =
    kind === "phone" ? driver.phone : kind === "email" ? driver.email : driver.licenseNumber;
  return `A host/driver with this ${kind} already exists: ${driver.fullName || "Existing driver"} (${value || driver.userId}).`;
}

async function assertNoDuplicateDriverIdentity(input: {
  phone?: string;
  email?: string;
  licenseNumber?: string;
  allowedDriverProfileId?: string;
}): Promise<void> {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const license = normalizeLicense(input.licenseNumber);
  if (!phone && !email && !license) return;

  const drivers = await listDriverProfiles();
  for (const driver of drivers) {
    if (input.allowedDriverProfileId && driver.id === input.allowedDriverProfileId) continue;
    if (phone && normalizePhone(driver.phone) === phone) {
      throw new Error(duplicateDriverMessage("phone", driver));
    }
    if (email && normalizeEmail(driver.email) === email) {
      throw new Error(duplicateDriverMessage("email", driver));
    }
    if (license && normalizeLicense(driver.licenseNumber) === license) {
      throw new Error(duplicateDriverMessage("license", driver));
    }
  }
}

export async function createTeamDriver(input: CreateTeamDriverInput): Promise<DriverProfile> {
  const c = ids();
  await assertNoDuplicateDriverIdentity(input);
  const doc = await databases.createDocument(appwriteConfig.databaseId, c.drivers, ID.unique(), {
    user_id: `team_${ID.unique()}`,
    owner_user_id: input.ownerUserId,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    license_number: input.licenseNumber,
    city: input.city,
  });
  return toDriverProfileWithOwner(doc);
}

export async function updateTeamDriver(
  driverProfileId: string,
  input: Omit<CreateTeamDriverInput, "ownerUserId">,
): Promise<DriverProfile> {
  const c = ids();
  await assertNoDuplicateDriverIdentity({ ...input, allowedDriverProfileId: driverProfileId });
  const doc = await databases.updateDocument(
    appwriteConfig.databaseId,
    c.drivers,
    driverProfileId,
    {
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      license_number: input.licenseNumber,
      city: input.city,
    },
  );
  return toDriverProfileWithOwner(doc);
}

export async function deleteTeamDriver(driverProfileId: string): Promise<void> {
  const c = ids();
  await databases.deleteDocument(appwriteConfig.databaseId, c.drivers, driverProfileId);
}

export async function listTripSeatReservations(tripId: string): Promise<TripSeatReservation[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.tripSeatReservations, [
    Query.equal("trip_id", tripId),
    Query.limit(100),
  ]);
  return result.documents.map(toTripSeatReservation);
}

export async function listTripSeatReservationsByTripIds(
  tripIds: string[],
): Promise<TripSeatReservation[]> {
  const unique = [...new Set(tripIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.tripSeatReservations, [
    Query.equal("trip_id", unique),
    Query.limit(500),
  ]);
  return result.documents.map(toTripSeatReservation);
}

async function createTripSeatReservation(input: {
  tripId: string;
  bookingId: string;
  seatCode: string;
  travelerId: string;
  hostId: string;
  gender?: PassengerGender;
}): Promise<TripSeatReservation> {
  const c = ids();
  const docId = tripSeatReservationDocumentId(input.tripId, input.seatCode);
  const payload: Record<string, unknown> = {
    trip_id: input.tripId,
    seat_code: input.seatCode,
    booking_id: input.bookingId,
  };
  if (input.gender) payload.gender = input.gender;

  const seatPerms = [
    Permission.read(Role.any()),
    Permission.delete(Role.user(input.travelerId)),
    Permission.delete(Role.user(input.hostId)),
  ];

  let doc;
  try {
    doc = await databases.createDocument(
      appwriteConfig.databaseId,
      c.tripSeatReservations,
      docId,
      payload,
      seatPerms,
    );
  } catch (err) {
    // The `gender` attribute may not exist on the collection yet. Don't let a
    // missing optional field fail the whole booking — retry without it.
    if (payload.gender !== undefined) {
      console.warn(
        "[createTripSeatReservation] retry without gender — add a `gender` attribute to the trip_seat_reservations collection to store passenger gender.",
        err,
      );
      delete payload.gender;
      doc = await databases.createDocument(
        appwriteConfig.databaseId,
        c.tripSeatReservations,
        docId,
        payload,
        seatPerms,
      );
    } else {
      throw err;
    }
  }
  return toTripSeatReservation(doc);
}

async function deleteTripSeatReservation(documentId: string): Promise<void> {
  const c = ids();
  await databases.deleteDocument(appwriteConfig.databaseId, c.tripSeatReservations, documentId);
}

export async function createBookingWithSeatReservations(
  input: CreateBookingInput & { seatCodes: string[]; hostId: string },
): Promise<Booking> {
  const occupied = new Set((await listTripSeatReservations(input.tripId)).map((r) => r.seatCode));
  for (const code of input.seatCodes) {
    if (occupied.has(code)) {
      throw new Error(`Seat ${code} is no longer available. Refresh and try again.`);
    }
  }

  // One mobile number can't hold two active seats on the same trip. Cancelled
  // bookings are ignored, so a passenger can cancel and rebook.
  const newPhones = (input.passengers ?? []).map((p) => normalizePhone(p.phone)).filter(Boolean);
  if (newPhones.length) {
    const existingPhones = new Set<string>();
    for (const b of await listTripBookings(input.tripId)) {
      if (b.status === "cancelled") continue;
      for (const p of getBookingPassengers(b)) {
        const norm = normalizePhone(p.phone);
        if (norm) existingPhones.add(norm);
      }
    }
    const dup = newPhones.find((p) => existingPhones.has(p));
    if (dup) {
      throw new Error(
        "This mobile number already has a booking on this trip. Cancel that booking first to rebook.",
      );
    }
  }

  const booking = await createBooking({ ...input, hostIdForPermissions: input.hostId });
  const createdIds: string[] = [];

  try {
    for (const seatCode of input.seatCodes) {
      const passenger = input.passengers?.find((item) => item.seatCode === seatCode);
      await createTripSeatReservation({
        tripId: input.tripId,
        bookingId: booking.id,
        seatCode,
        travelerId: input.travelerId,
        hostId: input.hostId,
        gender: passenger?.gender,
      });
      createdIds.push(tripSeatReservationDocumentId(input.tripId, seatCode));
    }
    return booking;
  } catch (error) {
    for (const id of createdIds) {
      try {
        await deleteTripSeatReservation(id);
      } catch {
        /* ignore */
      }
    }
    try {
      await deleteBooking(booking.id);
    } catch {
      /* ignore */
    }
    throw error;
  }
}

export async function listTripBookings(tripId: string): Promise<Booking[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.bookings, [
    Query.equal("trip_id", tripId),
    Query.orderDesc("$createdAt"),
    Query.limit(100),
  ]);
  return result.documents.map(toBooking);
}

export async function listHostBookings(hostId: string): Promise<Booking[]> {
  const c = ids();
  // First get all trip IDs for this host
  const trips = await databases.listDocuments(appwriteConfig.databaseId, c.trips, [
    Query.equal("host_id", hostId),
    Query.limit(100),
  ]);
  const tripIds = trips.documents.map((t) => t.$id);

  if (tripIds.length === 0) return [];

  const result = await databases.listDocuments(appwriteConfig.databaseId, c.bookings, [
    Query.equal("trip_id", tripIds),
    Query.orderDesc("$createdAt"),
    Query.limit(100),
  ]);
  return result.documents.map(toBooking);
}

export async function updateBookingRating(
  bookingId: string,
  rating: number,
  comment?: string,
): Promise<void> {
  const c = ids();
  await databases.updateDocument(appwriteConfig.databaseId, c.bookings, bookingId, {
    rating_by_host: rating,
    comment_by_host: comment ?? null,
  });
}

export async function getPricingRule(): Promise<PricingRule | null> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.pricingRules, [
    Query.limit(1),
  ]);
  return result.documents[0] ? toPricingRule(result.documents[0]) : null;
}

export async function listUserRoles(userId: string): Promise<AppRole[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.userRoles, [
    Query.equal("user_id", userId),
    Query.limit(10),
  ]);
  return result.documents
    .map((doc) => String(doc.role))
    .filter((role): role is AppRole => ["admin", "driver", "user"].includes(role));
}

/** Wipes all driver-specific data for a user:
 *  - removes the "driver" role row from user_roles
 *  - deletes their driver profile from drivers (matched by user_id or owner_user_id)
 *  - deletes any vehicles they own from vehicles
 *  Leaves trips/bookings intact (passengers may have active reservations) and
 *  does NOT delete the Appwrite account itself — the client SDK cannot delete
 *  arbitrary users, so the caller should still signOut after this. */
export async function deleteDriverAccount(userId: string): Promise<void> {
  const c = ids();
  // 1. driver role row(s)
  const roleDocs = await databases.listDocuments(appwriteConfig.databaseId, c.userRoles, [
    Query.equal("user_id", userId),
    Query.equal("role", "driver"),
    Query.limit(10),
  ]);
  await Promise.all(
    roleDocs.documents.map((d) =>
      databases.deleteDocument(appwriteConfig.databaseId, c.userRoles, d.$id),
    ),
  );

  // 2. vehicles owned by this driver
  const vehicleDocs = await databases.listDocuments(appwriteConfig.databaseId, c.vehicles, [
    Query.equal("driver_user_id", userId),
    Query.limit(100),
  ]);
  await Promise.all(
    vehicleDocs.documents.map((d) =>
      databases.deleteDocument(appwriteConfig.databaseId, c.vehicles, d.$id),
    ),
  );

  // 3. driver profile (collection uses user_id for primary host accounts and
  //    owner_user_id for team-member driver rows the host has added).
  const profileDocs = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.or([Query.equal("user_id", userId), Query.equal("owner_user_id", userId)]),
    Query.limit(50),
  ]);
  await Promise.all(
    profileDocs.documents.map((d) =>
      databases.deleteDocument(appwriteConfig.databaseId, c.drivers, d.$id),
    ),
  );
}

export async function assignRole(userId: string, role: AppRole): Promise<void> {
  const c = ids();
  const existing = await databases.listDocuments(appwriteConfig.databaseId, c.userRoles, [
    Query.equal("user_id", userId),
    Query.equal("role", role),
    Query.limit(1),
  ]);
  if (existing.total > 0) return;
  await databases.createDocument(appwriteConfig.databaseId, c.userRoles, ID.unique(), {
    user_id: userId,
    role,
  });
}

export async function upsertDriverProfile(input: CreateDriverProfileInput): Promise<DriverProfile> {
  const c = ids();
  const existing = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("user_id", input.userId),
    Query.limit(1),
  ]);

  if (existing.total > 0) {
    const updated = await databases.updateDocument(
      appwriteConfig.databaseId,
      c.drivers,
      existing.documents[0].$id,
      {
        full_name: input.fullName,
        email: input.email,
        phone: input.phone,
        license_number: input.licenseNumber,
        city: input.city,
        // Backfill onto legacy docs without clobbering an existing value.
        ...(input.memberCode && !existing.documents[0].member_code
          ? { member_code: input.memberCode }
          : {}),
        ...(input.gender && !existing.documents[0].gender ? { gender: input.gender } : {}),
        ...(input.idDocType ? { id_doc_type: input.idDocType } : {}),
        ...(input.idFrontDoc ? { id_front_doc: input.idFrontDoc } : {}),
        ...(input.idBackDoc ? { id_back_doc: input.idBackDoc } : {}),
        ...(input.selfieDoc ? { selfie_doc: input.selfieDoc } : {}),
      },
    );
    return toDriverProfile(updated);
  }

  const created = await databases.createDocument(
    appwriteConfig.databaseId,
    c.drivers,
    ID.unique(),
    {
      user_id: input.userId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      license_number: input.licenseNumber,
      city: input.city,
      member_code: input.memberCode ?? null,
      gender: input.gender ?? null,
      id_doc_type: input.idDocType ?? null,
      id_front_doc: input.idFrontDoc ?? null,
      id_back_doc: input.idBackDoc ?? null,
      selfie_doc: input.selfieDoc ?? null,
    },
    [
      Permission.read(Role.any()),
      Permission.update(Role.user(input.userId)),
    ],
  );
  return toDriverProfile(created);
}

export async function upsertDriverVehicle(input: CreateDriverVehicleInput): Promise<DriverVehicle> {
  const c = ids();
  const existing = await databases.listDocuments(appwriteConfig.databaseId, c.vehicles, [
    Query.equal("driver_user_id", input.driverUserId),
    Query.limit(1),
  ]);

  const payload = {
    driver_user_id: input.driverUserId,
    model_name: input.modelName,
    plate_number: input.plateNumber,
    seat_capacity: input.seatCapacity,
    color: input.color ?? null,
    registration_doc: input.registrationDoc ?? null,
    insurance_doc: input.insuranceDoc ?? null,
    car_images: input.carImages ?? [],
  };

  if (existing.total > 0) {
    const updated = await databases.updateDocument(
      appwriteConfig.databaseId,
      c.vehicles,
      existing.documents[0].$id,
      payload,
    );
    return toDriverVehicle(updated);
  }

  const created = await databases.createDocument(
    appwriteConfig.databaseId,
    c.vehicles,
    ID.unique(),
    payload,
    [
      Permission.read(Role.user(input.driverUserId)),
      Permission.update(Role.user(input.driverUserId)),
      Permission.delete(Role.user(input.driverUserId)),
    ],
  );
  return toDriverVehicle(created);
}

/** Writes member_code onto a driver doc that was created before the code was assigned. */
export async function patchDriverProfileMemberCode(
  userId: string,
  memberCode: string,
): Promise<void> {
  const c = ids();
  const existing = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("user_id", userId),
    Query.limit(1),
  ]);
  if (existing.total === 0 || existing.documents[0].member_code) return;
  await databases.updateDocument(
    appwriteConfig.databaseId,
    c.drivers,
    existing.documents[0].$id,
    { member_code: memberCode },
  );
}

export async function listDriverProfiles(): Promise<DriverProfile[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.orderDesc("$createdAt"),
    Query.limit(200),
  ]);
  return result.documents.map(toDriverProfile);
}

/** Resolve host display info for a set of host user ids (used by trip cards). */
export async function listDriverProfilesByUserIds(userIds: string[]): Promise<DriverProfile[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("user_id", unique),
    Query.limit(100),
  ]);
  return result.documents.map(toDriverProfile);
}

/** Get ride preferences for a single host by their user ID. */
export async function getHostPreferences(hostUserId: string): Promise<RidePreferences | null> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("user_id", hostUserId),
    Query.limit(1),
  ]);
  if (result.total === 0) return null;
  const doc = result.documents[0];
  return {
    smokingAllowed: Boolean(doc.smoking_allowed ?? false),
    alcoholAllowed: Boolean(doc.alcohol_allowed ?? false),
    musicAllowed: Boolean(doc.music_allowed ?? false),
    musicType: (doc.music_type as MusicType | null) ?? null,
    musicOnly: Boolean(doc.music_only ?? false),
    petsAllowed: Boolean(doc.pets_allowed ?? false),
  };
}

/** Save ride preferences for a host (looked up by user ID). */
export async function updateHostPreferences(
  hostUserId: string,
  prefs: RidePreferences,
): Promise<void> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("user_id", hostUserId),
    Query.limit(1),
  ]);
  if (result.total === 0) throw new Error("Driver profile not found");
  await databases.updateDocument(appwriteConfig.databaseId, c.drivers, result.documents[0].$id, {
    smoking_allowed: prefs.smokingAllowed,
    alcohol_allowed: prefs.alcoholAllowed,
    music_allowed: prefs.musicAllowed,
    music_type: prefs.musicAllowed ? (prefs.musicType ?? null) : null,
    music_only: prefs.musicAllowed ? prefs.musicOnly : false,
    pets_allowed: prefs.petsAllowed,
  });
}

/** Update just the profile photo for a host (lightweight patch). */
export async function updateDriverPhoto(
  hostUserId: string,
  photoUrl: string | null,
): Promise<void> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("user_id", hostUserId),
    Query.limit(1),
  ]);
  if (result.total === 0) throw new Error("Driver profile not found");
  await databases.updateDocument(appwriteConfig.databaseId, c.drivers, result.documents[0].$id, {
    photo_url: photoUrl,
  });
}

/** Update just the bio for a host (lightweight patch, no other fields touched). */
export async function updateDriverBio(hostUserId: string, bio: string): Promise<void> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("user_id", hostUserId),
    Query.limit(1),
  ]);
  if (result.total === 0) throw new Error("Driver profile not found");
  await databases.updateDocument(appwriteConfig.databaseId, c.drivers, result.documents[0].$id, {
    bio: bio.trim() || null,
  });
}

/** Batch-fetch ride preferences for multiple host user IDs (for trip result cards). */
export async function getMultipleHostPreferences(
  hostUserIds: string[],
): Promise<Map<string, RidePreferences>> {
  const unique = [...new Set(hostUserIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("user_id", unique),
    Query.limit(100),
  ]);
  const map = new Map<string, RidePreferences>();
  for (const doc of result.documents) {
    map.set(String(doc.user_id), {
      smokingAllowed: Boolean(doc.smoking_allowed ?? false),
      alcoholAllowed: Boolean(doc.alcohol_allowed ?? false),
      musicAllowed: Boolean(doc.music_allowed ?? false),
      musicType: (doc.music_type as MusicType | null) ?? null,
      musicOnly: Boolean(doc.music_only ?? false),
      petsAllowed: Boolean(doc.pets_allowed ?? false),
    });
  }
  return map;
}

export async function listActiveTrips(limit = 200): Promise<Trip[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.trips, [
    Query.equal("status", ["scheduled", "in_progress"]),
    Query.orderAsc("departure_at"),
    Query.limit(limit),
  ]);
  // Hide trips the host has paused (active === false).
  return result.documents.map(toTrip).filter((t) => t.active !== false);
}

export interface TrendingRoutesOptions {
  /** When set, only routes touching this city are considered. */
  city?: string | null;
  /** Max route cards to return (default 4). */
  limit?: number;
}

function tripRouteSegment(value: string): string {
  return value.toLowerCase().split(",")[0].replace(/\s+/g, " ").trim();
}

/**
 * Trending routes for the home page. Valid trips only (status scheduled/in_progress,
 * departure not before today's calendar date — server-side filtered in Appwrite).
 * Groups remaining trips by `from -> to` city segment and returns the representative
 * (earliest upcoming) trip of each route that occurs more than once, ranked by
 * occurrence count. If no route repeats, falls back to the 3 earliest-created trips.
 */
export async function listTrendingRoutes(options?: TrendingRoutesOptions): Promise<Trip[]> {
  const c = ids();
  const maxCards = options?.limit ?? 4;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const result = await databases.listDocuments(appwriteConfig.databaseId, c.trips, [
    Query.equal("status", ["scheduled", "in_progress"]),
    Query.greaterThanEqual("departure_at", startOfToday.toISOString()),
    Query.orderAsc("departure_at"),
    Query.limit(200),
  ]);

  let rows = result.documents
    .map((d) => ({
      trip: toTrip(d),
      createdAt: String(d.$createdAt ?? ""),
    }))
    .filter((r) => r.trip.active !== false);

  const city = options?.city?.trim();
  if (city) {
    const cityKey = tripRouteSegment(city);
    rows = rows.filter(
      ({ trip }) =>
        routeCitySegmentsMatch(tripRouteSegment(trip.fromLocation), cityKey) ||
        routeCitySegmentsMatch(tripRouteSegment(trip.toLocation), cityKey),
    );
  }

  // rows are already ordered by departure_at asc, so the first trip seen for a
  // route key is its earliest upcoming representative.
  const groups = new Map<string, { representative: Trip; count: number }>();
  for (const { trip } of rows) {
    const key = `${tripRouteSegment(trip.fromLocation)}|${tripRouteSegment(trip.toLocation)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { representative: trip, count: 1 });
    }
  }

  const trending = [...groups.values()]
    .filter((g) => g.count > 1)
    .sort(
      (a, b) =>
        b.count - a.count ||
        new Date(a.representative.departureAt).getTime() -
          new Date(b.representative.departureAt).getTime(),
    )
    .slice(0, maxCards)
    .map((g) => g.representative);

  if (trending.length > 0) return trending;

  // Fallback: no route repeats — show the 3 earliest-created valid trips.
  return [...rows]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 3)
    .map((r) => r.trip);
}

function toHeroBanner(doc: any): HeroBanner {
  const imageId = String(doc.imageId || "");
  let imageUrl = doc.imageUrl ? String(doc.imageUrl) : null;

  if (!imageUrl && imageId) {
    imageUrl = getBannerImageUrl(imageId);
  }

  return {
    id: doc.$id,
    title: doc.title ? String(doc.title) : null,
    imageId,
    imageUrl,
    linkUrl: doc.linkUrl ? String(doc.linkUrl) : null,
    startDate: doc.startDate ? String(doc.startDate) : null,
    endDate: doc.endDate ? String(doc.endDate) : null,
    isActive: Boolean(doc.isActive),
    sortOrder: Number(doc.sortOrder || 0),
  };
}

export async function listHeroBanners(includeInactive = false): Promise<HeroBanner[]> {
  const c = ids();
  const queries = [Query.orderAsc("sortOrder")];
  if (!includeInactive) {
    queries.push(Query.equal("isActive", true));
  }
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.heroBanners, queries);
  return result.documents.map(toHeroBanner);
}

export async function createHeroBanner(input: Omit<HeroBanner, "id">): Promise<HeroBanner> {
  const c = ids();
  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    c.heroBanners,
    ID.unique(),
    {
      title: input.title ?? null,
      imageId: input.imageId,
      imageUrl: input.imageUrl ?? null,
      linkUrl: input.linkUrl ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    },
    [
      Permission.read(Role.any()),
    ],
  );
  return toHeroBanner(doc);
}

export async function updateHeroBanner(
  id: string,
  input: Partial<Omit<HeroBanner, "id">>,
): Promise<HeroBanner> {
  const c = ids();
  const doc = await databases.updateDocument(appwriteConfig.databaseId, c.heroBanners, id, {
    title: input.title,
    imageId: input.imageId,
    imageUrl: input.imageUrl,
    linkUrl: input.linkUrl,
    startDate: input.startDate,
    endDate: input.endDate,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  });
  return toHeroBanner(doc);
}

export async function deleteHeroBanner(id: string): Promise<void> {
  const c = ids();
  await databases.deleteDocument(appwriteConfig.databaseId, c.heroBanners, id);
}

export async function uploadBannerImage(file: File): Promise<string> {
  const result = await storage.createFile(appwriteConfig.bannersBucketId, ID.unique(), file, [
    Permission.read(Role.any()),
    Permission.update(Role.users()),
    Permission.delete(Role.users()),
  ]);
  return result.$id;
}

export function getBannerImageUrl(imageId: string): string {
  const { endpoint, projectId, bannersBucketId } = appwriteConfig;
  return `${endpoint}/storage/buckets/${bannersBucketId}/files/${imageId}/view?project=${projectId}`;
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

/** All trips regardless of status, newest departure first — for admin Trip Manager. */
export async function listAllTrips(limit = 200): Promise<Trip[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.trips, [
    Query.orderDesc("departure_at"),
    Query.limit(limit),
  ]);
  return result.documents.map(toTrip);
}

/** All bookings across the platform, newest first — for admin Booking Manager. */
export async function listAllBookings(limit = 200): Promise<Booking[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.bookings, [
    Query.orderDesc("$createdAt"),
    Query.limit(limit),
  ]);
  return result.documents.map(toBooking);
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
): Promise<Booking> {
  const c = ids();
  const doc = await databases.updateDocument(appwriteConfig.databaseId, c.bookings, bookingId, {
    status,
  });
  return toBooking(doc);
}

/**
 * Cancel a booking and release its seats so the slot reopens and the mobile
 * number can book again (used by passengers from My Trips).
 */
export async function cancelBooking(bookingId: string): Promise<void> {
  const c = ids();
  const bookingDoc = await databases.getDocument(appwriteConfig.databaseId, c.bookings, bookingId);
  const booking = toBooking(bookingDoc);
  try {
    const reservations = await listTripSeatReservations(booking.tripId);
    for (const r of reservations) {
      if (r.bookingId !== bookingId) continue;
      try {
        await deleteTripSeatReservation(tripSeatReservationDocumentId(booking.tripId, r.seatCode));
      } catch {
        /* seat already gone — ignore */
      }
    }
  } catch {
    /* couldn't list reservations — still cancel the booking below */
  }
  await databases.updateDocument(appwriteConfig.databaseId, c.bookings, bookingId, {
    status: "cancelled",
  });
}

/** All vehicles across all drivers — for admin Vehicle Manager. */
export async function listAllVehicles(): Promise<DriverVehicle[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.vehicles, [
    Query.orderDesc("$createdAt"),
    Query.limit(200),
  ]);
  return result.documents.map(toDriverVehicle);
}

export async function updateVehicleVerification(
  vehicleId: string,
  status: VerificationStatus,
  note?: string | null,
): Promise<DriverVehicle> {
  const c = ids();
  const doc = await databases.updateDocument(appwriteConfig.databaseId, c.vehicles, vehicleId, {
    verification_status: status,
    verification_note: note ?? null,
  });
  return toDriverVehicle(doc);
}

export async function updateDriverVerification(
  driverId: string,
  status: VerificationStatus,
  note?: string | null,
): Promise<DriverProfile> {
  const c = ids();
  const doc = await databases.updateDocument(appwriteConfig.databaseId, c.drivers, driverId, {
    verification_status: status,
    verification_note: note ?? null,
  });
  return toDriverProfile(doc);
}

export interface UpdatePricingRuleInput {
  minPricePerKm: number;
  maxPricePerKm: number;
  routeMatchToleranceKm: number;
}

/** Update the single pricing rule doc, creating it if it doesn't exist yet. */
export async function updatePricingRule(input: UpdatePricingRuleInput): Promise<PricingRule> {
  const c = ids();
  const payload = {
    min_price_per_km: input.minPricePerKm,
    max_price_per_km: input.maxPricePerKm,
    route_match_tolerance_km: input.routeMatchToleranceKm,
    updated_at: new Date().toISOString(),
  };
  const existing = await databases.listDocuments(appwriteConfig.databaseId, c.pricingRules, [
    Query.limit(1),
  ]);
  if (existing.total > 0) {
    const doc = await databases.updateDocument(
      appwriteConfig.databaseId,
      c.pricingRules,
      existing.documents[0].$id,
      payload,
    );
    return toPricingRule(doc);
  }
  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    c.pricingRules,
    ID.unique(),
    payload,
  );
  return toPricingRule(doc);
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export interface UpsertBankAccountInput {
  driverUserId: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  upiId?: string | null;
}

/** A driver/host's saved payout bank account, or null if not set up yet. */
export async function getBankAccount(driverUserId: string): Promise<BankAccount | null> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.bankAccounts, [
    Query.equal("driver_user_id", driverUserId),
    Query.limit(1),
  ]);
  return result.documents[0] ? toBankAccount(result.documents[0]) : null;
}

export async function upsertBankAccount(input: UpsertBankAccountInput): Promise<BankAccount> {
  const c = ids();
  const payload = {
    driver_user_id: input.driverUserId,
    account_holder_name: input.accountHolderName,
    account_number: input.accountNumber,
    ifsc_code: input.ifscCode,
    upi_id: input.upiId ?? null,
  };
  const existing = await databases.listDocuments(appwriteConfig.databaseId, c.bankAccounts, [
    Query.equal("driver_user_id", input.driverUserId),
    Query.limit(1),
  ]);
  if (existing.total > 0) {
    const doc = await databases.updateDocument(
      appwriteConfig.databaseId,
      c.bankAccounts,
      existing.documents[0].$id,
      payload,
    );
    return toBankAccount(doc);
  }
  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    c.bankAccounts,
    ID.unique(),
    payload,
    [
      Permission.read(Role.user(input.driverUserId)),
      Permission.update(Role.user(input.driverUserId)),
      Permission.delete(Role.user(input.driverUserId)),
    ],
  );
  return toBankAccount(doc);
}

/** A driver/host's own payout request history, newest first. */
export async function listPayoutRequestsByDriver(driverUserId: string): Promise<PayoutRequest[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.payoutRequests, [
    Query.equal("driver_user_id", driverUserId),
    Query.orderDesc("requested_at"),
    Query.limit(100),
  ]);
  return result.documents.map(toPayoutRequest);
}

export interface CreatePayoutRequestInput {
  driverUserId: string;
  /** Net amount the host is withdrawing. */
  amount: number;
  /**
   * Gross amount this withdrawal is drawn from — the proportional slice of
   * the host's unclaimed gross earnings that funds this net `amount`. The
   * platform's 5% fee is derived from this and snapshotted alongside it so
   * the commission never has to be reverse-estimated later.
   */
  grossAmount: number;
  bankAccount: BankAccount;
  /** Per-trip payout: the trip this request belongs to. */
  tripId?: string | null;
  /** Snapshot of route label, e.g. "Kochi → Bengaluru". */
  tripRoute?: string | null;
  /** Snapshot of departure date (ISO string). */
  tripDate?: string | null;
}

/** Create a payout request, snapshotting the bank account details and the gross/fee split at request time. */
export async function createPayoutRequest(input: CreatePayoutRequestInput): Promise<PayoutRequest> {
  const c = ids();
  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    c.payoutRequests,
    ID.unique(),
    {
      driver_user_id: input.driverUserId,
      amount: input.amount,
      gross_amount: input.grossAmount,
      platform_fee: platformFee(input.grossAmount),
      status: "pending",
      requested_at: new Date().toISOString(),
      account_holder_name: input.bankAccount.accountHolderName,
      account_number: input.bankAccount.accountNumber,
      ifsc_code: input.bankAccount.ifscCode,
      upi_id: input.bankAccount.upiId ?? null,
      trip_id: input.tripId ?? null,
      trip_route: input.tripRoute ?? null,
      trip_date: input.tripDate ?? null,
    },
    [Permission.read(Role.user(input.driverUserId))],
  );
  return toPayoutRequest(doc);
}

/** All payout requests across drivers, newest first — for the admin Payouts panel. */
export async function listAllPayoutRequests(limit = 200): Promise<PayoutRequest[]> {
  const c = ids();
  const result = await databases.listDocuments(appwriteConfig.databaseId, c.payoutRequests, [
    Query.orderDesc("requested_at"),
    Query.limit(limit),
  ]);
  return result.documents.map(toPayoutRequest);
}

export interface UpdatePayoutRequestInput {
  status: PayoutStatus;
  paymentReference?: string | null;
  adminNote?: string | null;
}

export async function updatePayoutRequestStatus(
  requestId: string,
  input: UpdatePayoutRequestInput,
): Promise<PayoutRequest> {
  const c = ids();
  const doc = await databases.updateDocument(
    appwriteConfig.databaseId,
    c.payoutRequests,
    requestId,
    {
      status: input.status,
      payment_reference: input.paymentReference ?? null,
      admin_note: input.adminNote ?? null,
      processed_at:
        input.status === "paid" || input.status === "rejected" ? new Date().toISOString() : null,
    },
  );
  return toPayoutRequest(doc);
}

// ── Reviews ──────────────────────────────────────────────────────────────────

function toReview(doc: any): Review {
  return {
    id: doc.$id,
    tripId: doc.trip_id,
    bookingId: doc.booking_id,
    fromUserId: doc.from_user_id,
    toUserId: doc.to_user_id,
    direction: doc.direction as ReviewDirection,
    stars: doc.stars,
    tags: doc.tags ?? [],
    createdAt: doc.created_at,
  };
}

export async function createReview(data: Omit<Review, "id" | "createdAt">): Promise<Review> {
  const c = ids();
  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    c.reviews,
    ID.unique(),
    {
      trip_id: data.tripId,
      booking_id: data.bookingId,
      from_user_id: data.fromUserId,
      to_user_id: data.toUserId,
      direction: data.direction,
      stars: data.stars,
      tags: data.tags,
      created_at: new Date().toISOString(),
    },
    [
      Permission.read(Role.any()),
      Permission.update(Role.user(data.fromUserId)),
      Permission.delete(Role.user(data.fromUserId)),
    ],
  );
  return toReview(doc);
}

export async function listReviewsForUser(toUserId: string): Promise<Review[]> {
  const c = ids();
  const res = await databases.listDocuments(appwriteConfig.databaseId, c.reviews, [
    Query.equal("to_user_id", toUserId),
    Query.orderDesc("created_at"),
    Query.limit(100),
  ]);
  return res.documents.map(toReview);
}

export async function getExistingReview(
  bookingId: string,
  direction: ReviewDirection,
): Promise<Review | null> {
  const c = ids();
  const res = await databases.listDocuments(appwriteConfig.databaseId, c.reviews, [
    Query.equal("booking_id", bookingId),
    Query.equal("direction", direction),
    Query.limit(1),
  ]);
  return res.documents.length > 0 ? toReview(res.documents[0]) : null;
}

export async function updateDriverRatingAggregate(hostUserId: string): Promise<void> {
  const c = ids();
  const res = await databases.listDocuments(appwriteConfig.databaseId, c.reviews, [
    Query.equal("to_user_id", hostUserId),
    Query.equal("direction", "guest_to_host"),
    Query.limit(200),
  ]);
  const reviews = res.documents.map(toReview);
  if (reviews.length === 0) return;
  const avg = reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length;
  // Find driver document to update
  const driverRes = await databases.listDocuments(appwriteConfig.databaseId, c.drivers, [
    Query.equal("user_id", hostUserId),
    Query.limit(1),
  ]);
  if (driverRes.documents.length === 0) return;
  await databases.updateDocument(appwriteConfig.databaseId, c.drivers, driverRes.documents[0].$id, {
    rating_avg: Math.round(avg * 10) / 10,
    rating_count: reviews.length,
  });
}

// ── Phase 2: private photo uploads + verification/no-show records ─────────────

/** Upload a photo to the private (uploader-readable only) docs bucket. Returns
 *  the file id. Admins view it via the adminGetPrivateFile server function. */
export async function uploadPrivatePhoto(userId: string, file: File): Promise<string> {
  const compressed = await (await import("@/lib/image-compression")).compressImage(file);
  const uploaded = await storage.createFile(appwriteConfig.driverDocsBucketId, ID.unique(), compressed, [
    Permission.read(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ]);
  return uploaded.$id;
}

export interface MemberVerification {
  id: string;
  userId: string;
  selfieFileId: string | null;
  status: "pending" | "approved" | "rejected";
  submittedAt: string | null;
  reviewedAt: string | null;
  adminNote: string | null;
}

function toMemberVerification(d: any): MemberVerification {
  return {
    id: d.$id,
    userId: String(d.user_id || ""),
    selfieFileId: d.selfie_file_id ? String(d.selfie_file_id) : null,
    status: (String(d.status || "pending") as MemberVerification["status"]),
    submittedAt: d.submitted_at ? String(d.submitted_at) : null,
    reviewedAt: d.reviewed_at ? String(d.reviewed_at) : null,
    adminNote: d.admin_note ? String(d.admin_note) : null,
  };
}

/** The caller's own verification row (doc id == userId), or null. */
export async function getMyMemberVerification(userId: string): Promise<MemberVerification | null> {
  const c = ids();
  try {
    const doc = await databases.getDocument(appwriteConfig.databaseId, c.memberVerifications, userId);
    return toMemberVerification(doc);
  } catch {
    return null;
  }
}

/** Submit / resubmit a selfie for verification (doc id == userId, upserted). */
export async function submitSelfieVerification(input: {
  userId: string;
  selfieFileId: string;
  displayName?: string;
  phone?: string;
}): Promise<MemberVerification> {
  const c = ids();
  const payload = {
    user_id: input.userId,
    selfie_file_id: input.selfieFileId,
    status: "pending",
    display_name: input.displayName ?? null,
    phone: input.phone ?? null,
    submitted_at: new Date().toISOString(),
  };
  const perms = [
    Permission.read(Role.user(input.userId)),
    Permission.update(Role.user(input.userId)),
    Permission.delete(Role.user(input.userId)),
  ];
  try {
    const doc = await databases.createDocument(
      appwriteConfig.databaseId,
      c.memberVerifications,
      input.userId,
      payload,
      perms,
    );
    return toMemberVerification(doc);
  } catch {
    // Row exists — update it (reset to pending with the new selfie).
    const doc = await databases.updateDocument(
      appwriteConfig.databaseId,
      c.memberVerifications,
      input.userId,
      payload,
    );
    return toMemberVerification(doc);
  }
}

/** Host files a guest-no-show report with a GPS-stamped photo. */
export async function createNoShowReport(input: {
  bookingId: string;
  tripId: string;
  hostId: string;
  travelerId?: string;
  photoFileId: string;
  lat?: number | null;
  lng?: number | null;
  passengerName?: string;
}): Promise<void> {
  const c = ids();
  await databases.createDocument(
    appwriteConfig.databaseId,
    c.noShowReports,
    ID.unique(),
    {
      booking_id: input.bookingId,
      trip_id: input.tripId,
      host_id: input.hostId,
      traveler_id: input.travelerId ?? null,
      photo_file_id: input.photoFileId,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      captured_at: new Date().toISOString(),
      status: "open",
      passenger_name: input.passengerName ?? null,
    },
    [Permission.read(Role.user(input.hostId)), Permission.update(Role.user(input.hostId))],
  );
}

/** No-show reports the host has already filed for a trip (to hide the button). */
export async function listNoShowReportsByTrip(tripId: string): Promise<
  { bookingId: string; status: string }[]
> {
  const c = ids();
  const res = await databases.listDocuments(appwriteConfig.databaseId, c.noShowReports, [
    Query.equal("trip_id", tripId),
    Query.limit(100),
  ]);
  return res.documents.map((d: any) => ({ bookingId: String(d.booking_id || ""), status: String(d.status || "open") }));
}
