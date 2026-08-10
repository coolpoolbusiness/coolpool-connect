import "antd/dist/reset.css";
import "../../antd-reset-overrides.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  LayoutDashboard,
  PlusCircle,
  Route as RouteIcon,
  Sparkles,
  LogOut,
  User,
  History,
  Settings,
  MoreVertical,
  Car,
  Camera,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Banknote,
  Users2,
  Plus,
  Trash2,
  Pencil,
  Star,
  UserCheck,
  ArrowRight,
  Cigarette,
  PawPrint,
  Wine,
  Music2,
  Headphones,
  VolumeX,
  TriangleAlert,
  Navigation,
  PlayCircle,
  FlagTriangleRight,
  RadioTower,
  Wallet,
  Phone,
  MessageCircle,
  UserX,
  Share2,
  Award,
  FileText,
  ShieldCheck,
  Check,
} from "lucide-react";
import {
  Layout,
  Menu,
  Button,
  Card,
  Typography,
  Space,
  Avatar,
  Badge,
  Form,
  Input,
  DatePicker,
  InputNumber,
  ConfigProvider,
  theme,
  List,
  Tag,
  Upload,
  Dropdown,
  Spin,
  AutoComplete,
  message,
  Drawer,
  Switch,
  Divider,
  Modal,
  Popconfirm,
  Select,
  Table,
  Segmented,
} from "antd";
import type { UploadFile, UploadProps } from "antd";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  createTrip,
  listHostTrips,
  setVehicleActive,
  setDriverActive,
  setTripActive,
  listVehiclesByDriverUserId,
  createDriverVehicle,
  deleteDriverVehicle,
  upsertDriverVehicle,
  listTeamDrivers,
  createTeamDriver,
  updateTeamDriver,
  deleteTeamDriver,
  updateBookingRating,
  updateTrip,
  updateTripLocation,
  deleteTrip,
  deleteTripStop,
  listTripStops,
  createTripStop,
  upsertDriverProfile,
  assignRole,
  listHostBookings,
  verifyBookingOtp,
  updateBookingStatus,
  getHostPreferences,
  updateHostPreferences,
  updateDriverBio,
  updateDriverPhoto,
  getExistingReview,
  listReviewsForUser,
  type CreateTeamDriverInput,
} from "@/data/appwrite-repository";
import { PayoutsPanel } from "@/components/driver/PayoutsPanel";
import type { RidePreferences } from "@/lib/domain";
import { storage } from "@/integrations/appwrite/client";
import { ID, Permission, Role } from "appwrite";
import type { Trip, TripStop, DriverProfile, Booking, BookingStatus, Review } from "@/lib/domain";
import { shareTrip, getTripShareUrl } from "@/lib/share-trip";
import { APP_FONT_FAMILY } from "@/lib/fonts";
import { calcPricePerKm, hostNetEarnings } from "@/lib/pricing";
import { stripCountrySuffix, haversineKm, bearingDegrees } from "@/lib/geo";
import { findDuplicateVehicle } from "@/lib/duplicateChecks";
import { mintTripCode } from "@/integrations/appwrite/trip-server";
import { formatVehicleCode } from "@/lib/vehicleCode";
import { compressImage } from "@/lib/image-compression";
import { RoleSwitch } from "@/components/RoleSwitch";
import { StreetView360 } from "@/components/StreetView360";
import { getHostTier } from "@/lib/host-tier";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appwriteConfig, getUserAvatarUrl } from "@/integrations/appwrite/client";
import { SERVICE_CITY, BENGALURU_AIRPORTS, SOUTH_INDIA_CITY_SUGGESTIONS } from "@/lib/config";
import { SeatPicker, type SeatId } from "@/components/SeatPicker";
import { defaultOfferedSeatCodes } from "@/lib/seatLayout";
import { ReviewModal } from "@/components/ReviewModal";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { getUserDisplayName } from "@/lib/user-display";
import { getBookingPassengers } from "@/lib/booking-passengers";
import {
  passengerGenderLabel,
  passengerGenderTone,
  passengerSeatLabel,
} from "@/lib/passenger-display";
import { TripWizard } from "@/components/trip-wizard/TripWizard";
import type { WizardResult } from "@/components/trip-wizard/types";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import { RidePrefChips } from "@/components/RidePrefChips";
import { showAppNotification } from "@/lib/notifications";

import logo from "@/assets/logo.png";

dayjs.extend(relativeTime);

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

interface CityOption {
  value: string;
  label: any;
  lat: number;
  lng: number;
  placeId?: string;
}

interface TripFormValues {
  fromLocation: string;
  toLocation: string;
  intermediateStops?: string[];
  departureAt: dayjs.Dayjs;
  totalSeats: number;
  totalTripPrice: number;
  vehicleId: string;
  driverId: string;
  seatConfig: SeatId[];
}

interface PlacePrediction {
  description: string;
  place_id: string;
}

interface GeocoderAddressResult {
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
}

interface DirectionsRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints?: { location: { lat: number; lng: number }; stopover: boolean }[];
  travelMode: string;
}

interface DirectionsResult {
  routes: {
    overview_polyline: string;
    legs: {
      distance: { value: number; text: string };
      duration: { value: number; text: string };
    }[];
  }[];
}

interface DirectionsServiceLike {
  route: (
    request: DirectionsRequest,
    callback: (result: DirectionsResult | null, status: string) => void,
  ) => void;
}

interface SegmentPricePreview {
  from: string;
  to: string;
  distanceKm: number;
  pricePerSeat: number;
}

interface PlacesAutocompleteServiceLike {
  getPlacePredictions: (
    request: { input: string; types?: string[] },
    callback: (predictions: PlacePrediction[] | null, status: string) => void,
  ) => void;
}

interface GeocoderLike {
  geocode: (
    request: { placeId: string },
    callback: (results: GeocoderAddressResult[] | null, status: string) => void,
  ) => void;
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

const DASHBOARD_MODULES = [
  "dashboard",
  "trips",
  "history",
  "drivers",
  "settings",
  "customers",
  "onboarding",
  "payouts",
] as const;
type DashboardModule = (typeof DASHBOARD_MODULES)[number];

function normalizeModule(value: unknown): DashboardModule {
  return (DASHBOARD_MODULES as readonly string[]).includes(String(value))
    ? (value as DashboardModule)
    : "dashboard";
}

// Trips can only be scheduled within 7 days from today.
const TRIP_DATE_WINDOW_DAYS = 7;

// Single source of truth for how a host's trip status is shown — used by the
// ledger row and the detail drawer so the same trip never reads differently in
// two places (e.g. "Expired" in the list but "Scheduled" in the popup).
function hostTripStatusDisplay(trip: Trip, expired: boolean): { label: string; color: string } {
  if (trip.status === "completed") return { label: "Completed", color: "success" };
  if (trip.status === "cancelled") return { label: "Cancelled", color: "error" };
  if (trip.status === "expired" || expired) return { label: "Expired", color: "default" };
  if (trip.status === "in_progress") return { label: "In progress", color: "processing" };
  return { label: "Scheduled", color: "processing" };
}

// Start-trip button timing. Phase 2: the button is VISIBLE early (with a live
// countdown) but only CLICKABLE from 5 minutes before departure until 45
// minutes after. `show:false` hides it entirely (non-scheduled or window fully
// past).
const START_OPENS_MIN = 5;
const START_CLOSES_MIN = 45;
function startTripState(
  trip: Trip,
  now: dayjs.Dayjs,
): { show: boolean; enabled: boolean; label: string } {
  if (trip.status !== "scheduled") return { show: false, enabled: false, label: "" };
  const dep = dayjs(trip.departureAt);
  const opens = dep.subtract(START_OPENS_MIN, "minute");
  const closes = dep.add(START_CLOSES_MIN, "minute");
  if (now.isAfter(closes)) return { show: false, enabled: false, label: "" };
  if (now.isBefore(opens)) {
    const mins = opens.diff(now, "minute");
    const label =
      mins >= 60
        ? `Starts in ${Math.floor(mins / 60)}h ${mins % 60}m`
        : mins >= 1
          ? `Starts in ${mins}m`
          : "Starts in <1m";
    return { show: true, enabled: false, label };
  }
  return { show: true, enabled: true, label: "Start" };
}

function disabledTripDate(current: dayjs.Dayjs): boolean {
  if (!current) return false;
  const today = dayjs().startOf("day");
  const limit = dayjs().add(TRIP_DATE_WINDOW_DAYS, "day").startOf("day");
  return current.isBefore(today) || !current.isBefore(limit);
}

// When the selected day is today, forbid any hour/minute that is already in the
// past so a host can never publish a trip with a departure time before now.
function disabledTripTime(current: dayjs.Dayjs | null) {
  const now = dayjs();
  if (!current || !current.isSame(now, "day")) return {};
  const currentHour = now.hour();
  const currentMinute = now.minute();
  return {
    disabledHours: () => Array.from({ length: currentHour }, (_, i) => i),
    disabledMinutes: (selectedHour: number) => {
      if (selectedHour < currentHour) return Array.from({ length: 60 }, (_, i) => i);
      if (selectedHour === currentHour)
        return Array.from({ length: 60 }, (_, i) => i).filter((m) => m <= currentMinute);
      return [];
    },
  };
}

/** Builds tel: and wa.me links from a (possibly pipe-separated, multi-passenger) phone string. */
function getContactLinks(rawPhone: string): { tel: string | null; whatsapp: string | null } {
  const phone = (rawPhone || "").split("|")[0].trim();
  const digits = phone.replace(/\D/g, "");
  if (!digits) return { tel: null, whatsapp: null };
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return {
    tel: `tel:+${intl}`,
    whatsapp: `https://wa.me/${intl}`,
  };
}

function managingStopsByIndexForDetail(stops: TripStop[], stopIndex: number): string | null {
  return stops.find((stop) => stop.stopIndex === stopIndex)?.location ?? null;
}

function TravelerStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-r border-gray-100 px-2 py-3 text-center last:border-r-0">
      <p className="text-base font-black text-gray-800">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  );
}

function getRatingColorClasses(rating: number) {
  if (rating >= 4) {
    return {
      accent: "bg-green-500/10 group-hover:bg-green-500/20",
      icon: "bg-green-100 text-green-600",
      score: "text-green-600",
      star: "fill-green-500 text-green-500",
    };
  }
  if (rating >= 2.5) {
    return {
      accent: "bg-yellow-500/10 group-hover:bg-yellow-500/20",
      icon: "bg-yellow-100 text-yellow-600",
      score: "text-yellow-600",
      star: "fill-yellow-400 text-yellow-400",
    };
  }
  if (rating >= 1.5) {
    return {
      accent: "bg-orange-500/10 group-hover:bg-orange-500/20",
      icon: "bg-orange-100 text-orange-600",
      score: "text-orange-600",
      star: "fill-orange-500 text-orange-500",
    };
  }
  return {
    accent: "bg-red-500/10 group-hover:bg-red-500/20",
    icon: "bg-red-100 text-red-600",
    score: "text-red-600",
    star: "fill-red-500 text-red-500",
  };
}

export const Route = createFileRoute("/driver/dashboard")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { module: DashboardModule; trip?: string } => ({
    module: normalizeModule(search.module),
    trip: typeof search.trip === "string" ? search.trip : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Ride Host dashboard â€” Coolpool" },
      { name: "description", content: "Manage your rides and bookings as a Coolpool ride host." },
    ],
  }),
  component: DriverDashboardPage,
});

function DriverDashboardPage() {
  const { isDriver, user, signOut, loading, refreshRoles, roles, deleteAccount } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [activeModule, setActiveModule] = useState<DashboardModule>(search.module);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [fromOptions, setFromOptions] = useState<CityOption[]>([]);
  const [toOptions, setToOptions] = useState<CityOption[]>([]);
  const [selectedFrom, setSelectedFrom] = useState<CityOption | null>(null);
  const [selectedTo, setSelectedTo] = useState<CityOption | null>(null);
  const [intermediateOptions, setIntermediateOptions] = useState<Record<number, CityOption[]>>({});
  const [selectedIntermediateStops, setSelectedIntermediateStops] = useState<
    Record<number, CityOption>
  >({});
  const [segmentPricePreview, setSegmentPricePreview] = useState<SegmentPricePreview[]>([]);
  const [pendingTripPayload, setPendingTripPayload] = useState<any | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardResult, setWizardResult] = useState<WizardResult | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [vehicleForm] = Form.useForm();
  const [driverForm] = Form.useForm();
  const [historyFilter, setHistoryFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [vehicleDrawerOpen, setVehicleDrawerOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [driverDrawerOpen, setDriverDrawerOpen] = useState(false);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [managingTripId, setManagingTripId] = useState<string | null>(null);
  const [isEditingTrip, setIsEditingTrip] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [travelerDetailBooking, setTravelerDetailBooking] = useState<Booking | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [publishTripsModalOpen, setPublishTripsModalOpen] = useState(false);
  const [publishModalView, setPublishModalView] = useState<"trips" | "form">("trips");
  const [showTripForm, setShowTripForm] = useState(false);
  const [tripPublishedSuccess, setTripPublishedSuccess] = useState(false);
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountDeletedSuccess, setAccountDeletedSuccess] = useState(false);
  const [prefsDrawerOpen, setPrefsDrawerOpen] = useState(false);
  const [historyDetailTripId, setHistoryDetailTripId] = useState<string | null>(null);
  const [historyDetailPassenger, setHistoryDetailPassenger] = useState<Booking | null>(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [bioEditing, setBioEditing] = useState(false);
  const [bioText, setBioText] = useState("");
  const [prefsLocal, setPrefsLocal] = useState<RidePreferences>({
    smokingAllowed: false,
    alcoholAllowed: false,
    musicAllowed: false,
    musicType: null,
    musicOnly: false,
    petsAllowed: false,
  });
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [noShowId, setNoShowId] = useState<string | null>(null);
  const [liveTripId, setLiveTripId] = useState<string | null>(null);
  const [tripActionLoading, setTripActionLoading] = useState<string | null>(null);
  const [now, setNow] = useState(() => dayjs());
  const locationWatchIdRef = useRef<number | null>(null);
  const autoExpiredRef = useRef<Set<string>>(new Set());
  const performanceRating = 5;
  const performanceRatingColors = getRatingColorClasses(performanceRating);

  // Tick the clock every 30s so the "Start Trip" button can appear automatically
  // once the trip's departure window opens, without requiring a page refresh.
  useEffect(() => {
    const interval = setInterval(() => setNow(dayjs()), 30000);
    return () => clearInterval(interval);
  }, []);


  // Stop sharing location whenever the dashboard unmounts (e.g. driver navigates away).
  useEffect(() => {
    return () => {
      if (locationWatchIdRef.current != null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
      }
    };
  }, []);

  const handleStartTrip = (tripId: string) => {
    // Enforce the start window even if the button is somehow clicked early.
    const startTrip = trips.find((t) => t.id === tripId);
    if (startTrip && !startTripState(startTrip, dayjs()).enabled) {
      const opens = dayjs(startTrip.departureAt).subtract(START_OPENS_MIN, "minute");
      message.info(`You can start this trip from ${opens.format("h:mm A")} (5 min before departure).`);
      return;
    }
    if (!navigator.geolocation) {
      message.error("Geolocation isn't supported on this device.");
      return;
    }
    setTripActionLoading(tripId);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await updateTrip(tripId, { status: "in_progress" });
          await updateTripLocation(tripId, pos.coords.latitude, pos.coords.longitude);
          if (locationWatchIdRef.current != null) {
            navigator.geolocation.clearWatch(locationWatchIdRef.current);
          }
          // Heading rotates the live car icon on riders' maps. GPS heading is
          // null/NaN when stationary or unsupported — fall back to the bearing
          // between fixes once we've moved far enough for it to mean anything.
          let lastFix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          locationWatchIdRef.current = navigator.geolocation.watchPosition(
            (p) => {
              const cur = { lat: p.coords.latitude, lng: p.coords.longitude };
              let heading = Number.isFinite(p.coords.heading as number)
                ? (p.coords.heading as number)
                : undefined;
              if (heading == null && haversineKm(lastFix, cur) * 1000 > 15) {
                heading = bearingDegrees(lastFix, cur);
              }
              lastFix = cur;
              void updateTripLocation(tripId, cur.lat, cur.lng, heading);
            },
            (err) => console.error("Location watch error", err),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
          );
          setLiveTripId(tripId);
          void queryClient.invalidateQueries({ queryKey: ["host-trips"] });
          message.success("Trip started — your live location is now visible to passengers.");
        } catch (err) {
          message.error(err instanceof Error ? err.message : "Failed to start trip.");
        } finally {
          setTripActionLoading(null);
        }
      },
      () => {
        message.error("Location permission denied. Enable GPS to start the trip.");
        setTripActionLoading(null);
      },
      { enableHighAccuracy: true },
    );
  };

  const handleEndTrip = async (tripId: string) => {
    if (locationWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
    setLiveTripId((cur) => (cur === tripId ? null : cur));
    setTripActionLoading(tripId);
    try {
      await updateTrip(tripId, { status: "completed" });
      void queryClient.invalidateQueries({ queryKey: ["host-trips"] });
      message.success("Trip marked as completed.");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to complete trip.");
    } finally {
      setTripActionLoading(null);
    }
  };

  const toggleVehicleActive = async (id: string, active: boolean) => {
    try {
      await setVehicleActive(id, active);
      await queryClient.invalidateQueries({ queryKey: ["driver-vehicles", user?.$id] });
    } catch {
      message.error("Couldn't update vehicle status.");
    }
  };

  const toggleDriverActive = async (id: string, active: boolean) => {
    try {
      await setDriverActive(id, active);
      await queryClient.invalidateQueries({ queryKey: ["team-drivers"] });
    } catch {
      message.error("Couldn't update driver status.");
    }
  };

  const toggleTripActive = async (id: string, active: boolean) => {
    try {
      await setTripActive(id, active);
      await queryClient.invalidateQueries({ queryKey: ["host-trips"] });
    } catch {
      message.error("Couldn't update trip status.");
    }
  };

  const handleVerifyOtp = async (bookingId: string) => {
    const code = (otpInputs[bookingId] || "").trim();
    if (!/^\d{4}$/.test(code)) {
      message.error("Enter the 4-digit OTP.");
      return;
    }
    setVerifyingId(bookingId);
    try {
      await verifyBookingOtp(bookingId, code);
      message.success("Customer verified.");
      setOtpInputs((prev) => ({ ...prev, [bookingId]: "" }));
      void queryClient.invalidateQueries({ queryKey: ["host-bookings"] });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSetBookingStatus = async (bookingId: string, status: BookingStatus) => {
    setNoShowId(bookingId);
    try {
      await updateBookingStatus(bookingId, status);
      message.success(
        status === "no_show" ? "Passenger marked as no-show." : "Booking status updated.",
      );
      void queryClient.invalidateQueries({ queryKey: ["host-bookings"] });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update booking.");
    } finally {
      setNoShowId(null);
    }
  };

  const confirmMarkNoShow = (bookingId: string, passengerName: string) => {
    Modal.confirm({
      title: "Mark as no-show?",
      content: `Confirm that ${passengerName || "this passenger"} did not show up for this trip. This cannot be verified with an OTP afterwards.`,
      okText: "Mark no-show",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => handleSetBookingStatus(bookingId, "no_show"),
    });
  };
  const publishViaWizard = (result: WizardResult) => {
    if (!user?.$id) {
      message.error("You need to be signed in.");
      return;
    }
    const totalPrice = result.pricePerSeat * result.totalSeats;
    const wizardVehicle = vehicles.find((vehicle) => vehicle.id === result.vehicleId);
    // Build trip_stops the way the legacy handler does: origin (pickup),
    // intermediates (both), destination (drop). distanceFromOriginKm comes
    // from the wizard's polyline projection.
    // Sort intermediates by distance from origin — StepReview keys segmentPrices
    // over this exact ordering, so stop_index and the price-matrix keys line up.
    const orderedStops = result.stops
      .slice()
      .sort((a, b) => a.distanceFromOriginKm - b.distanceFromOriginKm);
    const allStops = [
      {
        stopIndex: 0,
        location: result.from.label,
        lat: result.from.lat,
        lng: result.from.lng,
        stopType: "pickup" as const,
        distanceFromOriginKm: 0,
        priceFromOrigin: 0,
      },
      ...orderedStops.map((s, i) => ({
        stopIndex: i + 1,
        location: s.label,
        lat: s.lat,
        lng: s.lng,
        stopType: s.stopType,
        distanceFromOriginKm: Math.round(s.distanceFromOriginKm * 10) / 10,
        priceFromOrigin: result.segmentPrices[`0-${i + 1}`] ?? 0,
      })),
      {
        stopIndex: orderedStops.length + 1,
        location: result.to.label,
        lat: result.to.lat,
        lng: result.to.lng,
        stopType: "drop" as const,
        distanceFromOriginKm: Math.round(result.totalDistanceKm * 10) / 10,
        priceFromOrigin:
          result.segmentPrices[`0-${orderedStops.length + 1}`] ?? result.pricePerSeat,
      },
    ];
    const payload = {
      tripData: {
        hostId: user.$id,
        fromLocation: result.from.label,
        fromLat: result.from.lat,
        fromLng: result.from.lng,
        toLocation: result.to.label,
        toLat: result.to.lat,
        toLng: result.to.lng,
        polyline: result.polyline,
        totalDistanceKm: Math.max(0.1, Math.round(result.totalDistanceKm * 10) / 10),
        totalPrice,
        pricePerKm: calcPricePerKm(totalPrice, result.totalDistanceKm),
        totalSeats: result.totalSeats,
        departureAt: result.departureAt,
        arrivalAt: dayjs(result.departureAt).add(result.durationMin, "minute").toISOString(),
        durationMinutes: result.durationMin,
        hostDisplayName: user.name || "Verified Host",
        hostRating: 0,
        hostRatingCount: 0,
        vehicleModel: wizardVehicle?.modelName,
        vehicleColor: wizardVehicle?.color || undefined,
        notes: `Created via routing wizard. Total price: ₹${totalPrice}.`,
        vehicleId: result.vehicleId,
        assignedDriverId: result.driverId,
        seatConfig: result.seatConfig,
        // Persist the host's full per-segment price table. The per-stop
        // priceFromOrigin above can only express prices that add up along the
        // route — a flat "every segment ₹2" collapses to ₹0 without this.
        segmentPrices: result.segmentPrices,
      },
      stopsData: allStops,
    };
    setWizardResult(result);
    performCreateTrip(payload);
  };

  // Hosting requires notifications (so we can remind the host to start the
  // trip on time). Browsers that can't do web push at all (e.g. iPhone Safari
  // before the site is added to the Home Screen) are let through with the
  // softer in-page prompt instead of being locked out.
  const openWizard = () => {
    // Notifications are optional — hosting is never blocked on them. Users who
    // haven't decided yet are nudged by the in-page NotificationPermissionPrompt
    // banner (which shows a real Allow prompt only when the browser can prompt).
    setWizardResult(null);
    setWizardOpen(true);
  };

  const handleShareTrip = async (
    trip: Pick<Trip, "id" | "fromLocation" | "toLocation"> & { tripCode?: string | null },
  ) => {
    const result = await shareTrip(trip);
    if (result === "copied") {
      message.success("Trip link copied to clipboard!");
    } else if (result === "failed") {
      // Clipboard/share blocked (e.g. inside an iframe) — show the link to copy manually.
      message.info({
        content: `Copy this link to share: ${getTripShareUrl(trip.tripCode ?? trip.id)}`,
        duration: 8,
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.$id) return;
    setDeletingAccount(true);
    try {
      // Truly deletes the login account (server-side, admin) and archives the
      // record; the account's data is kept for admins, trips paused.
      await deleteAccount();
      setDeleteAccountModalOpen(false);
      setAccountDeletedSuccess(true);
      // Show the success animation for ~2.2s, then bounce home (session is gone).
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.assign("/");
      }, 2200);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete account.");
      setDeletingAccount(false);
    }
  };

  const autocompleteServiceRef = useRef<PlacesAutocompleteServiceLike | null>(null);
  const geocoderRef = useRef<GeocoderLike | null>(null);
  const directionsServiceRef = useRef<DirectionsServiceLike | null>(null);
  const seatsWatch = Form.useWatch("totalSeats", form);
  const totalPriceWatch = Form.useWatch("totalTripPrice", form);
  const formVehicleIdWatch = Form.useWatch("vehicleId", form);
  // Persist the active module in the URL so a page refresh restores it.
  useEffect(() => {
    if (search.module !== activeModule) {
      void navigate({
        search: (prev) => ({ ...prev, module: activeModule }),
        replace: true,
      });
    }
  }, [activeModule, search.module, navigate]);

  // Reflect URL changes (back/forward, direct link) back into state.
  useEffect(() => {
    if (search.module !== activeModule) {
      setActiveModule(search.module);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.module]);

  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [regFileList, setRegFileList] = useState<UploadFile[]>([]);
  const [insFileList, setInsFileList] = useState<UploadFile[]>([]);
  const [carImagesList, setCarImagesList] = useState<UploadFile[]>([]);
  const [idFrontFileList, setIdFrontFileList] = useState<UploadFile[]>([]);
  const [idBackFileList, setIdBackFileList] = useState<UploadFile[]>([]);
  const [selfieFileList, setSelfieFileList] = useState<UploadFile[]>([]);

  const initGoogleServices = () => {
    const w = window as Window & {
      google?: {
        maps?: {
          places?: { AutocompleteService: new () => PlacesAutocompleteServiceLike };
          Geocoder?: new () => GeocoderLike;
          DirectionsService?: new () => DirectionsServiceLike;
        };
      };
    };
    const maps = w.google?.maps;
    if (!maps?.places?.AutocompleteService || !maps?.Geocoder || !maps?.DirectionsService)
      return false;
    autocompleteServiceRef.current = new maps.places.AutocompleteService();
    geocoderRef.current = new maps.Geocoder();
    directionsServiceRef.current = new maps.DirectionsService();
    setMapsReady(true);
    return true;
  };

  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ["host-trips", user?.$id],
    queryFn: () => (user ? listHostTrips(user.$id) : Promise.resolve([])),
    enabled: !!user,
  });

  // Auto-expire scheduled trips that are 45+ minutes past departure and haven't started.
  // Writes "expired" to Appwrite once per trip so the status persists across sessions.
  // Must be placed after the `trips` declaration to avoid a TDZ on the const binding.
  useEffect(() => {
    for (const trip of trips) {
      if (trip.status !== "scheduled") continue;
      if (!now.isAfter(dayjs(trip.departureAt).add(45, "minute"))) continue;
      if (autoExpiredRef.current.has(trip.id)) continue;
      autoExpiredRef.current.add(trip.id);
      void updateTrip(trip.id, { status: "expired" })
        .then(() => queryClient.invalidateQueries({ queryKey: ["host-trips"] }))
        .catch(() => {});
    }
  }, [trips, now, queryClient]);

  // Auto-open trip panel when navigated from a notification (?trip=<id>).
  useEffect(() => {
    if (search.trip && trips.length > 0 && !managingTripId) {
      setManagingTripId(search.trip);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.trip, trips.length]);

  // Ride preferences
  const { data: savedPrefs } = useQuery({
    queryKey: ["host-preferences", user?.$id],
    queryFn: () => (user ? getHostPreferences(user.$id) : Promise.resolve(null)),
    enabled: !!user,
  });

  // Bio — fetched from the driver profile
  const { data: driverProfile } = useQuery({
    queryKey: ["driver-profile", user?.$id],
    queryFn: async () => {
      if (!user) return null;
      const { listDriverProfilesByUserIds } = await import("@/data/appwrite-repository");
      const profiles = await listDriverProfilesByUserIds([user.$id]);
      return profiles[0] ?? null;
    },
    enabled: !!user,
  });

  const { mutate: saveBio, isPending: savingBio } = useMutation({
    mutationFn: (bio: string) => {
      if (!user) throw new Error("Not logged in");
      return updateDriverBio(user.$id, bio);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["driver-profile", user?.$id] });
      setBioEditing(false);
      void import("sonner").then((m) => m.toast.success("Bio saved!"));
    },
    onError: () => void import("sonner").then((m) => m.toast.error("Failed to save bio.")),
  });

  // Profile photo — uploaded to storage, URL saved on the driver profile.
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const { mutate: savePhoto, isPending: savingPhoto } = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Not logged in");
      if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5 MB.");
      const compressed = await compressImage(file);
      const uploaded = await storage.createFile(
        appwriteConfig.driverDocsBucketId,
        ID.unique(),
        compressed,
        // Profile photos are shown on public pages (ride details, result cards).
        [
          Permission.read(Role.any()),
          Permission.delete(Role.user(user.$id)),
          Permission.update(Role.user(user.$id)),
        ],
      );
      const url = `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.driverDocsBucketId}/files/${uploaded.$id}/view?project=${appwriteConfig.projectId}`;
      await updateDriverPhoto(user.$id, url);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["driver-profile", user?.$id] });
      message.success("Profile photo updated.");
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : "Failed to upload photo.");
    },
  });

  const { mutate: savePrefs, isPending: savingPrefs } = useMutation({
    mutationFn: (prefs: RidePreferences) => {
      if (!user) throw new Error("Not logged in");
      return updateHostPreferences(user.$id, prefs);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["host-preferences", user?.$id] });
      setPrefsDrawerOpen(false);
      void import("sonner").then((m) => m.toast.success("Ride preferences saved!"));
    },
    onError: () => {
      void import("sonner").then((m) => m.toast.error("Failed to save preferences."));
    },
  });

  // Fleet: all vehicles for this user
  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ["driver-vehicles", user?.$id],
    queryFn: () => (user ? listVehiclesByDriverUserId(user.$id) : Promise.resolve([])),
    enabled: !!user,
  });

  // Phone-only accounts get a synthetic @phone.coolpool.in address — that
  // doesn't count as a real email, so onboarding still asks for one.
  const hasRealEmail = !!user?.email && !user.email.endsWith("@phone.coolpool.in");

  const formSeatCapacity: 5 | 7 =
    vehicles.find((v) => v.id === formVehicleIdWatch)?.seatCapacity === 7 ? 7 : 5;

  const { mutate: saveVehicle, isPending: savingVehicle } = useMutation({
    mutationFn: async (vals: {
      make: string;
      model: string;
      color: string;
      plate: string;
      seats: number;
    }) => {
      if (!user) throw new Error("Not logged in");

      const duplicate = findDuplicateVehicle(
        { plateNumber: String(vals.plate ?? "").toUpperCase() },
        vehicles.map((v) => ({ id: v.id, plateNumber: v.plateNumber })),
        editingVehicleId,
      );
      if (duplicate) {
        throw new Error("A vehicle with this plate number already exists in your fleet.");
      }

      const carImageIds: string[] = [];
      for (const file of carImagesList) {
        if (file.originFileObj) {
          const compressed = await compressImage(file.originFileObj as File);
          const uploaded = await storage.createFile(
            appwriteConfig.driverDocsBucketId,
            ID.unique(),
            compressed,
            // Car photos are shown on the public ride page — make them readable.
            [
              Permission.read(Role.any()),
              Permission.delete(Role.user(user.$id)),
              Permission.update(Role.user(user.$id)),
            ],
          );
          carImageIds.push(uploaded.$id);
        } else if (file.url) {
          const parts = file.url.split("/");
          const id = parts[parts.indexOf("files") + 1];
          if (id) carImageIds.push(id);
        }
      }

      // Registration & insurance are optional — a failed upload must never
      // block adding the vehicle, so each is best-effort.
      let regDocId: string | undefined;
      let insDocId: string | undefined;
      const privateDocPerms = [
        Permission.read(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id)),
      ];
      if (regFileList[0]?.originFileObj) {
        try {
          const up = await storage.createFile(
            appwriteConfig.driverDocsBucketId,
            ID.unique(),
            await compressImage(regFileList[0].originFileObj as File),
            privateDocPerms,
          );
          regDocId = up.$id;
        } catch {
          message.warning("Registration document upload failed — you can add it later.");
        }
      }
      if (insFileList[0]?.originFileObj) {
        try {
          const up = await storage.createFile(
            appwriteConfig.driverDocsBucketId,
            ID.unique(),
            await compressImage(insFileList[0].originFileObj as File),
            privateDocPerms,
          );
          insDocId = up.$id;
        } catch {
          message.warning("Insurance document upload failed — you can add it later.");
        }
      }

      const payload = {
        driverUserId: user.$id,
        modelName: `${vals.make} ${vals.model}`.trim(),
        plateNumber: String(vals.plate ?? "").toUpperCase(),
        seatCapacity: Number(vals.seats) === 7 ? 7 : 5,
        color: vals.color,
        carImages: carImageIds,
        ...(regDocId ? { registrationDoc: regDocId } : {}),
        ...(insDocId ? { insuranceDoc: insDocId } : {}),
      };

      if (editingVehicleId) {
        return upsertDriverVehicle(payload);
      } else {
        return createDriverVehicle(payload);
      }
    },
    onSuccess: () => {
      message.success(editingVehicleId ? "Vehicle updated!" : "Vehicle added!");
      void queryClient.invalidateQueries({ queryKey: ["driver-vehicles"] });
      setVehicleDrawerOpen(false);
      vehicleForm.resetFields();
      setCarImagesList([]);
      setRegFileList([]);
      setInsFileList([]);
      setEditingVehicleId(null);
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to save vehicle.";
      if (msg.includes("already exists")) {
        Modal.error({ title: "Duplicate vehicle details", content: msg, centered: true });
      } else {
        message.error(msg);
      }
    },
  });

  const { mutate: removeVehicle } = useMutation({
    mutationFn: (id: string) => deleteDriverVehicle(id),
    onSuccess: () => {
      message.success("Vehicle removed.");
      void queryClient.invalidateQueries({ queryKey: ["driver-vehicles"] });
    },
    onError: () => message.error("Failed to remove vehicle."),
  });

  // Team drivers
  const { data: teamDrivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ["team-drivers", user?.$id],
    queryFn: () => (user ? listTeamDrivers(user.$id) : Promise.resolve([])),
    enabled: !!user,
  });

  // Driver options for the wizard: host (self) + any team drivers.
  const wizardDriverOptions = useMemo(
    () => [
      ...(user
        ? [
            {
              id: user.$id,
              fullName: getUserDisplayName(user) || "You",
              phone: (user as any).phone || undefined,
              isYou: true,
            },
          ]
        : []),
      ...teamDrivers.map((d) => ({
        id: d.userId || d.id,
        fullName: d.fullName,
        phone: d.phone,
      })),
    ],
    [teamDrivers, user],
  );

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["host-bookings", user?.$id],
    queryFn: () => (user ? listHostBookings(user.$id) : Promise.resolve([])),
    enabled: !!user,
    refetchInterval: user ? 20000 : false,
  });

  const completedTripIds = useMemo(
    () => new Set(trips.filter((trip) => trip.status === "completed").map((trip) => trip.id)),
    [trips],
  );
  const reviewEligibleBookingIds = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            completedTripIds.has(booking.tripId) &&
            booking.status !== "no_show" &&
            booking.status !== "cancelled",
        )
        .map((booking) => booking.id),
    [bookings, completedTripIds],
  );
  const { data: existingHostReviewMap = {}, isLoading: existingHostReviewsLoading } = useQuery({
    queryKey: ["existing-reviews-host", reviewEligibleBookingIds.join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        reviewEligibleBookingIds.map(async (bookingId) => {
          const review = await getExistingReview(bookingId, "host_to_guest");
          return [bookingId, !!review] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    enabled: reviewEligibleBookingIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });
  const travelerIds = useMemo(
    () => [...new Set(bookings.map((booking) => booking.travelerId).filter(Boolean))],
    [bookings],
  );
  const { data: travelerReviews = [], isLoading: travelerReviewsLoading } = useQuery({
    queryKey: ["host-reviews-for-travelers", travelerIds.join(",")],
    queryFn: async () => {
      const reviews = await Promise.all(
        travelerIds.map((travelerId) => listReviewsForUser(travelerId)),
      );
      return reviews.flat().filter((review) => review.direction === "host_to_guest");
    },
    enabled: travelerIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });
  const travelerReviewsByUser = useMemo(() => {
    return travelerReviews.reduce<Record<string, Review[]>>((byUser, review) => {
      (byUser[review.toUserId] ??= []).push(review);
      return byUser;
    }, {});
  }, [travelerReviews]);

  // Notify the host when a new booking comes in.
  //
  // Seen booking IDs are persisted in localStorage so notifications never
  // re-fire across page reloads or dashboard remounts (the previous in-memory
  // ref reset every mount, which re-notified every existing booking — the host
  // was getting the same "New booking" alert many times). A recency guard is a
  // second safety net: only bookings created in the last few minutes ever fire.
  const seenBookingIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (bookingsLoading || !user) return;
    const storageKey = `coolpool:seenBookings:${user.$id}`;

    const persist = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...seenBookingIdsRef.current!]));
      } catch {
        // Storage unavailable — in-memory dedup still works for this session.
      }
    };

    // First run: seed from storage + all current bookings, so nothing already
    // on screen is treated as "new". No notifications fire on this pass.
    if (seenBookingIdsRef.current === null) {
      let persisted: string[] = [];
      try {
        persisted = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch {
        persisted = [];
      }
      seenBookingIdsRef.current = new Set([...persisted, ...bookings.map((b) => b.id)]);
      persist();
      return;
    }

    const FRESH_WINDOW_MS = 10 * 60 * 1000;
    const now = Date.now();
    const newBookings = bookings.filter(
      (b) =>
        !seenBookingIdsRef.current!.has(b.id) &&
        now - new Date(b.createdAt).getTime() < FRESH_WINDOW_MS,
    );
    newBookings.forEach((b) => {
      void showAppNotification("New booking received!", {
        body: `${b.seatsBooked} seat${b.seatsBooked === 1 ? "" : "s"} booked for your trip.`,
        url: `/driver/dashboard?module=trips&trip=${b.tripId}`,
        tag: `new-booking-${b.id}`,
      });
    });

    // Mark every current booking as seen (even non-fresh) so it never fires later.
    for (const b of bookings) seenBookingIdsRef.current!.add(b.id);
    persist();
  }, [bookings, bookingsLoading, user]);

  // Stops for the history detail drawer
  const { data: historyDetailStops = [], isLoading: historyStopsLoading } = useQuery({
    queryKey: ["history-trip-stops", historyDetailTripId],
    queryFn: () => listTripStops(historyDetailTripId!),
    enabled: !!historyDetailTripId,
  });

  // Stops for the manage-passengers drawer's "view full route" popup
  const [showManagingTripRoute, setShowManagingTripRoute] = useState(false);
  const { data: managingTripStops = [] } = useQuery({
    queryKey: ["managing-trip-stops", managingTripId],
    queryFn: () => listTripStops(managingTripId!),
    enabled: !!managingTripId,
  });

  const { mutate: saveDriver, isPending: savingDriver } = useMutation({
    mutationFn: async (vals: Omit<CreateTeamDriverInput, "ownerUserId">) => {
      if (!user) throw new Error("Not logged in");

      // Block duplicate drivers: same phone or license as an existing team
      // driver (or the host themselves). Normalized so spaces, case, or a
      // +91 prefix can't sneak a duplicate through.
      const normPhone = (v?: string | null) => (v ?? "").replace(/\D/g, "").slice(-10);
      const normLicense = (v?: string | null) => (v ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
      const newPhone = normPhone(vals.phone);
      const newLicense = normLicense(vals.licenseNumber);
      const existing = [
        ...teamDrivers.filter((d) => d.id !== editingDriverId),
        ...(driverProfile ? [driverProfile] : []),
      ];
      for (const d of existing) {
        if (newPhone && normPhone(d.phone) === newPhone) {
          throw new Error(`A driver with this phone number already exists (${d.fullName}).`);
        }
        if (newLicense && normLicense(d.licenseNumber) === newLicense) {
          throw new Error(`A driver with this license number already exists (${d.fullName}).`);
        }
      }

      return editingDriverId
        ? updateTeamDriver(editingDriverId, vals)
        : createTeamDriver({ ownerUserId: user.$id, ...vals });
    },
    onSuccess: () => {
      message.success(editingDriverId ? "Driver updated!" : "Driver added!");
      void queryClient.invalidateQueries({ queryKey: ["team-drivers"] });
      setDriverDrawerOpen(false);
      driverForm.resetFields();
      setEditingDriverId(null);
    },
    onError: (err: any) => {
      const msg = err instanceof Error ? err.message : "Failed to save driver.";
      if (msg.includes("already exists")) {
        Modal.error({ title: "Duplicate driver details", content: msg, centered: true });
      } else {
        message.error(msg);
      }
    },
  });

  const { mutate: removeDriver } = useMutation({
    mutationFn: (id: string) => deleteTeamDriver(id),
    onSuccess: () => {
      message.success("Driver removed.");
      void queryClient.invalidateQueries({ queryKey: ["team-drivers"] });
    },
    onError: () => message.error("Failed to remove driver."),
  });

  const { mutate: submitRating, isPending: submittingRating } = useMutation({
    mutationFn: (vals: { bookingId: string; rating: number; comment?: string }) =>
      updateBookingRating(vals.bookingId, vals.rating, vals.comment),
    onSuccess: () => {
      message.success("Rating submitted successfully!");
      setRatingModalVisible(false);
      void queryClient.invalidateQueries({ queryKey: ["host-bookings"] });
    },
    onError: () => message.error("Failed to submit rating."),
  });

  // Derived history stats from real trips
  const completedTrips = trips.filter((t) => t.status === "completed");

  // A trip that's more than 5 hours past its departure and was never completed
  // or cancelled is treated as "expired" — it drops out of the upcoming Trips
  // tab and shows in History.
  const TRIP_EXPIRY_MINUTES = 45;
  const isExpired = (t: Trip) =>
    t.status === "expired" ||
    (t.status === "scheduled" &&
      now.isAfter(dayjs(t.departureAt).add(TRIP_EXPIRY_MINUTES, "minute")));

  // lifetimeEarnings computed after receivedByTrip is built (below)
  // Past trips: completed, cancelled, or expired move to history.
  const pastTrips = trips
    .filter((t) => t.status === "completed" || t.status === "cancelled" || isExpired(t))
    // Latest trips on top, oldest at the bottom.
    .sort((a, b) => new Date(b.departureAt).getTime() - new Date(a.departureAt).getTime());
  const filteredHistory =
    historyFilter === "all"
      ? pastTrips
      : pastTrips.filter((t) =>
          historyFilter === "completed"
            ? t.status === "completed"
            : t.status === "cancelled" || isExpired(t),
        );

  // Actual received revenue per trip = sum of segmentPrice × seatsBooked
  // for all non-cancelled bookings on that trip.
  const receivedByTrip = new Map<string, number>();
  bookings.forEach((b) => {
    if (b.status === "cancelled") return;
    const prev = receivedByTrip.get(b.tripId) ?? 0;
    receivedByTrip.set(b.tripId, prev + b.segmentPrice * b.seatsBooked);
  });
  // Net of the platform commission — what the host actually keeps. Matches the
  // Payouts panel's "Lifetime earnings".
  const lifetimeEarnings = hostNetEarnings(
    completedTrips.reduce((sum, t) => sum + (receivedByTrip.get(t.id) ?? 0), 0),
  );

  // Trips tab shows everything not yet completed/cancelled, including trips
  // currently in progress whose departure time has already passed.
  const upcomingTrips = trips.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled" && !isExpired(t),
  );

  const sortedTrips = [...upcomingTrips].sort(
    (a, b) => new Date(b.departureAt).getTime() - new Date(a.departureAt).getTime(),
  );

  // An in-progress trip whose estimated end time has passed: the host likely
  // forgot to end it, which keeps the vehicle + driver locked. We force them to
  // END TRIP (release resources) before they can do anything else.
  const tripEstimatedEnd = (t: Trip) => dayjs(t.arrivalAt ?? dayjs(t.departureAt).add(2, "hour"));
  const overdueLiveTrip = trips.find(
    (t) => t.status === "in_progress" && now.isAfter(tripEstimatedEnd(t)),
  );

  // Remind the host to start each scheduled trip: once at 15 minutes before
  // departure, and once more if departure passes while the trip is still not
  // started. localStorage keeps each reminder to a single notification.
  useEffect(() => {
    for (const trip of upcomingTrips) {
      if (trip.status !== "scheduled") continue;
      const departure = dayjs(trip.departureAt);
      const route = `${trip.fromLocation} → ${trip.toLocation}`;
      if (now.isAfter(departure)) {
        const key = `coolpool-reminded-timeup-${trip.id}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          void showAppNotification("Time is up — start your trip!", {
            body: `${route} was due at ${departure.format("h:mm A")}. Passengers are waiting.`,
            url: `/driver/dashboard?module=trips&trip=${trip.id}`,
            tag: `trip-timeup-${trip.id}`,
          });
        }
      } else if (now.isAfter(departure.subtract(15, "minute"))) {
        const key = `coolpool-reminded-15m-${trip.id}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          void showAppNotification("Start your trip now", {
            body: `${route} departs at ${departure.format("h:mm A")} — get ready and start the trip.`,
            url: `/driver/dashboard?module=trips&trip=${trip.id}`,
            tag: `trip-reminder-${trip.id}`,
          });
        }
      }
    }
  }, [now, upcomingTrips]);

  // Notify host to rate passengers when a trip's estimated end time passes
  useEffect(() => {
    for (const trip of trips) {
      if (trip.status !== "in_progress") continue;
      const estimatedEnd = dayjs(trip.arrivalAt ?? dayjs(trip.departureAt).add(2, "hour"));
      if (now.isAfter(estimatedEnd)) {
        const key = `coolpool-rate-passengers-${trip.id}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          void showAppNotification("Rate your passengers!", {
            body: `You've completed ${trip.fromLocation} → ${trip.toLocation}. Leave a review for your travelers.`,
            url: `/driver/dashboard?module=history&trip=${trip.id}`,
            tag: `rate-passengers-${trip.id}`,
          });
        }
      }
    }
  }, [now, trips]);

  const isVerifiedHost = vehicles.length > 0;

  const { mutate: performCreateTrip, isPending: creating } = useMutation({
    mutationFn: async (payload: any) => {
      let trip;
      if (editingTripId) {
        trip = await updateTrip(editingTripId, payload.tripData);
        // Remove old stops
        const oldStops = await listTripStops(editingTripId);
        for (const s of oldStops) {
          await deleteTripStop(s.id);
        }
      } else {
        const { code: tripCode } = await mintTripCode();
        trip = await createTrip({ ...payload.tripData, tripCode });
      }

      for (const stop of payload.stopsData) {
        await createTripStop({ ...stop, tripId: trip.id, hostId: trip.hostId });
      }
      return trip;
    },
    onSuccess: (trip) => {
      if (import.meta.env.DEV) {
        console.log("[publish trip] Appwrite document saved:", {
          id: trip.id,
          fromLocation: trip.fromLocation,
          toLocation: trip.toLocation,
        });
      }
      if (editingTripId) {
        message.success("Trip updated.");
      } else {
        setWizardOpen(false); // close wizard so the overlay is visible
        setTripPublishedSuccess(true);
        window.setTimeout(() => {
          setTripPublishedSuccess(false);
          setActiveModule("trips");
        }, 2400);
      }
      form.resetFields();
      setEditingTripId(null);
      setIsEditingTrip(false);
      setSelectedFrom(null);
      setSelectedTo(null);
      setSelectedIntermediateStops({});
      setIntermediateOptions({});
      setSegmentPricePreview([]);
      setPendingTripPayload(null);
      void queryClient.invalidateQueries({ queryKey: ["host-trips"] });
      // Close the form but stay in the current module (don't redirect to dashboard).
      setShowTripForm(false);
      setPublishModalView("trips");
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "Unable to create trip.");
    },
  });

  useEffect(() => {
    if (initGoogleServices()) return;
    if (!appwriteConfig.googleMapsApiKey) {
      message.error("Google Maps API key is missing.");
      return;
    }

    const onScriptReady = () => {
      if (!initGoogleServices()) {
        message.error("Google Places loaded but services are unavailable. Check API restrictions.");
      }
    };

    const existingScript = document.querySelector(
      'script[data-google-maps="places"]',
    ) as HTMLScriptElement | null;
    if (existingScript) {
      // Script may already be present and loaded before this page mounts.
      if (existingScript.dataset.loaded === "true") {
        onScriptReady();
        return;
      }
      existingScript.addEventListener("load", onScriptReady, { once: true });
      existingScript.addEventListener(
        "error",
        () => message.error("Failed to load Google Maps script."),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${appwriteConfig.googleMapsApiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "places";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        onScriptReady();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        message.error("Failed to load Google Maps script.");
      },
      { once: true },
    );
    document.head.appendChild(script);
  }, []);

  const onFinish = async (values: TripFormValues) => {
    if (!user) return;
    if (pendingTripPayload) {
      performCreateTrip(pendingTripPayload);
      return;
    }
    const normalizedFrom = values.fromLocation.trim();
    const normalizedTo = values.toLocation.trim();

    const resolvedFrom =
      selectedFrom && selectedFrom.value === normalizedFrom
        ? selectedFrom
        : { label: normalizedFrom, value: normalizedFrom, lat: 0, lng: 0 };
    const resolvedTo =
      selectedTo && selectedTo.value === normalizedTo
        ? selectedTo
        : { label: normalizedTo, value: normalizedTo, lat: 0, lng: 0 };

    const dirService = directionsServiceRef.current;
    if (!dirService) {
      message.error("Maps service not ready");
      return;
    }

    console.log("[Publish] Calculating route:", { resolvedFrom, resolvedTo });

    const getCoords = async (loc: { label: any; value: string; lat: number; lng: number }) => {
      if (loc.lat !== 0 || loc.lng !== 0) return loc;
      if (!geocoderRef.current) return loc;

      console.log("[Publish] Geocoding fallback for:", loc.value);
      return new Promise<{ label: any; value: string; lat: number; lng: number }>((resolve) => {
        geocoderRef.current!.geocode({ address: loc.value } as any, (results, status) => {
          if (status === "OK" && results?.[0]?.geometry?.location) {
            const pos = results[0].geometry.location;
            resolve({ ...loc, lat: pos.lat(), lng: pos.lng() });
          } else {
            console.warn("[Publish] Geocoding failed for:", loc.value, status);
            resolve(loc);
          }
        });
      });
    };

    const finalFrom = await getCoords(resolvedFrom);
    const finalTo = await getCoords(resolvedTo);
    const intermediateValues = (values.intermediateStops ?? [])
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    const finalIntermediateStops = await Promise.all(
      intermediateValues.map((value, index) => {
        const selected = selectedIntermediateStops[index];
        return getCoords(
          selected && selected.value === value ? selected : { label: value, value, lat: 0, lng: 0 },
        );
      }),
    );
    const allStops = [finalFrom, ...finalIntermediateStops, finalTo];

    if (allStops.some((stop) => stop.lat === 0 && stop.lng === 0)) {
      message.error(
        "Could not determine coordinates for one or more stops. Please select every location from the dropdown.",
      );
      return;
    }

    const handleRouteResult = (result: any) => {
      const route = result.routes[0];
      const polyline = route.overview_polyline;

      let currentDist = 0;
      const stopsData = allStops.map((stop, i) => {
        if (i > 0) {
          currentDist += route.legs[i - 1].distance.value / 1000; // converting meters to km
        }
        return {
          stopIndex: i,
          location: stop.value,
          lat: stop.lat,
          lng: stop.lng,
          stopType:
            i === 0
              ? ("pickup" as const)
              : i === allStops.length - 1
                ? ("drop" as const)
                : ("both" as const),
          distanceFromOriginKm: Math.round(currentDist * 10) / 10,
        };
      });

      const totalDistanceKm = Math.max(0.1, Math.round(currentDist * 10) / 10);
      const routeDurationSeconds = route.legs.reduce(
        (total: number, leg: { duration?: { value?: number } }) =>
          total + (leg.duration?.value ?? 0),
        0,
      );
      const durationMinutes = Math.max(
        1,
        routeDurationSeconds > 0
          ? Math.round(routeDurationSeconds / 60)
          : Math.round(totalDistanceKm),
      );
      const departureAt = values.departureAt.toISOString();
      const seatPrice = Number(values.totalTripPrice);
      const totalSeats = Number(values.totalSeats);
      const totalPrice = seatPrice * totalSeats;
      const selectedVehicle = vehicles.find((vehicle) => vehicle.id === values.vehicleId);
      setSegmentPricePreview(
        stopsData.flatMap((fromStop, fromIndex) =>
          stopsData.slice(fromIndex + 1).map((toStop) => {
            const distanceKm = Math.max(
              0,
              Math.round((toStop.distanceFromOriginKm - fromStop.distanceFromOriginKm) * 10) / 10,
            );
            return {
              from: fromStop.location,
              to: toStop.location,
              distanceKm,
              pricePerSeat: Math.round((distanceKm / totalDistanceKm) * seatPrice),
            };
          }),
        ),
      );

      const payload = {
        tripData: {
          hostId: user.$id,
          fromLocation: finalFrom.value,
          fromLat: finalFrom.lat,
          fromLng: finalFrom.lng,
          toLocation: finalTo.value,
          toLat: finalTo.lat,
          toLng: finalTo.lng,
          polyline,
          totalDistanceKm,
          totalPrice,
          pricePerKm: calcPricePerKm(totalPrice, totalDistanceKm),
          totalSeats,
          departureAt,
          arrivalAt: values.departureAt.add(durationMinutes, "minute").toISOString(),
          durationMinutes,
          hostDisplayName: user.name || "Verified Host",
          hostRating: 0,
          hostRatingCount: 0,
          vehicleModel: selectedVehicle?.modelName,
          vehicleColor: selectedVehicle?.color || undefined,
          notes: `Created from ride host trip module. Total price: ₹${totalPrice}.`,
          vehicleId: values.vehicleId,
          assignedDriverId: values.driverId,
          seatConfig: values.seatConfig,
        },
        stopsData: stopsData.map((stop, i) => ({
          ...stop,
          priceFromOrigin:
            i === stopsData.length - 1
              ? seatPrice
              : Math.round((stop.distanceFromOriginKm / totalDistanceKm) * seatPrice),
        })),
      };

      if (import.meta.env.DEV) {
        console.log("[publish trip] createTrip payload (strings stored in DB):", {
          totalDistanceKm: payload.tripData.totalDistanceKm,
          totalPrice: payload.tripData.totalPrice,
          stopsData: payload.stopsData,
        });
      }

      setPendingTripPayload(payload);
      message.success("Route and segment prices calculated. Review them, then publish.");
    };

    try {
      const routeRequest = {
        origin: { lat: finalFrom.lat, lng: finalFrom.lng },
        destination: { lat: finalTo.lat, lng: finalTo.lng },
        waypoints: finalIntermediateStops.map((stop) => ({
          location: { lat: stop.lat, lng: stop.lng },
          stopover: true,
        })),
        travelMode: "DRIVING" as any,
      };
      const maybePromise: any = (dirService as any).route(routeRequest);
      if (maybePromise && typeof maybePromise.then === "function") {
        const result = await maybePromise;
        handleRouteResult(result);
      } else {
        await new Promise<void>((resolve) => {
          (dirService as any).route(routeRequest, (result: any, status: string) => {
            if (status !== "OK" || !result) {
              console.error("[Publish] Directions API failed:", status, result);
              message.error(`Route calculation failed: ${status}. Please check your stops.`);
              resolve();
              return;
            }
            handleRouteResult(result);
            resolve();
          });
        });
      }
    } catch (err) {
      console.error("[Publish] Directions API threw:", err);
      message.error("Route calculation failed. Please check your stops.");
    }
  };

  const setCityOptions = (target: "from" | "to" | number, options: CityOption[]) => {
    if (target === "from") setFromOptions(options);
    else if (target === "to") setToOptions(options);
    else setIntermediateOptions((current) => ({ ...current, [target]: options }));
  };

  const getLocalCityOptions = (query: string): CityOption[] => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return SOUTH_INDIA_CITY_SUGGESTIONS.filter(
      (city) =>
        city.name.toLowerCase().includes(needle) || city.state.toLowerCase().includes(needle),
    )
      .slice(0, 8)
      .map((city) => ({
        value: `${city.name}, ${city.state}`,
        label: (
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{city.name}</span>
            <span className="text-xs text-gray-400">{city.state}</span>
          </div>
        ),
        lat: city.lat,
        lng: city.lng,
      }));
  };

  const searchCities = async (query: string, target: "from" | "to" | number) => {
    if (target === "from") {
      console.log("[fromLocation] searchCities called", {
        query,
        queryLength: query?.length ?? 0,
        mapsReady,
        hasAutocompleteService: !!autocompleteServiceRef.current,
      });
    }
    if (!query || query.trim().length < 2) {
      setCityOptions(target, []);
      return;
    }
    const localOptions = getLocalCityOptions(query);
    setCityOptions(target, localOptions);

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

        if (target === "from") {
          console.log("[fromLocation] getPlacePredictions callback", {
            status,
            predictionsCount: predictions?.length ?? 0,
            samplePrediction: predictions?.[0]?.description ?? null,
          });
        }

        if ((status !== "OK" || !predictions) && !isAirportQuery) {
          return;
        }

        const safePredictions = predictions || [];

        const filteredPredictions = safePredictions.filter((p) => {
          const desc = p.description.toLowerCase();
          return SOUTH_INDIA_STATES.some((state) => desc.includes(state)) || isAirportQuery;
        });

        if (filteredPredictions.length === 0 && safePredictions.length > 0 && !isAirportQuery) {
          if (localOptions.length > 0) return;
          const options = [
            {
              value: "",
              label: "ðŸš« Out of Service Area (South India & Goa only)",
              disabled: true,
            },
          ];
          setCityOptions(target, options as any);
          return;
        }
        const options: any[] = filteredPredictions.map((prediction) => ({
          value: stripCountrySuffix(prediction.description),
          label: stripCountrySuffix(prediction.description),
          placeId: prediction.place_id,
          lat: 0,
          lng: 0,
        }));

        if (isAirportQuery) {
          const airportOptions = BENGALURU_AIRPORTS.map((a) => ({
            value: `${a.name}, ${SERVICE_CITY}`,
            label: (
              <div className="flex items-center gap-2">
                <span>âœˆï¸</span>
                <span className="font-medium text-gray-900">
                  {a.name} <span className="text-gray-400 font-normal">({a.code})</span>
                </span>
              </div>
            ),
            placeId: undefined, // Let geocoder handle it on selection
            lat: a.lat,
            lng: a.lng,
          }));

          [...airportOptions].reverse().forEach((ao) => {
            if (!options.find((o) => o.value === ao.value)) {
              options.unshift(ao);
            }
          });
        }

        const mergedOptions = [...localOptions, ...options].filter(
          (option, index, all) =>
            all.findIndex((candidate) => candidate.value === option.value) === index,
        );
        setCityOptions(target, mergedOptions as any);
      },
    );
  };

  const onSelectCity = (value: string, target: "from" | "to" | number) => {
    let sourceOptions: CityOption[] = [];
    if (target === "from") sourceOptions = fromOptions;
    else if (target === "to") sourceOptions = toOptions;
    else sourceOptions = intermediateOptions[target] ?? [];

    const selected = sourceOptions.find((option) => option.value === value);
    if (!selected) return;

    const geocoder = geocoderRef.current;
    if (!geocoder || !selected.placeId) {
      if (target === "from") setSelectedFrom(selected);
      else if (target === "to") setSelectedTo(selected);
      else setSelectedIntermediateStops((current) => ({ ...current, [target]: selected }));
      return;
    }

    geocoder.geocode({ placeId: selected.placeId }, (results, status) => {
      if (status !== "OK" || !results?.[0]?.geometry?.location) {
        message.error("Could not resolve selected city coordinates.");
        return;
      }
      const withCoords: CityOption = {
        ...selected,
        lat: results[0].geometry.location.lat(),
        lng: results[0].geometry.location.lng(),
      };
      if (target === "from") setSelectedFrom(withCoords);
      else if (target === "to") setSelectedTo(withCoords);
      else setSelectedIntermediateStops((current) => ({ ...current, [target]: withCoords }));
    });
  };

  const removeIntermediateStop = (remove: (index: number) => void, index: number) => {
    remove(index);
    setSelectedIntermediateStops((current) =>
      Object.fromEntries(
        Object.entries(current)
          .filter(([key]) => Number(key) !== index)
          .map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value]),
      ),
    );
    setIntermediateOptions((current) =>
      Object.fromEntries(
        Object.entries(current)
          .filter(([key]) => Number(key) !== index)
          .map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value]),
      ),
    );
    setSegmentPricePreview([]);
  };

  const renderIntermediateStops = (compact = false) => (
    <Form.List name="intermediateStops">
      {(fields, { add, remove }) => (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Text strong className="text-sm text-gray-700">
                Intermediate Stops
              </Text>
              <Text type="secondary" className="block text-xs">
                Start typing for city suggestions. Travelers can book any forward segment.
              </Text>
            </div>
            <Button
              type="dashed"
              icon={<Plus size={15} />}
              disabled={fields.length >= 8}
              onClick={() => add()}
            >
              Add stop
            </Button>
          </div>
          {fields.map((field, index) => (
            <div key={field.key} className="flex items-start gap-2">
              <div className="mt-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </div>
              <Form.Item
                {...field}
                className="mb-0 flex-1"
                rules={[{ required: true, message: "Select or remove this stop" }]}
              >
                <AutoComplete
                  options={intermediateOptions[index] ?? []}
                  onSearch={(text) => {
                    setSelectedIntermediateStops((current) => {
                      const next = { ...current };
                      delete next[index];
                      return next;
                    });
                    void searchCities(text, index);
                  }}
                  onSelect={(value) => onSelectCity(value, index)}
                >
                  <Input
                    placeholder={`Stop ${index + 1}`}
                    size="large"
                    style={{ borderRadius: "8px", height: compact ? "44px" : "48px" }}
                  />
                </AutoComplete>
              </Form.Item>
              <Button
                danger
                type="text"
                aria-label={`Remove stop ${index + 1}`}
                icon={<Trash2 size={17} />}
                className="mt-1"
                onClick={() => removeIntermediateStop(remove, index)}
              />
            </div>
          ))}
        </div>
      )}
    </Form.List>
  );

  const renderSegmentPricePreview = () =>
    segmentPricePreview.length > 0 ? (
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Text strong>Automatic segment prices</Text>
          <Tag color="purple">{segmentPricePreview.length} bookable segments</Tag>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {segmentPricePreview.map((segment) => (
            <div
              key={`${segment.from}-${segment.to}`}
              className="flex items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {segment.from} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {segment.to}
              </span>
              <span className="shrink-0 font-bold text-emerald-700">
                ₹{segment.pricePerSeat} · {segment.distanceKm} km
              </span>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        Add route details and click “Calculate Route & Prices” to review every segment.
      </div>
    );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-200 via-green-200 to-emerald-300 p-4">
        <Spin size="large" />
      </div>
    );
  }

  if (!isDriver) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-200 via-green-200 to-emerald-300 p-4">
        <Card className="max-w-md text-center shadow-elevated rounded-3xl border-none">
          <Text type="danger" strong>
            ACCESS DENIED
          </Text>
          <p className="mt-2 text-muted-foreground">
            This workspace is only for ride host accounts. Please complete ride host onboarding.
          </p>
          <Button type="primary" className="mt-4 rounded-3xl" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#6b46c1",
          borderRadius: 0,
          fontFamily: APP_FONT_FAMILY,
          colorBgContainer: "rgba(255, 255, 255, 0.7)",
          colorBgElevated: "rgba(255, 255, 255, 0.9)",
        },
        components: {
          Layout: {
            headerBg: "rgba(255, 255, 255, 0.6)",
            siderBg: "rgba(255, 255, 255, 0.7)",
            bodyBg: "transparent",
          },
          Menu: {
            itemBg: "transparent",
            itemSelectedBg: "rgba(107, 70, 193, 0.15)",
            itemSelectedColor: "#6b46c1",
            itemBorderRadius: 12,
          },
          Card: {
            colorBgContainer: "rgba(255, 255, 255, 0.8)",
            borderRadius: 16,
            borderRadiusLG: 16,
          },
          Button: {
            borderRadius: 12,
            borderRadiusLG: 14,
            borderRadiusSM: 10,
          },
          Modal: {
            borderRadiusLG: 16,
            contentBg: "#ffffff",
            headerBg: "#ffffff",
          },
          Tag: {
            borderRadiusSM: 999,
          },
          Input: {
            borderRadius: 12,
            borderRadiusLG: 14,
          },
          InputNumber: {
            borderRadius: 12,
            borderRadiusLG: 14,
          },
          Select: {
            borderRadius: 12,
            borderRadiusLG: 14,
          },
          DatePicker: {
            borderRadius: 12,
            borderRadiusLG: 14,
          },
        },
      }}
    >
      <div
        className="min-h-screen bg-fixed bg-gradient-to-br from-emerald-200 via-green-200 to-emerald-300"
        style={{ fontFamily: APP_FONT_FAMILY }}
      >
        {/* Forced END TRIP — a trip is still "in progress" past its end time, so
            the vehicle + driver are locked. Block the screen until the host ends
            it (only one action: End Trip). */}
        {overdueLiveTrip && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-gray-900/80 px-6 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                <FlagTriangleRight size={30} />
              </div>
              <h2 className="mt-5 text-2xl font-black text-gray-900">End your ongoing trip</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Your ride{" "}
                <strong>
                  {stripCountrySuffix(overdueLiveTrip.fromLocation)} →{" "}
                  {stripCountrySuffix(overdueLiveTrip.toLocation)}
                </strong>{" "}
                has passed its expected end time. End it to release your vehicle and driver — you
                can&apos;t host a new trip until this one is closed.
              </p>
              <Button
                type="primary"
                size="large"
                block
                danger
                loading={tripActionLoading === overdueLiveTrip.id}
                onClick={() => handleEndTrip(overdueLiveTrip.id)}
                className="mt-6 h-12 rounded-2xl font-bold"
              >
                End Trip
              </Button>
            </div>
          </div>
        )}

        {tripPublishedSuccess && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-white/95 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex flex-col items-center px-6 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 shadow-[0_10px_35px_rgba(16,185,129,0.45)] animate-in zoom-in-50 duration-300">
                  <svg viewBox="0 0 52 52" className="h-12 w-12" aria-hidden>
                    <path
                      fill="none"
                      stroke="white"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14 27 L22 35 L38 18"
                      style={{
                        strokeDasharray: 48,
                        strokeDashoffset: 48,
                        animation: "cp-check-draw 0.4s ease-out 0.2s forwards",
                      }}
                    />
                  </svg>
                </div>
              </div>
              <p className="mt-6 text-2xl font-bold text-gray-900">Trip published successfully</p>
              <p className="mt-1 text-sm text-gray-500">
                Your ride is live. Taking you to your trips…
              </p>
              <style>{`@keyframes cp-check-draw { to { stroke-dashoffset: 0; } }`}</style>
            </div>
          </div>
        )}

        {accountDeletedSuccess && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-white/95 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex flex-col items-center px-6 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-red-500 shadow-[0_10px_35px_rgba(239,68,68,0.45)] animate-in zoom-in-50 duration-300">
                  <svg viewBox="0 0 52 52" className="h-12 w-12" aria-hidden>
                    <path
                      fill="none"
                      stroke="white"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16 16 L36 36 M36 16 L16 36"
                      style={{
                        strokeDasharray: 60,
                        strokeDashoffset: 60,
                        animation: "cp-cross-draw 0.4s ease-out 0.2s forwards",
                      }}
                    />
                  </svg>
                </div>
              </div>
              <p className="mt-6 text-2xl font-bold text-gray-900">Account deleted</p>
              <p className="mt-1 text-sm text-gray-500">Signing you out…</p>
              <style>{`@keyframes cp-cross-draw { to { stroke-dashoffset: 0; } }`}</style>
            </div>
          </div>
        )}

        <Modal
          open={deleteAccountModalOpen}
          onCancel={() => {
            if (!deletingAccount) setDeleteAccountModalOpen(false);
          }}
          footer={null}
          centered
          closable={!deletingAccount}
          maskClosable={!deletingAccount}
          width={460}
          styles={{ content: { borderRadius: "1.5rem", padding: 0, overflow: "hidden" } }}
        >
          <div className="px-7 pt-7 pb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="text-red-600" size={26} />
            </div>
            <h3 className="mt-5 text-2xl font-bold text-gray-900">Delete your account?</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              This will permanently remove your driver profile, vehicles, and host role from
              Coolpool. <strong>This action cannot be undone.</strong>
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                block
                size="large"
                onClick={() => setDeleteAccountModalOpen(false)}
                disabled={deletingAccount}
                className="rounded-2xl"
              >
                No
              </Button>
              <Button
                block
                size="large"
                danger
                type="primary"
                loading={deletingAccount}
                onClick={() => void handleDeleteAccount()}
                className="rounded-2xl"
              >
                Yes, delete
              </Button>
            </div>
          </div>
        </Modal>
        <Layout className="bg-transparent max-w-[1600px] mx-auto relative flex">
          <Sider
            breakpoint="lg"
            collapsedWidth="0"
            width={280}
            className="hidden lg:block m-4 rounded-2xl border border-white/40 shadow-soft overflow-hidden"
            style={{
              position: "sticky",
              top: 16,
              height: "calc(100vh - 32px)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
          >
            <div className="p-4 sm:p-6 pb-2 text-center">
              <button
                type="button"
                onClick={() => void navigate({ to: "/" })}
                aria-label="Go to coolpool.in home"
                className="inline-block"
              >
                <img
                  src={logo}
                  alt="Coolpool Logo"
                  className="h-16 w-auto mx-auto object-contain"
                />
              </button>
            </div>

            <Menu
              mode="inline"
              selectedKeys={[activeModule]}
              onClick={({ key }) => {
                setActiveModule(normalizeModule(key));
                if (key === "trips") {
                  setEditingTripId(null);
                  setIsEditingTrip(false);
                  form.resetFields();
                  setSelectedFrom(null);
                  setSelectedTo(null);
                }
              }}
              className="border-none px-2 mt-4"
              items={
                [
                  {
                    key: "dashboard",
                    icon: <LayoutDashboard size={18} />,
                    label: "Overview",
                  },
                  {
                    key: "trips",
                    icon: <PlusCircle size={18} />,
                    label: "My Trips",
                  },
                  {
                    key: "history",
                    icon: <History size={18} />,
                    label: "Ride History",
                  },
                  {
                    key: "customers",
                    icon: <UserCheck size={18} />,
                    label: "Guest",
                  },
                  {
                    key: "drivers",
                    icon: <Users2 size={18} />,
                    label: "Drivers",
                  },
                  {
                    key: "payouts",
                    icon: <Wallet size={18} />,
                    label: "Payouts",
                  },
                  {
                    key: "settings",
                    icon: <Settings size={18} />,
                    label: "Vehicle Fleet",
                  },
                  !isVerifiedHost && {
                    key: "onboarding",
                    icon: <Sparkles size={18} />,
                    label: "Complete Onboarding",
                  },
                ].filter(Boolean) as any
              }
            />
          </Sider>

          <Layout className="bg-transparent flex-1">
            <Header
              className="px-6 flex items-center justify-between border-b border-white/20 sticky top-0 z-50 h-16"
              style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
            >
              <div>
                <Title level={4} style={{ margin: 0 }} className="hidden sm:block font-bold">
                  {activeModule === "dashboard"
                    ? "Dashboard Overview"
                    : activeModule === "trips"
                      ? "Upcoming Trips"
                      : activeModule === "history"
                        ? "Ride History"
                        : activeModule === "drivers"
                          ? "Drivers"
                          : activeModule === "onboarding"
                            ? "Complete Onboarding"
                            : activeModule === "payouts"
                              ? "Payouts"
                              : "Vehicle Fleet"}
                </Title>
                <div className="sm:hidden">
                  <button
                    type="button"
                    onClick={() => void navigate({ to: "/" })}
                    aria-label="Go to coolpool.in home"
                    className="block"
                  >
                    <img src={logo} alt="Coolpool Logo" className="h-12 w-auto object-contain" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: "header",
                        label: (
                          <div className="px-1 py-3" style={{ minWidth: 240 }}>
                            {/* User info */}
                            <div className="flex items-center gap-3 mb-3">
                              <div className="relative">
                                <Avatar
                                  size={48}
                                  src={
                                    driverProfile?.photoUrl ||
                                    getUserAvatarUrl(getUserDisplayName(user), 96)
                                  }
                                  className="bg-gradient-primary text-primary-foreground font-bold text-lg border border-white/60"
                                >
                                  {!driverProfile?.photoUrl &&
                                    !getUserAvatarUrl(getUserDisplayName(user)) &&
                                    (getUserDisplayName(user)?.[0]?.toUpperCase() || "U")}
                                </Avatar>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    photoInputRef.current?.click();
                                  }}
                                  disabled={savingPhoto}
                                  aria-label={
                                    driverProfile?.photoUrl ? "Change photo" : "Add photo"
                                  }
                                  className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shadow ring-2 ring-white"
                                >
                                  {savingPhoto ? <Spin size="small" /> : <Camera size={11} />}
                                </button>
                                <input
                                  ref={photoInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) savePhoto(file);
                                    e.target.value = "";
                                  }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-900 truncate">
                                  {getUserDisplayName(user)}
                                </div>
                                <div className="text-xs text-gray-600 truncate">{user?.email}</div>
                                <div
                                  className={`text-xs font-semibold mt-1 flex items-center gap-1 ${isVerifiedHost ? "text-blue-600" : "text-amber-600"}`}
                                >
                                  {isVerifiedHost ? (
                                    <>
                                      <CheckCircle size={12} />
                                      Verified Host
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles size={12} />
                                      Incomplete Profile
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Ride preferences row */}
                            <div className="border-t border-gray-100 pt-3 pb-1">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                                  Ride Preferences
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProfileDropdownOpen(false);
                                    setPrefsLocal(
                                      savedPrefs ?? {
                                        smokingAllowed: false,
                                        alcoholAllowed: false,
                                        musicAllowed: false,
                                        musicType: null,
                                        musicOnly: false,
                                        petsAllowed: false,
                                      },
                                    );
                                    setPrefsDrawerOpen(true);
                                  }}
                                  className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/70 transition-colors"
                                >
                                  <Pencil size={11} /> Edit
                                </button>
                              </div>
                              {savedPrefs && <RidePrefChips prefs={savedPrefs} />}
                            </div>
                          </div>
                        ),
                        disabled: true,
                      },
                      {
                        key: "logout",
                        label: "Logout",
                        icon: <LogOut size={14} />,
                        danger: true,
                        onClick: () => void signOut(),
                      },
                      {
                        key: "delete-account",
                        label: "Delete Account",
                        icon: <Trash2 size={14} />,
                        danger: true,
                        onClick: () => setDeleteAccountModalOpen(true),
                      },
                    ],
                  }}
                  open={profileDropdownOpen}
                  onOpenChange={setProfileDropdownOpen}
                  trigger={["click"]}
                  placement="bottomRight"
                  overlayClassName="profile-dropdown"
                >
                  <div className="group flex items-center cursor-pointer">
                    <Badge
                      dot
                      status={isVerifiedHost ? "processing" : "warning"}
                      offset={[-1, 26]}
                      color={isVerifiedHost ? "#6b46c1" : "#f59e0b"}
                    >
                      <Avatar
                        src={
                          driverProfile?.photoUrl || getUserAvatarUrl(getUserDisplayName(user), 68)
                        }
                        className="bg-gradient-primary shadow-sm border border-white/40 group-hover:border-white/80 transition-all"
                        size={34}
                      >
                        {!driverProfile?.photoUrl &&
                          !getUserAvatarUrl(getUserDisplayName(user)) &&
                          (getUserDisplayName(user)?.[0]?.toUpperCase() || <User size={16} />)}
                      </Avatar>
                    </Badge>
                  </div>
                </Dropdown>
              </div>
            </Header>

            <Content className="p-5 sm:p-8 md:p-12 max-w-7xl mx-auto w-full pb-28 lg:pb-12">
              <NotificationPermissionPrompt />
              {activeModule === "dashboard" && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {!isVerifiedHost && (
                    <Card className="rounded-3xl border-none bg-gradient-to-r from-amber-50 to-orange-50 p-6 shadow-soft relative overflow-hidden">
                      <div className="absolute -right-6 -top-6 text-amber-100 opacity-50 rotate-12">
                        <Sparkles size={120} />
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center gap-6 relative z-10">
                        <div className="h-16 w-16 rounded-3xl bg-amber-500 text-white flex items-center justify-center shadow-glow shrink-0">
                          <Sparkles size={32} />
                        </div>
                        <div className="flex-1">
                          <Title level={3} className="m-0 text-amber-900">
                            Complete your profile
                          </Title>
                          <Text className="text-amber-700/80 text-base">
                            Finish your onboarding to unlock all features and become a verified
                            host.
                          </Text>
                        </div>
                        <Button
                          type="primary"
                          danger
                          size="large"
                          icon={<TriangleAlert size={20} />}
                          style={{
                            height: 56,
                            paddingInline: 40,
                            fontSize: 17,
                            borderRadius: 16,
                            fontWeight: 700,
                          }}
                          onClick={() => setActiveModule("onboarding")}
                        >
                          Get Verified
                        </Button>
                      </div>
                    </Card>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="m-0 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                          Hi, {getUserDisplayName(user).split(" ")[0]}!
                        </h1>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${getHostTier(completedTrips.length).badgeClass}`}
                        >
                          <Award size={13} />
                          {getHostTier(completedTrips.length).label}
                        </span>
                      </div>
                      <p className="m-0 text-sm font-medium text-gray-500">
                        Here's what's happening with your trips today.
                      </p>
                      {/* Quick switch back to the rider experience */}
                      <RoleSwitch className="mt-2 self-start" />
                    </div>
                    <Button
                      type="primary"
                      icon={<PlusCircle size={28} color="white" />}
                      style={{
                        height: 72,
                        minWidth: 190,
                        fontSize: 20,
                        fontWeight: 800,
                        borderRadius: 36,
                        whiteSpace: "nowrap",
                        color: "white",
                      }}
                      className="w-full sm:w-auto sm:flex-shrink-0 bg-gradient-primary border-none !text-white [&_svg]:!text-white shadow-glow hover:scale-105 active:scale-95 transition-transform !px-8 sm:!px-12"
                      onClick={openWizard}
                    >
                      Host a Ride
                    </Button>
                  </div>

                  {/* ── Host Bio card ── */}
                  <Card
                    className="rounded-2xl border border-white/60 shadow-soft backdrop-blur-md overflow-hidden"
                    styles={{ body: { padding: "20px 24px" } }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-blue-100 rounded-2xl text-blue-600 shrink-0">
                          <User size={18} />
                        </div>
                        <Text strong className="text-gray-800">
                          About you
                        </Text>
                      </div>
                      {!bioEditing && (
                        <button
                          onClick={() => {
                            setBioText(driverProfile?.bio ?? "");
                            setBioEditing(true);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/70 transition-colors shrink-0"
                        >
                          <Pencil size={11} /> {driverProfile?.bio ? "Edit" : "Add bio"}
                        </button>
                      )}
                    </div>

                    {bioEditing ? (
                      <div className="mt-3 space-y-2">
                        <Input.TextArea
                          value={bioText}
                          onChange={(e) => setBioText(e.target.value)}
                          placeholder="Tell travelers about yourself — experience, routes you love, driving style…"
                          maxLength={200}
                          autoSize={{ minRows: 3, maxRows: 5 }}
                          className="rounded-xl text-sm w-full block"
                          autoFocus
                        />
                        <p className="text-xs text-gray-400 text-right">{bioText.length} / 200</p>
                        <div className="flex gap-2 justify-end">
                          <Button
                            onClick={() => setBioEditing(false)}
                            className="rounded-xl flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="primary"
                            loading={savingBio}
                            className="rounded-xl flex-1 bg-gradient-primary border-none"
                            onClick={() => saveBio(bioText)}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 ml-[3.25rem]">
                        {driverProfile?.bio ? (
                          <p className="text-sm text-gray-600 italic leading-relaxed">
                            "{driverProfile.bio}"
                          </p>
                        ) : (
                          <button
                            onClick={() => {
                              setBioText("");
                              setBioEditing(true);
                            }}
                            className="text-xs text-gray-400 hover:text-primary transition-colors"
                          >
                            + Tell travelers about yourself…
                          </button>
                        )}
                      </div>
                    )}
                  </Card>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Total Rides */}
                    <Card className="rounded-2xl border border-white/60 shadow-soft hover:shadow-card transition-all duration-300 backdrop-blur-md group overflow-hidden relative py-5 px-5">
                      <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all" />
                      <div className="flex items-center justify-between gap-4">
                        {/* Left */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2.5 bg-purple-100 rounded-2xl text-purple-600 shrink-0">
                            <RouteIcon size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-500 leading-tight">
                              Total Rides
                            </p>
                            <Tag
                              color="purple"
                              className="rounded-full px-2.5 border-none font-medium text-xs mt-1.5"
                            >
                              +12% this month
                            </Tag>
                          </div>
                        </div>
                        {/* Right — number */}
                        <div className="text-right shrink-0">
                          <p className="text-3xl font-black text-gray-900 leading-none">
                            {tripsLoading ? <Spin size="small" /> : trips.length}
                          </p>
                        </div>
                      </div>
                    </Card>

                    {/* Total Earnings */}
                    <Card className="rounded-2xl border border-white/60 shadow-soft hover:shadow-card transition-all duration-300 backdrop-blur-md group overflow-hidden relative py-5 px-5">
                      <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all" />
                      <div className="flex items-center justify-between gap-4">
                        {/* Left */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2.5 bg-emerald-100 rounded-2xl text-emerald-600 shrink-0 flex items-center justify-center w-10 h-10">
                            <span className="font-black text-lg leading-none">₹</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-500 leading-tight">
                              Total Earnings
                            </p>
                            <p className="text-xs text-gray-400 mt-1">Settlement pending</p>
                          </div>
                        </div>
                        {/* Right — number */}
                        <div className="text-right shrink-0">
                          <p className="text-3xl font-black text-gray-900 leading-none">₹0</p>
                        </div>
                      </div>
                    </Card>

                    {/* Performance */}
                    <Card className="rounded-2xl border border-white/60 shadow-soft hover:shadow-card transition-all duration-300 backdrop-blur-md group overflow-hidden relative py-5 px-5">
                      <div
                        className={`absolute -left-6 -top-6 w-24 h-24 rounded-full blur-xl transition-all ${performanceRatingColors.accent}`}
                      />
                      <div className="flex items-center justify-between gap-4">
                        {/* Left */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-2.5 rounded-2xl shrink-0 ${performanceRatingColors.icon}`}
                          >
                            <Sparkles size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-500 leading-tight">
                              Performance
                            </p>
                            <div className="flex gap-1 mt-1.5">
                              {[...Array(5)].map((_, i) => (
                                <Star key={i} size={13} className={performanceRatingColors.star} />
                              ))}
                            </div>
                          </div>
                        </div>
                        {/* Right — number */}
                        <div className="text-right shrink-0">
                          <p
                            className={`text-3xl font-black leading-none ${performanceRatingColors.score}`}
                          >
                            {performanceRating.toFixed(1)}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* ── Ride Preferences Drawer ── */}
                  <Drawer
                    title="Ride Preferences"
                    placement="right"
                    width={360}
                    mask={false}
                    open={prefsDrawerOpen}
                    onClose={() => setPrefsDrawerOpen(false)}
                    footer={
                      <Button
                        type="primary"
                        block
                        size="large"
                        loading={savingPrefs}
                        className="bg-gradient-primary border-none rounded-2xl font-bold"
                        onClick={() => savePrefs(prefsLocal)}
                      >
                        Save Preferences
                      </Button>
                    }
                  >
                    <div className="space-y-6">
                      {/* Smoking */}
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-xl ${prefsLocal.smokingAllowed ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400"}`}
                          >
                            <Cigarette size={20} />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-800 text-sm">Smoking</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {prefsLocal.smokingAllowed ? "Allowed in vehicle" : "Not allowed"}
                            </div>
                          </div>
                        </div>
                        <Switch
                          checked={prefsLocal.smokingAllowed}
                          onChange={(v) => setPrefsLocal((p) => ({ ...p, smokingAllowed: v }))}
                        />
                      </div>

                      {/* Alcohol */}
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-xl ${prefsLocal.alcoholAllowed ? "bg-rose-100 text-rose-500" : "bg-gray-100 text-gray-400"}`}
                          >
                            <Wine size={20} />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-800 text-sm">Alcohol</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {prefsLocal.alcoholAllowed ? "Allowed in vehicle" : "Not allowed"}
                            </div>
                          </div>
                        </div>
                        <Switch
                          checked={prefsLocal.alcoholAllowed}
                          onChange={(v) => setPrefsLocal((p) => ({ ...p, alcoholAllowed: v }))}
                        />
                      </div>

                      {/* Music */}
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-xl ${prefsLocal.musicAllowed ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}
                          >
                            {prefsLocal.musicAllowed ? <Music2 size={20} /> : <VolumeX size={20} />}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-800 text-sm">Music</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {prefsLocal.musicAllowed ? "Allowed" : "Not allowed"}
                            </div>
                          </div>
                        </div>
                        <Switch
                          checked={prefsLocal.musicAllowed}
                          onChange={(v) =>
                            setPrefsLocal((p) => ({
                              ...p,
                              musicAllowed: v,
                              musicType: null,
                              musicOnly: false,
                            }))
                          }
                        />
                      </div>

                      {/* Pets */}
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-xl ${prefsLocal.petsAllowed ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"}`}
                          >
                            <PawPrint size={20} />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-800 text-sm">Pets</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {prefsLocal.petsAllowed ? "Pets welcome on board" : "Not allowed"}
                            </div>
                          </div>
                        </div>
                        <Switch
                          checked={prefsLocal.petsAllowed}
                          onChange={(v) => setPrefsLocal((p) => ({ ...p, petsAllowed: v }))}
                        />
                      </div>

                      <div className="text-xs text-gray-400 text-center pt-2">
                        These preferences appear on your trip cards to help travelers decide.
                      </div>
                    </div>
                  </Drawer>

                  <div className="grid gap-8 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-6">
                      <div className="flex items-center justify-between">
                        <Title level={4} style={{ margin: 0 }} className="font-bold">
                          Upcoming Trips
                        </Title>
                        <Button
                          type="link"
                          className="font-medium"
                          onClick={() => {
                            setPublishTripsModalOpen(true);
                            setPublishModalView("trips");
                          }}
                        >
                          Manage all
                        </Button>
                      </div>

                      {tripsLoading ? (
                        <div className="py-12 text-center bg-white/40 rounded-2xl border border-white/60 backdrop-blur-md">
                          <Spin size="large" />
                        </div>
                      ) : upcomingTrips.length === 0 ? (
                        <div className="py-16 text-center bg-white/40 rounded-2xl border border-white/60 backdrop-blur-md shadow-soft flex flex-col items-center justify-center">
                          <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                            <RouteIcon size={32} className="text-purple-500" />
                          </div>
                          <Title level={4}>No upcoming trips</Title>
                          <Text type="secondary" className="max-w-md mt-2">
                            Your published trips will appear here. Start sharing your empty seats to
                            earn money on your journeys.
                          </Text>
                          <Button
                            type="primary"
                            size="large"
                            className="mt-6 bg-gradient-primary border-none rounded-3xl"
                            onClick={openWizard}
                          >
                            Host a Ride
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {sortedTrips.slice(0, 5).map((item) => (
                            <div
                              key={item.id}
                              className="bg-white/80 rounded-2xl border border-white shadow-soft p-5 hover:shadow-card transition-all duration-300 group overflow-hidden"
                            >
                              <div className="flex flex-col gap-1.5 mb-4">
                                <div className="flex items-center justify-between gap-2">
                                  <Tag
                                    color="purple"
                                    className="rounded-full border-none px-3 py-1 font-semibold text-xs m-0 shrink-0"
                                  >
                                    {dayjs(item.departureAt).format("MMM D, YYYY • h:mm A")}
                                  </Tag>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Text strong className="text-lg text-emerald-600">
                                      ₹{item.totalPrice}
                                    </Text>
                                    <Dropdown
                                      menu={{
                                        items: [
                                          { key: "share", label: "Share trip" },
                                          { key: "edit", label: "Edit trip details" },
                                          { key: "cancel", label: "Cancel trip", danger: true },
                                        ],
                                        onClick: async ({ key }) => {
                                          if (key === "share") {
                                            await handleShareTrip(item);
                                            return;
                                          }
                                          if (key === "edit") {
                                            const hide = message.loading(
                                              "Fetching trip details...",
                                              0,
                                            );
                                            try {
                                              setEditingTripId(item.id);
                                              setIsEditingTrip(true);

                                              // Fetch stops to pre-populate
                                              const stops = await listTripStops(item.id);
                                              const fromStop = stops.find(
                                                (s) => s.stopType === "pickup",
                                              );
                                              const toStop = stops.find(
                                                (s) => s.stopType === "drop",
                                              );
                                              const intermediateStops = stops.filter(
                                                (s) => s.stopType === "both",
                                              );

                                              if (fromStop)
                                                setSelectedFrom({
                                                  label: fromStop.location,
                                                  value: fromStop.location,
                                                  lat: fromStop.lat,
                                                  lng: fromStop.lng,
                                                });
                                              if (toStop)
                                                setSelectedTo({
                                                  label: toStop.location,
                                                  value: toStop.location,
                                                  lat: toStop.lat,
                                                  lng: toStop.lng,
                                                });
                                              setSelectedIntermediateStops(
                                                Object.fromEntries(
                                                  intermediateStops.map((stop, index) => [
                                                    index,
                                                    {
                                                      label: stop.location,
                                                      value: stop.location,
                                                      lat: stop.lat,
                                                      lng: stop.lng,
                                                    },
                                                  ]),
                                                ),
                                              );

                                              form.setFieldsValue({
                                                fromLocation: item.fromLocation,
                                                toLocation: item.toLocation,
                                                departureAt: dayjs(item.departureAt),
                                                totalSeats: item.totalSeats,
                                                totalTripPrice: Math.round(
                                                  item.totalPrice / (item.totalSeats || 1),
                                                ),
                                                vehicleId: item.vehicleId,
                                                driverId: item.assignedDriverId,
                                                intermediateStops: intermediateStops.map(
                                                  (stop) => stop.location,
                                                ),
                                              });

                                              setShowTripForm(true);
                                              setActiveModule("trips");
                                              message.success("Trip loaded for editing.");
                                            } catch (err) {
                                              console.error("[EditTrip] Error:", err);
                                              message.error("Failed to load trip details.");
                                            } finally {
                                              hide();
                                            }
                                          } else if (key === "cancel") {
                                            message.info("Cancel functionality coming soon");
                                          }
                                        },
                                      }}
                                      trigger={["click"]}
                                    >
                                      <Button
                                        type="text"
                                        icon={<MoreVertical size={18} />}
                                        className="text-gray-400 hover:text-gray-700"
                                      />
                                    </Dropdown>
                                  </div>
                                </div>
                                {item.status === "scheduled" &&
                                  now.isAfter(dayjs(item.departureAt)) &&
                                  !now.isAfter(dayjs(item.departureAt).add(45, "minute")) && (
                                    <Tag
                                      color="error"
                                      className="rounded-full px-3 py-1 font-semibold text-xs m-0 self-start"
                                    >
                                      TIME IS UP — START NOW
                                    </Tag>
                                  )}
                                {isExpired(item) && (
                                  <Tag
                                    color="default"
                                    className="rounded-full px-3 py-1 font-semibold text-xs m-0 self-start"
                                  >
                                    EXPIRED
                                  </Tag>
                                )}
                              </div>

                              <div className="flex items-stretch gap-4">
                                <div className="flex flex-col items-center justify-between py-1 w-6">
                                  <div className="w-3 h-3 rounded-full border-2 border-primary bg-white z-10"></div>
                                  <div className="w-0.5 bg-gray-200 flex-1 my-1"></div>
                                  <div className="w-3 h-3 rounded-full bg-primary z-10"></div>
                                </div>
                                <div className="flex-1 flex flex-col justify-between py-0.5 gap-4">
                                  <div>
                                    <Text className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-0.5">
                                      Origin
                                    </Text>
                                    <Text strong className="text-base text-gray-800 line-clamp-1">
                                      {item.fromLocation}
                                    </Text>
                                  </div>
                                  <div>
                                    <Text className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-0.5">
                                      Destination
                                    </Text>
                                    <Text strong className="text-base text-gray-800 line-clamp-1">
                                      {item.toLocation}
                                    </Text>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                <div className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
                                  <User size={16} />
                                  <span className="whitespace-nowrap">
                                    {item.totalSeats} seats total
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                  {(() => {
                                    const s = startTripState(item, now);
                                    if (!s.show) return null;
                                    return (
                                      <Button
                                        type="primary"
                                        size="small"
                                        icon={<PlayCircle size={14} />}
                                        loading={tripActionLoading === item.id}
                                        disabled={!s.enabled}
                                        className="rounded-xl bg-emerald-500 border-none disabled:opacity-60"
                                        onClick={() => handleStartTrip(item.id)}
                                      >
                                        {s.label}
                                      </Button>
                                    );
                                  })()}
                                  {item.status === "in_progress" && (
                                    <Button
                                      type="primary"
                                      size="small"
                                      danger
                                      icon={<FlagTriangleRight size={14} />}
                                      loading={tripActionLoading === item.id}
                                      className="rounded-xl"
                                      onClick={() => handleEndTrip(item.id)}
                                    >
                                      End Trip
                                    </Button>
                                  )}
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<Share2 size={15} />}
                                    className="p-0 text-gray-500 hover:text-primary flex items-center gap-1"
                                    onClick={() => handleShareTrip(item)}
                                  >
                                    Share
                                  </Button>
                                  <Button
                                    type="link"
                                    className="p-0 text-primary font-medium group-hover:underline"
                                    onClick={() => setManagingTripId(item.id)}
                                  >
                                    Manage Passengers
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-6">
                      <Title level={4} style={{ margin: 0 }}>
                        Quick Access
                      </Title>
                      <div className="grid grid-cols-3 gap-3">
                        <Card
                          hoverable
                          styles={{ body: { padding: "16px 8px" } }}
                          className="rounded-2xl border border-white/60 shadow-soft text-center group bg-white/60 hover:bg-white transition-all"
                          onClick={() => {
                            setEditingTripId(null);
                            setIsEditingTrip(false);
                            form.resetFields();
                            setSelectedFrom(null);
                            setSelectedTo(null);
                            setShowTripForm(false);
                            setActiveModule("trips");
                          }}
                        >
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-3xl bg-purple-100 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all group-hover:scale-110 duration-300 shrink-0">
                              <PlusCircle size={20} />
                            </div>
                            <Text strong className="text-xs sm:text-sm leading-tight">
                              Host a Ride
                            </Text>
                          </div>
                        </Card>
                        <Card
                          hoverable
                          styles={{ body: { padding: "16px 8px" } }}
                          className="rounded-2xl border border-white/60 shadow-soft text-center group bg-white/60 hover:bg-white transition-all"
                          onClick={() => setActiveModule("history")}
                        >
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-3xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all group-hover:scale-110 duration-300 shrink-0">
                              <History size={20} />
                            </div>
                            <Text strong className="text-xs sm:text-sm leading-tight">
                              History
                            </Text>
                          </div>
                        </Card>
                        <Card
                          hoverable
                          styles={{ body: { padding: "16px 8px" } }}
                          className="rounded-2xl border border-white/60 shadow-soft text-center group bg-white/60 hover:bg-white transition-all"
                          onClick={() => setActiveModule("settings")}
                        >
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-3xl bg-gray-100 text-gray-600 flex items-center justify-center group-hover:bg-gray-600 group-hover:text-white transition-all group-hover:scale-110 duration-300 shrink-0">
                              <Settings size={20} />
                            </div>
                            <Text strong className="text-xs sm:text-sm leading-tight">
                              Vehicle Settings
                            </Text>
                          </div>
                        </Card>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeModule === "trips" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  {!showTripForm ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <Title level={2} style={{ margin: 0 }}>
                            Upcoming Trips
                          </Title>
                          <Text type="secondary" className="text-lg">
                            View and manage your scheduled upcoming trips.
                          </Text>
                        </div>
                        <Button
                          type="primary"
                          size="large"
                          icon={<Plus size={18} />}
                          className="bg-gradient-primary border-none rounded-3xl"
                          onClick={openWizard}
                        >
                          Add New Trip
                        </Button>
                      </div>

                      {/* Desktop Table View */}
                      <Card className="rounded-2xl border border-white/60 shadow-card bg-white/80 backdrop-blur-md overflow-x-auto hidden lg:block">
                        <Table
                          columns={[
                            {
                              title: "From",
                              dataIndex: "fromLocation",
                              key: "from",
                              width: "15%",
                              render: (text) => (
                                <Text strong className="line-clamp-1">
                                  {text}
                                </Text>
                              ),
                            },
                            {
                              title: "To",
                              dataIndex: "toLocation",
                              key: "to",
                              width: "15%",
                              render: (text) => (
                                <Text strong className="line-clamp-1">
                                  {text}
                                </Text>
                              ),
                            },
                            {
                              title: "Departure",
                              dataIndex: "departureAt",
                              key: "departure",
                              width: "18%",
                              render: (date) => (
                                <Text className="text-sm">
                                  {dayjs(date).format("MMM D, YYYY")}
                                  <br />
                                  <span className="text-gray-500">
                                    {dayjs(date).format("h:mm A")}
                                  </span>
                                </Text>
                              ),
                            },
                            {
                              title: "Price",
                              dataIndex: "totalPrice",
                              key: "price",
                              width: "12%",
                              align: "right" as const,
                              render: (price) => (
                                <Text strong className="text-emerald-600">
                                  ₹{price?.toLocaleString("en-IN")}
                                </Text>
                              ),
                            },
                            {
                              title: "Status",
                              dataIndex: "status",
                              key: "status",
                              width: "12%",
                              render: (status) => (
                                <Tag
                                  color={
                                    status === "in_progress"
                                      ? "processing"
                                      : status === "completed"
                                        ? "success"
                                        : status === "cancelled"
                                          ? "error"
                                          : "blue"
                                  }
                                  className="rounded-full"
                                >
                                  {status?.toUpperCase().replace("_", " ")}
                                </Tag>
                              ),
                            },
                            {
                              title: "Actions",
                              key: "actions",
                              width: "18%",
                              align: "right" as const,
                              render: (_, trip) => {
                                const seatsBooked = bookings
                                  .filter((b) => b.tripId === trip.id && b.status !== "cancelled")
                                  .reduce((sum, b) => sum + (b.seatsBooked || 0), 0);
                                return (
                                  <Space size="small">
                                    <Button
                                      type="link"
                                      size="small"
                                      className="text-primary font-medium p-0"
                                      onClick={() => setManagingTripId(trip.id)}
                                    >
                                      View
                                    </Button>
                                    <Button
                                      type="link"
                                      size="small"
                                      icon={<Share2 size={14} />}
                                      className="text-gray-500 hover:text-primary font-medium p-0"
                                      onClick={() => handleShareTrip(trip)}
                                    >
                                      Share
                                    </Button>
                                    {seatsBooked === 0 && (
                                      <Popconfirm
                                        title="Cancel Trip"
                                        description="Are you sure you want to cancel this trip? This action cannot be undone."
                                        onConfirm={async () => {
                                          try {
                                            await updateTrip(trip.id, {
                                              status: "cancelled",
                                            });
                                            message.success("Trip cancelled successfully");
                                            queryClient.invalidateQueries({
                                              queryKey: ["host-trips"],
                                            });
                                          } catch (err) {
                                            console.error("[CancelTrip] Error:", err);
                                            message.error("Failed to cancel trip");
                                          }
                                        }}
                                        okText="Yes, Cancel"
                                        cancelText="Keep Trip"
                                        okButtonProps={{ danger: true }}
                                      >
                                        <Button type="link" size="small" danger className="p-0">
                                          Cancel
                                        </Button>
                                      </Popconfirm>
                                    )}
                                  </Space>
                                );
                              },
                            },
                          ]}
                          dataSource={sortedTrips}
                          loading={tripsLoading}
                          rowKey="id"
                          scroll={{ x: 600 }}
                          pagination={{
                            pageSize: 10,
                            total: sortedTrips.length,
                            showSizeChanger: true,
                            showTotal: (total) => `Total ${total} trips`,
                            responsive: true,
                          }}
                          locale={{
                            emptyText: (
                              <div className="py-8 text-center">
                                <RouteIcon size={32} className="text-gray-300 mx-auto mb-3" />
                                <Text type="secondary" className="block">
                                  No upcoming trips
                                </Text>
                              </div>
                            ),
                          }}
                        />
                      </Card>

                      {/* Mobile Card View */}
                      <div className="lg:hidden space-y-4">
                        {tripsLoading ? (
                          <div className="flex justify-center py-12">
                            <Spin size="large" />
                          </div>
                        ) : sortedTrips.length === 0 ? (
                          <Card className="rounded-2xl border border-white/60 shadow-card bg-white/80 backdrop-blur-md p-8 text-center">
                            <RouteIcon size={32} className="text-gray-300 mx-auto mb-3" />
                            <Text type="secondary" className="block">
                              No trips published yet
                            </Text>
                          </Card>
                        ) : (
                          sortedTrips.map((trip) => {
                            const seatsBooked = bookings
                              .filter((b) => b.tripId === trip.id && b.status !== "cancelled")
                              .reduce((sum, b) => sum + (b.seatsBooked || 0), 0);
                            return (
                              <Card
                                key={trip.id}
                                onClick={() => setManagingTripId(trip.id)}
                                className="rounded-2xl border border-white/60 shadow-card bg-white/80 backdrop-blur-md p-3 cursor-pointer transition-transform active:scale-[0.99]"
                              >
                                <div className="space-y-2">
                                  {/* Active toggle — pause a trip without cancelling it */}
                                  <div
                                    className="flex items-center justify-between"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span
                                      className={`text-[11px] font-bold uppercase tracking-wider ${trip.active !== false ? "text-emerald-600" : "text-gray-400"}`}
                                    >
                                      {trip.active !== false ? "Active" : "Paused"}
                                    </span>
                                    <Switch
                                      size="small"
                                      checked={trip.active !== false}
                                      onChange={(checked) => toggleTripActive(trip.id, checked)}
                                    />
                                  </div>
                                  {/* Route */}
                                  <div className="flex items-center gap-2">
                                    <Text strong className="flex-1 line-clamp-1 text-gray-900">
                                      {trip.fromLocation}
                                    </Text>
                                    <ArrowRight size={16} className="text-gray-400" />
                                    <Text strong className="flex-1 line-clamp-1 text-gray-900">
                                      {trip.toLocation}
                                    </Text>
                                  </div>

                                  {/* Departure & Price */}
                                  <div className="flex items-center justify-between gap-4 py-2 border-y border-gray-100">
                                    <div>
                                      <Text className="text-sm font-semibold text-gray-900">
                                        {dayjs(trip.departureAt).format("MMM D, YYYY")}
                                      </Text>
                                      <Text className="block text-xs text-gray-500">
                                        {dayjs(trip.departureAt).format("h:mm A")}
                                      </Text>
                                    </div>
                                    <Text
                                      strong
                                      className="text-emerald-600 text-lg whitespace-nowrap"
                                    >
                                      ₹{trip.totalPrice?.toLocaleString("en-IN")}
                                    </Text>
                                  </div>

                                  {/* Status & Seats */}
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                      {trip.status === "scheduled" &&
                                      now.isAfter(dayjs(trip.departureAt)) &&
                                      !now.isAfter(dayjs(trip.departureAt).add(45, "minute")) ? (
                                        <Tag
                                          color="error"
                                          className="rounded-full m-0 font-semibold whitespace-nowrap"
                                        >
                                          TIME IS UP — START NOW
                                        </Tag>
                                      ) : isExpired(trip) ? (
                                        <Tag
                                          color="default"
                                          className="rounded-full m-0 font-semibold whitespace-nowrap"
                                        >
                                          EXPIRED
                                        </Tag>
                                      ) : (
                                        <Tag
                                          color={
                                            trip.status === "in_progress"
                                              ? "processing"
                                              : trip.status === "completed"
                                                ? "success"
                                                : trip.status === "cancelled"
                                                  ? "error"
                                                  : "blue"
                                          }
                                          className="rounded-full m-0 whitespace-nowrap"
                                        >
                                          {trip.status?.toUpperCase().replace("_", " ")}
                                        </Tag>
                                      )}
                                      {trip.totalSeats - seatsBooked <= 0 ? (
                                        <Text className="text-xs font-semibold text-red-500 whitespace-nowrap">
                                          Sold out
                                        </Text>
                                      ) : (
                                        <Text className="text-xs text-gray-500 whitespace-nowrap">
                                          {trip.totalSeats - seatsBooked} seats left
                                        </Text>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {(() => {
                                        const s = startTripState(trip, now);
                                        if (!s.show) return null;
                                        return (
                                          <Button
                                            type="primary"
                                            size="small"
                                            icon={<PlayCircle size={14} />}
                                            loading={tripActionLoading === trip.id}
                                            disabled={!s.enabled}
                                            className="rounded-xl bg-emerald-500 border-none disabled:opacity-60"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleStartTrip(trip.id);
                                            }}
                                          >
                                            {s.label}
                                          </Button>
                                        );
                                      })()}
                                      {trip.status === "in_progress" && (
                                        <Button
                                          type="primary"
                                          size="small"
                                          danger
                                          icon={<FlagTriangleRight size={14} />}
                                          loading={tripActionLoading === trip.id}
                                          className="rounded-xl"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEndTrip(trip.id);
                                          }}
                                        >
                                          End Trip
                                        </Button>
                                      )}
                                      <Button
                                        size="small"
                                        icon={<Share2 size={14} />}
                                        className="rounded-xl"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleShareTrip(trip);
                                        }}
                                      >
                                        Share
                                      </Button>
                                      {seatsBooked === 0 && (
                                        <Popconfirm
                                          title="Cancel Trip"
                                          description="Are you sure you want to cancel this trip?"
                                          onConfirm={async () => {
                                            try {
                                              await updateTrip(trip.id, {
                                                status: "cancelled",
                                              });
                                              message.success("Trip cancelled successfully");
                                              queryClient.invalidateQueries({
                                                queryKey: ["host-trips"],
                                              });
                                            } catch (err) {
                                              console.error("[CancelTrip] Error:", err);
                                              message.error("Failed to cancel trip");
                                            }
                                          }}
                                          okText="Yes"
                                          cancelText="No"
                                          okButtonProps={{ danger: true }}
                                        >
                                          <Button
                                            size="small"
                                            danger
                                            className="rounded-xl"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            Cancel
                                          </Button>
                                        </Popconfirm>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1">
                        <Title level={2} style={{ margin: 0 }}>
                          {isEditingTrip ? "Update Trip Details" : "Publish a New Trip"}
                        </Title>
                        <Text type="secondary" className="text-lg">
                          Enter your journey details below to offer seats on your upcoming journey.
                        </Text>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                        <Card className="rounded-2xl border border-white/60 shadow-card bg-white/80 backdrop-blur-md p-5 md:p-6 xl:col-span-2 relative overflow-hidden">
                          <Form
                            form={form}
                            layout="vertical"
                            onFinish={onFinish}
                            onValuesChange={() => {
                              setPendingTripPayload(null);
                              setSegmentPricePreview([]);
                            }}
                            initialValues={{
                              totalSeats: 3,
                              seatConfig: defaultOfferedSeatCodes(5) as SeatId[],
                              driverId: user?.$id,
                            }}
                            requiredMark={false}
                          >
                            <div className="space-y-5">
                              {/* Routing — replaces From/To/Departure/intermediate-stop inputs */}
                              <div>
                                {wizardResult ? (
                                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-3">
                                      <div className="flex flex-col items-center self-stretch py-1">
                                        <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                                        <div className="my-1 w-px flex-1 bg-gray-200" />
                                        <div className="h-2.5 w-2.5 rounded-full border-2 border-gray-300" />
                                      </div>
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <p className="truncate text-base font-bold text-gray-900">
                                          {wizardResult.from.label}
                                        </p>
                                        <p className="truncate text-base font-bold text-gray-500">
                                          {wizardResult.to.label}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                                      <div>
                                        <p className="font-bold text-gray-900">
                                          {dayjs(wizardResult.departureAt).format("MMM D, h:mm A")}
                                        </p>
                                        <p className="text-gray-500">Departure</p>
                                      </div>
                                      <div>
                                        <p className="font-bold text-gray-900">
                                          {wizardResult.totalDistanceKm.toFixed(1)} km
                                        </p>
                                        <p className="text-gray-500">Distance</p>
                                      </div>
                                      <div>
                                        <p className="font-bold text-gray-900">
                                          {wizardResult.stops.length}
                                        </p>
                                        <p className="text-gray-500">Stops</p>
                                      </div>
                                    </div>
                                    <div className="mt-4">
                                      <Button
                                        block
                                        size="large"
                                        onClick={() => setWizardOpen(true)}
                                        style={{ borderRadius: 12 }}
                                      >
                                        Edit
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setWizardOpen(true)}
                                    className="w-full rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-6 text-center transition-colors hover:border-primary/70 hover:bg-primary/10"
                                  >
                                    <div className="mb-1 inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-primary">
                                      <RouteIcon size={16} /> Plan your route
                                    </div>
                                    <p className="text-xs text-gray-600">
                                      Pick start &amp; end, choose the route on the map, set the
                                      time, and add boarding points.
                                    </p>
                                  </button>
                                )}
                                <Form.Item name="fromLocation" hidden rules={[{ required: true }]}>
                                  <Input />
                                </Form.Item>
                                <Form.Item name="toLocation" hidden rules={[{ required: true }]}>
                                  <Input />
                                </Form.Item>
                                <Form.Item name="departureAt" hidden rules={[{ required: true }]}>
                                  <DatePicker />
                                </Form.Item>
                              </div>

                              {/* Price Per Seat */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Form.Item
                                  label={
                                    <span className="font-semibold text-gray-700 text-sm">
                                      Price Per Seat (₹)
                                    </span>
                                  }
                                  name="totalTripPrice"
                                  rules={[{ required: true, message: "Please enter price" }]}
                                  className="mb-0"
                                >
                                  <InputNumber
                                    min={1}
                                    max={9999}
                                    precision={0}
                                    size="large"
                                    style={{ borderRadius: "8px", height: "44px", width: "100%" }}
                                    className="font-bold"
                                    prefix="₹"
                                    placeholder="0"
                                    onChange={(val) => {
                                      if (typeof val === "number" && val > 9999) {
                                        form.setFieldsValue({ totalTripPrice: 9999 });
                                      }
                                    }}
                                  />
                                </Form.Item>
                              </div>

                              {/* Row 3 – Vehicle + Driver */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Form.Item
                                  label={
                                    <span className="font-semibold text-gray-700 text-sm">
                                      Vehicle
                                    </span>
                                  }
                                  name="vehicleId"
                                  rules={[{ required: true, message: "Please select a vehicle" }]}
                                  className="mb-0"
                                >
                                  <Select
                                    size="large"
                                    placeholder="Choose vehicle"
                                    className="w-full"
                                    style={{ borderRadius: "8px", height: "44px" }}
                                    options={[
                                      ...vehicles.map((v) => ({
                                        label: `${v.modelName} · ${v.plateNumber.toUpperCase()} · ${v.seatCapacity} seats`,
                                        value: v.id,
                                      })),
                                      {
                                        label: (
                                          <span className="text-primary font-medium flex items-center gap-2">
                                            <Plus size={14} /> Add new vehicle
                                          </span>
                                        ),
                                        value: "ADD_NEW_VEHICLE",
                                      },
                                    ]}
                                    onChange={(val) => {
                                      if (val === "ADD_NEW_VEHICLE") {
                                        form.setFieldsValue({ vehicleId: undefined });
                                        setEditingVehicleId(null);
                                        vehicleForm.resetFields();
                                        setVehicleDrawerOpen(true);
                                        return;
                                      }
                                      const selectedVeh = vehicles.find((v) => v.id === val);
                                      if (selectedVeh) {
                                        const seatConfig = defaultOfferedSeatCodes(
                                          selectedVeh.seatCapacity,
                                        ) as SeatId[];
                                        form.setFieldsValue({
                                          seatConfig,
                                          totalSeats: seatConfig.length,
                                        });
                                      }
                                    }}
                                  />
                                </Form.Item>

                                <Form.Item
                                  label={
                                    <span className="font-semibold text-gray-700 text-sm">
                                      Driver
                                    </span>
                                  }
                                  name="driverId"
                                  rules={[{ required: true, message: "Please select a driver" }]}
                                  className="mb-0"
                                >
                                  <Select
                                    size="large"
                                    placeholder="Choose driver"
                                    className="w-full"
                                    style={{ borderRadius: "8px", height: "44px" }}
                                    options={[
                                      {
                                        label: `You (${user?.name?.split(" ")[0] || "Owner"})`,
                                        value: user?.$id || "",
                                      },
                                      ...teamDrivers.map((d) => ({
                                        label: `${d.fullName} · ${d.city}`,
                                        value: d.id,
                                      })),
                                    ]}
                                  />
                                </Form.Item>
                              </div>

                              {/* Row 4 – Seat Configuration (full width) */}
                              <div>
                                <span className="font-semibold text-gray-700 text-sm block mb-2">
                                  Configure Seating
                                </span>
                                <Form.Item
                                  name="seatConfig"
                                  rules={[
                                    { required: true, message: "Please select at least one seat" },
                                  ]}
                                  className="mb-0"
                                >
                                  <SeatPicker
                                    seatCapacity={formSeatCapacity}
                                    onChange={(seats) => {
                                      form.setFieldsValue({ totalSeats: seats.length });
                                    }}
                                  />
                                </Form.Item>
                                <Form.Item name="totalSeats" hidden>
                                  <InputNumber />
                                </Form.Item>
                              </div>

                              {renderSegmentPricePreview()}
                            </div>

                            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 pt-5 border-t border-gray-200">
                              <Button
                                type="text"
                                size="large"
                                className="h-14 px-8 w-full sm:w-auto font-bold text-gray-600 hover:bg-gray-100 transition-all"
                                style={{ borderRadius: "8px" }}
                                onClick={() => {
                                  setShowTripForm(false);
                                  form.resetFields();
                                  setEditingTripId(null);
                                  setIsEditingTrip(false);
                                  setSelectedFrom(null);
                                  setSelectedTo(null);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="primary"
                                htmlType="submit"
                                size="large"
                                loading={creating}
                                className="h-14 px-12 w-full sm:w-auto bg-gradient-primary border-none font-bold shadow-lg hover:shadow-xl transition-all hover:scale-[1.01]"
                                style={{ borderRadius: "8px" }}
                              >
                                {pendingTripPayload
                                  ? isEditingTrip
                                    ? "Confirm Update"
                                    : "Confirm & Publish"
                                  : "Calculate Route & Prices"}
                              </Button>
                            </div>
                          </Form>
                        </Card>

                        {/* Right Column: Live Preview Panel */}
                        <div className="hidden xl:block">
                          <div className="sticky top-24">
                            <Title level={5} className="mb-4 text-gray-600">
                              Live Preview
                            </Title>
                            <Card className="rounded-2xl border-none shadow-soft bg-white p-5">
                              {/* Earnings removed as per request */}

                              <div className="bg-gray-50 rounded-3xl p-4 border border-gray-100">
                                <Text
                                  type="secondary"
                                  className="text-xs block mb-3 font-semibold uppercase tracking-wider text-center"
                                >
                                  What travelers see
                                </Text>
                                <div className="flex items-center justify-between mb-4">
                                  <Tag
                                    color="purple"
                                    className="rounded-full border-none px-2 py-0.5 font-semibold text-[10px] m-0"
                                  >
                                    {form.getFieldValue("departureAt")
                                      ? dayjs(form.getFieldValue("departureAt")).format(
                                          "MMM D • h:mm A",
                                        )
                                      : "Select date"}
                                  </Tag>
                                  <Text strong className="text-lg text-emerald-600">
                                    ₹{totalPriceWatch || "—"}
                                  </Text>
                                </div>

                                <div className="flex items-stretch gap-3">
                                  <div className="flex flex-col items-center justify-between py-1 w-4">
                                    <div className="w-2.5 h-2.5 rounded-full border-2 border-primary bg-white z-10"></div>
                                    <div className="w-0.5 bg-gray-200 flex-1 my-1"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-primary z-10"></div>
                                  </div>
                                  <div className="flex-1 flex flex-col justify-between py-0.5 gap-3">
                                    <div>
                                      <Text strong className="text-sm text-gray-800 line-clamp-1">
                                        {form.getFieldValue("fromLocation") || "Origin"}
                                      </Text>
                                    </div>
                                    <div>
                                      <Text strong className="text-sm text-gray-800 line-clamp-1">
                                        {form.getFieldValue("toLocation") || "Destination"}
                                      </Text>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                                  <div className="flex items-center gap-1.5">
                                    <User size={14} />
                                    <span>{seatsWatch || 4} seats</span>
                                  </div>
                                  <div className="flex gap-0.5">
                                    {[...Array(Math.min(Number(seatsWatch) || 4, 10))].map(
                                      (_, i) => (
                                        <div
                                          key={i}
                                          className="w-2 h-2 rounded-full bg-primary/20"
                                        ></div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Card>
                          </div>
                        </div>

                        {/* Mobile Preview Drawer */}
                        <Drawer
                          title="Live Preview"
                          placement="bottom"
                          onClose={() => setMobilePreviewOpen(false)}
                          open={mobilePreviewOpen}
                          height="auto"
                          className="rounded-t-3xl"
                          styles={{ body: { padding: "20px" } }}
                        >
                          <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 shadow-sm mb-4">
                            <Text
                              type="secondary"
                              className="text-xs block mb-4 font-semibold uppercase tracking-wider text-center"
                            >
                              What travelers see
                            </Text>
                            <div className="flex items-center justify-between mb-5">
                              <Tag
                                color="purple"
                                className="rounded-full border-none px-3 py-1 font-semibold text-xs m-0"
                              >
                                {form.getFieldValue("departureAt")
                                  ? dayjs(form.getFieldValue("departureAt")).format(
                                      "MMM D • h:mm A",
                                    )
                                  : "Select date"}
                              </Tag>
                              <Text strong className="text-xl text-emerald-600">
                                ₹{totalPriceWatch || "—"}
                              </Text>
                            </div>

                            <div className="flex items-stretch gap-4">
                              <div className="flex flex-col items-center justify-between py-1 w-5">
                                <div className="w-3 h-3 rounded-full border-2 border-primary bg-white z-10"></div>
                                <div className="w-0.5 bg-gray-200 flex-1 my-1"></div>
                                <div className="w-3 h-3 rounded-full bg-primary z-10"></div>
                              </div>
                              <div className="flex-1 flex flex-col justify-between py-0.5 gap-4">
                                <div>
                                  <Text strong className="text-base text-gray-800 line-clamp-1">
                                    {form.getFieldValue("fromLocation") || "Origin"}
                                  </Text>
                                </div>
                                <div>
                                  <Text strong className="text-base text-gray-800 line-clamp-1">
                                    {form.getFieldValue("toLocation") || "Destination"}
                                  </Text>
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
                              <div className="flex items-center gap-1.5">
                                <User size={16} />
                                <span>{seatsWatch || 4} seats</span>
                              </div>
                              <div className="flex gap-1">
                                {[...Array(Math.min(Number(seatsWatch) || 4, 10))].map((_, i) => (
                                  <div
                                    key={i}
                                    className="w-2.5 h-2.5 rounded-full bg-primary/20"
                                  ></div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <Button
                            type="primary"
                            block
                            size="large"
                            className="h-14 rounded-3xl bg-gradient-primary border-none font-bold shadow-glow"
                            onClick={() => {
                              setMobilePreviewOpen(false);
                              form.submit();
                            }}
                            loading={creating}
                          >
                            Publish Now
                          </Button>
                        </Drawer>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeModule === "history" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex flex-col gap-1">
                    <Title level={2} style={{ margin: 0 }}>
                      Ride History
                    </Title>
                    <Text type="secondary" className="text-lg">
                      Review completed and cancelled trips from the past.
                    </Text>
                  </div>

                  {/* Compact two-stat strip — saves vertical space vs. two tall cards. */}
                  <Card
                    className="rounded-2xl border border-white/60 shadow-soft backdrop-blur-md overflow-hidden"
                    styles={{ body: { padding: 0 } }}
                  >
                    <div className="grid grid-cols-2 divide-x divide-gray-100">
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="p-2 bg-emerald-100 rounded-2xl text-emerald-600 shrink-0">
                          <Banknote size={18} />
                        </div>
                        <div className="min-w-0">
                          <Text
                            type="secondary"
                            className="block text-xs font-medium text-emerald-800"
                          >
                            Earnings
                          </Text>
                          <p className="m-0 text-xl font-extrabold text-emerald-900 leading-tight">
                            ₹{lifetimeEarnings.toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="p-2 bg-purple-100 rounded-2xl text-purple-600 shrink-0">
                          <CheckCircle size={18} />
                        </div>
                        <div className="min-w-0">
                          <Text
                            type="secondary"
                            className="block text-xs font-medium text-purple-800"
                          >
                            Rides
                          </Text>
                          <p className="m-0 text-xl font-extrabold text-purple-900 leading-tight">
                            {tripsLoading ? <Spin size="small" /> : completedTrips.length}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="rounded-2xl border border-white/60 shadow-card bg-white/80 backdrop-blur-md overflow-hidden">
                    {/* Header — stacks on mobile, row on sm+ */}
                    <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Title level={5} style={{ margin: 0 }}>
                        Transaction Ledger
                      </Title>
                      <div className="flex gap-2">
                        {(["all", "completed", "cancelled"] as const).map((f) => (
                          <Tag
                            key={f}
                            color={historyFilter === f ? "purple" : undefined}
                            className={`px-3 py-1 rounded-full cursor-pointer text-xs font-semibold m-0 capitalize transition-all ${historyFilter === f ? "border-primary" : "bg-white border-gray-200 text-gray-500 hover:border-primary/40"}`}
                            onClick={() => setHistoryFilter(f)}
                          >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                          </Tag>
                        ))}
                      </div>
                    </div>

                    <List
                      className="p-0"
                      itemLayout="horizontal"
                      loading={tripsLoading}
                      locale={{ emptyText: "No past trips found" }}
                      dataSource={filteredHistory}
                      renderItem={(trip) => (
                        <List.Item
                          className="px-5 py-4 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 cursor-pointer"
                          onClick={() => {
                            setHistoryDetailTripId(trip.id);
                            setHistoryDetailPassenger(null);
                          }}
                        >
                          <div className="w-full flex items-center justify-between gap-3">
                            {/* Left: icon + route + date */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center ${
                                  trip.status === "completed"
                                    ? "bg-emerald-100 text-emerald-600"
                                    : trip.status === "cancelled"
                                      ? "bg-red-100 text-red-600"
                                      : "bg-blue-100 text-blue-600"
                                }`}
                              >
                                {trip.status === "completed" ? (
                                  <CheckCircle size={18} />
                                ) : trip.status === "cancelled" ? (
                                  <XCircle size={18} />
                                ) : (
                                  <RouteIcon size={18} />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">
                                  {trip.fromLocation.split(",")[0]} →{" "}
                                  {trip.toLocation.split(",")[0]}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {dayjs(trip.departureAt).format("MMM D, YYYY · h:mm A")}
                                </p>
                              </div>
                            </div>
                            {/* Right: price + status */}
                            <div className="flex flex-col items-end shrink-0 gap-1">
                              <span
                                className={`text-sm font-black tabular-nums ${trip.status === "completed" ? "text-emerald-600" : "text-gray-400"}`}
                              >
                                ₹
                                {hostNetEarnings(receivedByTrip.get(trip.id) ?? 0).toLocaleString(
                                  "en-IN",
                                )}
                              </span>
                              {(() => {
                                const s = hostTripStatusDisplay(trip, isExpired(trip));
                                return (
                                  <Tag
                                    color={s.color}
                                    className="m-0 rounded-full border-none px-2 uppercase text-[9px] tracking-wider font-bold"
                                  >
                                    {s.label}
                                  </Tag>
                                );
                              })()}
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  </Card>
                </div>
              )}

              {/* ── History Trip Detail Drawer ── */}
              {(() => {
                const detailTrip = historyDetailTripId
                  ? (filteredHistory.find((t) => t.id === historyDetailTripId) ??
                    pastTrips.find((t) => t.id === historyDetailTripId))
                  : null;
                const tripBookings = historyDetailTripId
                  ? bookings.filter((b) => b.tripId === historyDetailTripId)
                  : [];
                const received = hostNetEarnings(
                  tripBookings
                    .filter((b) => b.status !== "cancelled")
                    .reduce((s, b) => s + b.segmentPrice * b.seatsBooked, 0),
                );
                const seatsBooked = tripBookings
                  .filter((b) => b.status !== "cancelled")
                  .reduce((s, b) => s + b.seatsBooked, 0);

                return (
                  <Drawer
                    open={!!historyDetailTripId}
                    onClose={() => {
                      setHistoryDetailTripId(null);
                      setHistoryDetailPassenger(null);
                    }}
                    placement="bottom"
                    height="85vh"
                    styles={{
                      body: { padding: 0, overflowY: "auto" },
                      header: { display: "none" },
                    }}
                    className="rounded-t-3xl overflow-hidden"
                  >
                    {detailTrip && !historyDetailPassenger && (
                      <div className="flex flex-col h-full" style={{ fontFamily: APP_FONT_FAMILY }}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
                          <div className="min-w-0">
                            <p className="text-base font-black text-gray-900 truncate">
                              {detailTrip.fromLocation.split(",")[0]} →{" "}
                              {detailTrip.toLocation.split(",")[0]}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {dayjs(detailTrip.departureAt).format("ddd, MMM D · h:mm A")}
                              {detailTrip.totalDistanceKm
                                ? ` · ${detailTrip.totalDistanceKm} km`
                                : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {(() => {
                              const s = hostTripStatusDisplay(detailTrip, isExpired(detailTrip));
                              return (
                                <Tag
                                  color={s.color}
                                  className="m-0 rounded-full border-none capitalize text-xs font-bold px-3"
                                >
                                  {s.label}
                                </Tag>
                              );
                            })()}
                            <button
                              onClick={() => {
                                setHistoryDetailTripId(null);
                                setHistoryDetailPassenger(null);
                              }}
                              className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                            >
                              <XCircle size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                          {/* Route stops */}
                          {historyStopsLoading ? (
                            <div className="flex justify-center py-6">
                              <Spin />
                            </div>
                          ) : (
                            historyDetailStops.length > 0 && (
                              <div className="px-5 py-4 border-b border-gray-100">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                                  Route
                                </p>
                                <div className="space-y-0">
                                  {historyDetailStops
                                    .slice()
                                    .sort((a, b) => a.stopIndex - b.stopIndex)
                                    .map((stop, i, arr) => (
                                      <div key={stop.id} className="flex items-start gap-3">
                                        <div className="flex flex-col items-center">
                                          <div
                                            className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${i === 0 ? "bg-emerald-500" : i === arr.length - 1 ? "bg-rose-500" : "bg-amber-400"}`}
                                          />
                                          {i < arr.length - 1 && (
                                            <div className="w-px flex-1 min-h-[1.5rem] bg-gray-200 my-1" />
                                          )}
                                        </div>
                                        <div className="pb-2 min-w-0">
                                          <p className="text-sm font-semibold text-gray-800 leading-tight">
                                            {stop.location}
                                          </p>
                                          {stop.distanceFromOriginKm > 0 && (
                                            <p className="text-xs text-gray-400">
                                              {stop.distanceFromOriginKm} km from start
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )
                          )}

                          {/* Passengers */}
                          <div className="px-5 py-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                              Passengers ({tripBookings.length})
                            </p>
                            {tripBookings.length === 0 ? (
                              <p className="text-sm text-gray-400">No bookings for this trip.</p>
                            ) : (
                              <div className="space-y-2">
                                {tripBookings.map((b) => {
                                  const nameParts = (b.passengerName || "")
                                    .split("|")
                                    .map((s) => s.trim());
                                  const primaryName =
                                    nameParts[0]?.replace(/^Seat\s+[^:]+:\s*/i, "") || "Passenger";
                                  return (
                                    <button
                                      key={b.id}
                                      type="button"
                                      onClick={() => setHistoryDetailPassenger(b)}
                                      className="w-full flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 hover:bg-primary/5 hover:border-primary/20 transition-colors text-left"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                                          {primaryName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-sm font-bold text-gray-800 truncate">
                                            {primaryName}
                                            {nameParts.length > 1
                                              ? ` +${nameParts.length - 1}`
                                              : ""}
                                          </p>
                                          <p className="text-xs text-gray-400">
                                            {b.seatsBooked} seat{b.seatsBooked > 1 ? "s" : ""} · ₹
                                            {b.segmentPrice}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <Tag
                                          color={
                                            b.status === "confirmed" || b.status === "completed"
                                              ? "success"
                                              : b.status === "cancelled"
                                                ? "error"
                                                : "processing"
                                          }
                                          className="m-0 rounded-full border-none capitalize text-[10px] font-bold px-2"
                                        >
                                          {b.status}
                                        </Tag>
                                        <ArrowRight size={14} className="text-gray-300" />
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Revenue footer */}
                        <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-between bg-white">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                              Net earnings
                            </p>
                            <p className="text-xl font-black text-emerald-600">
                              ₹{received.toLocaleString("en-IN")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                              Seats filled
                            </p>
                            <p className="text-xl font-black text-gray-700">
                              {seatsBooked} / {detailTrip.totalSeats ?? "–"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Passenger detail view */}
                    {historyDetailPassenger &&
                      (() => {
                        const b = historyDetailPassenger;
                        const passengers = getBookingPassengers(b);
                        const fromStop = historyDetailStops.find(
                          (s) => s.stopIndex === b.fromStopIndex,
                        );
                        const toStop = historyDetailStops.find(
                          (s) => s.stopIndex === b.toStopIndex,
                        );
                        return (
                          <div
                            className="flex flex-col h-full"
                            style={{ fontFamily: APP_FONT_FAMILY }}
                          >
                            {/* Header */}
                            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
                              <button
                                onClick={() => setHistoryDetailPassenger(null)}
                                className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-600"
                              >
                                <ArrowRight size={16} className="rotate-180" />
                              </button>
                              <p className="text-base font-black text-gray-900 flex-1">
                                Passenger Details
                              </p>
                              <button
                                onClick={() => {
                                  setHistoryDetailTripId(null);
                                  setHistoryDetailPassenger(null);
                                }}
                                className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-500"
                              >
                                <XCircle size={16} />
                              </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                              {/* Passengers list */}
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                                  Passengers ({passengers.length})
                                </p>
                                <div className="space-y-2">
                                  {passengers.map((p, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                                          {p.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-sm font-bold text-gray-800 truncate">
                                            {p.name}
                                          </p>
                                          <p className="text-xs text-gray-400">{p.phone}</p>
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-end gap-1">
                                        <span className="text-xs font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5 shrink-0">
                                          {passengerSeatLabel(p.seatCode)}
                                        </span>
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                            passengerGenderTone(p.gender) === "male"
                                              ? "bg-blue-50 text-blue-700"
                                              : passengerGenderTone(p.gender) === "female"
                                                ? "bg-pink-50 text-pink-700"
                                                : "bg-gray-100 text-gray-500"
                                          }`}
                                        >
                                          {passengerGenderLabel(p.gender)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Segment */}
                              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                  Booking details
                                </p>
                                {fromStop && toStop && (
                                  <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                                    <span>{fromStop.location.split(",")[0]}</span>
                                    <ArrowRight size={14} className="text-gray-300 shrink-0" />
                                    <span>{toStop.location.split(",")[0]}</span>
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <p className="text-xs text-gray-400">Seats</p>
                                    <p className="font-bold text-gray-800">{b.seatsBooked}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400">Amount paid</p>
                                    <p className="font-bold text-emerald-600">
                                      ₹{b.segmentPrice * b.seatsBooked}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400">Status</p>
                                    <Tag
                                      color={
                                        b.status === "confirmed" || b.status === "completed"
                                          ? "success"
                                          : b.status === "cancelled"
                                            ? "error"
                                            : "processing"
                                      }
                                      className="m-0 rounded-full border-none capitalize text-[10px] font-bold px-2"
                                    >
                                      {b.status}
                                    </Tag>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400">Booked on</p>
                                    <p className="font-bold text-gray-800 text-xs">
                                      {dayjs(b.createdAt).format("MMM D · h:mm A")}
                                    </p>
                                  </div>
                                </div>
                                {b.otp && (
                                  <div className="border-t border-gray-100 pt-3">
                                    <p className="text-xs text-gray-400 mb-1">Boarding OTP</p>
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono text-2xl font-black tracking-[0.4rem] text-gray-900">
                                        {b.otp}
                                      </span>
                                      {b.verified && (
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                                          <CheckCircle size={10} /> Verified
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                  </Drawer>
                );
              })()}

              {/* — DRIVERS MODULE — */}
              {activeModule === "drivers" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <Title level={2} style={{ margin: 0 }}>
                        Drivers
                      </Title>
                      <Text type="secondary" className="text-lg">
                        Manage your team of drivers.
                      </Text>
                    </div>
                    <Button
                      type="primary"
                      icon={<Plus size={16} />}
                      size="large"
                      className="bg-gradient-primary border-none rounded-3xl font-bold shadow-glow flex items-center gap-2"
                      onClick={() => {
                        setEditingDriverId(null);
                        driverForm.resetFields();
                        setDriverDrawerOpen(true);
                      }}
                    >
                      Add Driver
                    </Button>
                  </div>

                  {driversLoading ? (
                    <div className="flex justify-center py-16">
                      <Spin size="large" />
                    </div>
                  ) : teamDrivers.length === 0 ? (
                    <Card className="rounded-2xl border border-white/60 shadow-soft bg-white/80 backdrop-blur-md text-center py-16">
                      <Users2 size={48} className="mx-auto text-gray-300 mb-4" />
                      <Text type="secondary" className="text-lg block">
                        No team drivers yet.
                      </Text>
                      <Text type="secondary" className="text-sm">
                        Add drivers who operate under your account.
                      </Text>
                      <div className="mt-6">
                        <Button
                          type="primary"
                          icon={<Plus size={16} />}
                          className="bg-gradient-primary border-none rounded-3xl"
                          onClick={() => {
                            setEditingDriverId(null);
                            driverForm.resetFields();
                            setDriverDrawerOpen(true);
                          }}
                        >
                          Add first driver
                        </Button>
                      </div>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {teamDrivers.map((d) => (
                        <Card
                          key={d.id}
                          className="rounded-2xl border border-white/60 shadow-soft bg-white/80 backdrop-blur-md hover:shadow-card transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white font-bold text-xl shrink-0">
                              {d.fullName[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-800 text-base truncate">
                                {d.fullName}
                              </p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                <span className="text-xs text-gray-500">{d.phone}</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-xs text-gray-500">{d.city}</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-xs text-gray-500 font-mono">
                                  {d.licenseNumber}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1.5">
                                <Switch
                                  size="small"
                                  checked={d.active !== false}
                                  onChange={(checked) => toggleDriverActive(d.id, checked)}
                                />
                                <span
                                  className={`hidden sm:inline text-[11px] font-bold uppercase tracking-wider ${d.active !== false ? "text-emerald-600" : "text-gray-400"}`}
                                >
                                  {d.active !== false ? "Active" : "Off"}
                                </span>
                              </div>
                              <Button
                                size="small"
                                icon={<Pencil size={14} />}
                                className="rounded-3xl"
                                onClick={() => {
                                  setEditingDriverId(d.id);
                                  driverForm.setFieldsValue({
                                    fullName: d.fullName,
                                    email: d.email,
                                    phone: d.phone,
                                    licenseNumber: d.licenseNumber,
                                    city: d.city,
                                  });
                                  setDriverDrawerOpen(true);
                                }}
                              />
                              <Popconfirm
                                title="Remove this driver?"
                                onConfirm={() => removeDriver(d.id)}
                                okText="Remove"
                                okButtonProps={{ danger: true }}
                              >
                                <Button
                                  size="small"
                                  danger
                                  icon={<Trash2 size={14} />}
                                  className="rounded-3xl"
                                />
                              </Popconfirm>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* — PAYOUTS MODULE — */}
              {activeModule === "payouts" && <PayoutsPanel />}

              {/* — VEHICLE FLEET MODULE — */}
              {activeModule === "settings" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <Title level={2} style={{ margin: 0 }}>
                        Vehicle Fleet
                      </Title>
                      <Text type="secondary" className="text-lg">
                        Manage all your registered vehicles.
                      </Text>
                    </div>
                    <Button
                      type="primary"
                      icon={<Plus size={16} />}
                      size="large"
                      className="bg-gradient-primary border-none rounded-3xl font-bold shadow-glow flex items-center gap-2"
                      onClick={() => {
                        setEditingVehicleId(null);
                        vehicleForm.resetFields();
                        setVehicleDrawerOpen(true);
                      }}
                    >
                      Add Vehicle
                    </Button>
                  </div>

                  {vehiclesLoading ? (
                    <div className="flex justify-center py-16">
                      <Spin size="large" />
                    </div>
                  ) : vehicles.length === 0 ? (
                    <Card className="rounded-2xl border border-white/60 shadow-soft bg-white/80 backdrop-blur-md text-center py-16">
                      <Car size={48} className="mx-auto text-gray-300 mb-4" />
                      <Text type="secondary" className="text-lg block">
                        No vehicles registered yet.
                      </Text>
                      <Text type="secondary" className="text-sm">
                        Add your first vehicle to start hosting trips.
                      </Text>
                      <div className="mt-6">
                        <Button
                          type="primary"
                          icon={<Plus size={16} />}
                          className="bg-gradient-primary border-none rounded-3xl"
                          onClick={() => {
                            setEditingVehicleId(null);
                            vehicleForm.resetFields();
                            setVehicleDrawerOpen(true);
                          }}
                        >
                          Add vehicle
                        </Button>
                      </div>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {vehicles.map((v) => (
                        <div
                          key={v.id}
                          className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden group"
                        >
                          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 pointer-events-none" />
                          <div className="flex justify-between items-start mb-4 relative z-10">
                            <div>
                              <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold">
                                Registered Vehicle
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <Switch
                                  size="small"
                                  checked={v.active}
                                  onChange={(checked) => toggleVehicleActive(v.id, checked)}
                                />
                                <span
                                  className={`text-xs font-bold uppercase tracking-wider ${v.active ? "text-emerald-400" : "text-gray-500"}`}
                                >
                                  {v.active ? "Active" : "Inactive"}
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="h-8 w-8 rounded-3xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                                onClick={() => {
                                  setEditingVehicleId(v.id);
                                  const parts = v.modelName.split(" ");
                                  vehicleForm.setFieldsValue({
                                    make: parts[0] ?? "",
                                    model: parts.slice(1).join(" ") || v.modelName,
                                    color: v.color ?? "",
                                    plate: v.plateNumber,
                                    seats: v.seatCapacity,
                                  });
                                  setVehicleDrawerOpen(true);
                                }}
                              >
                                <Pencil size={14} />
                              </button>
                              <Popconfirm
                                title="Remove this vehicle?"
                                onConfirm={() => removeVehicle(v.id)}
                                okText="Remove"
                                okButtonProps={{ danger: true }}
                              >
                                <button className="h-8 w-8 rounded-3xl bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              </Popconfirm>
                            </div>
                          </div>
                          <p className="text-xl font-bold relative z-10">{v.modelName}</p>
                          <p className="text-gray-400 text-sm relative z-10">
                            {v.color || "—"} · {v.seatCapacity} seats
                          </p>
                          <div className="mt-4 bg-white/10 rounded-2xl p-3 border border-white/10 relative z-10">
                            <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold mb-0.5">
                              Plate
                            </p>
                            <p className="text-white font-mono text-lg tracking-widest">
                              {v.plateNumber.toUpperCase()}
                            </p>
                            <p className="text-gray-400 font-mono text-xs tracking-widest mt-0.5">
                              {formatVehicleCode(v.plateNumber)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* — CUSTOMER HUB MODULE — */}
              {activeModule === "customers" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex flex-col gap-2">
                    <Title level={2} className="m-0">
                      Customer Hub
                    </Title>
                    <Text type="secondary" className="text-lg">
                      Manage relationships and feedback for your passengers.
                    </Text>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {bookingsLoading ? (
                      <div className="flex justify-center p-20 bg-white/40 rounded-3xl backdrop-blur-md">
                        <Spin size="large" tip="Loading customer directory..." />
                      </div>
                    ) : bookings.length === 0 ? (
                      <Card className="rounded-3xl border border-white/60 shadow-soft bg-white/60 backdrop-blur-md p-16 text-center">
                        <div className="mx-auto w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 mb-6">
                          <Users2 size={40} />
                        </div>
                        <Title level={3}>No customers yet</Title>
                        <Text type="secondary" className="text-lg block mb-8">
                          Your passengers will appear here once they start booking your trips.
                        </Text>
                        <Button
                          type="primary"
                          size="large"
                          onClick={() => {
                            setShowTripForm(false);
                            setActiveModule("trips");
                          }}
                          className="bg-gradient-primary border-none h-12 px-8 rounded-3xl font-bold"
                        >
                          Publish Your First Trip
                        </Button>
                      </Card>
                    ) : (
                      <div className="space-y-6">
                        {/* Grouping bookings by passenger */}
                        {Object.values(
                          bookings.reduce((acc: any, booking) => {
                            if (!acc[booking.travelerId]) {
                              acc[booking.travelerId] = {
                                travelerId: booking.travelerId,
                                name: booking.passengerName,
                                phone: booking.passengerPhone,
                                totalTrips: 0,
                                avgRating: 0,
                                ratingsCount: 0,
                                latestBookings: [],
                              };
                            }
                            acc[booking.travelerId].totalTrips += 1;
                            acc[booking.travelerId].latestBookings.push(booking);
                            if (booking.ratingByHost) {
                              acc[booking.travelerId].ratingsCount += 1;
                              acc[booking.travelerId].avgRating += booking.ratingByHost;
                            }
                            return acc;
                          }, {}),
                        ).map((customer: any) => {
                          const anyVerified = customer.latestBookings.some(
                            (b: Booking) => b.verified,
                          );
                          return (
                            <Card
                              key={customer.travelerId}
                              className="rounded-2xl border border-white/60 shadow-soft hover:shadow-card transition-all bg-white/80 backdrop-blur-md overflow-hidden"
                              bodyStyle={{ padding: 16 }}
                            >
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <Avatar
                                    size={44}
                                    className="bg-gradient-primary shadow-soft flex-shrink-0"
                                  >
                                    {customer.name[0]}
                                  </Avatar>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Title level={5} className="m-0">
                                        {customer.name}
                                      </Title>
                                      {anyVerified && (
                                        <Tag
                                          color="green"
                                          className="rounded-full px-2 border-none font-bold uppercase text-[10px] m-0"
                                        >
                                          Verified
                                        </Tag>
                                      )}
                                      {customer.totalTrips >= 3 && (
                                        <Tag
                                          color="gold"
                                          className="rounded-full px-2 border-none font-bold uppercase text-[10px] m-0"
                                        >
                                          Frequent
                                        </Tag>
                                      )}
                                      <div className="flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                                        <Star
                                          size={10}
                                          className="text-emerald-600 fill-emerald-600"
                                        />
                                        <Text className="text-[11px] text-emerald-700 font-bold">
                                          {customer.ratingsCount > 0
                                            ? (customer.avgRating / customer.ratingsCount).toFixed(
                                                1,
                                              )
                                            : "New"}
                                        </Text>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-gray-500 text-xs">
                                      <Text type="secondary" className="text-xs">
                                        {customer.phone}
                                      </Text>
                                      <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                      <Text type="secondary" className="text-xs">
                                        {customer.totalTrips} Trips
                                      </Text>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="primary"
                                    size="middle"
                                    className="h-9 rounded-xl bg-purple-600 border-none font-semibold shadow-soft"
                                    onClick={() => {
                                      setSelectedBooking(customer.latestBookings[0]);
                                      setRatingValue(customer.latestBookings[0].ratingByHost || 5);
                                      setRatingComment(
                                        customer.latestBookings[0].commentByHost || "",
                                      );
                                      setRatingModalVisible(true);
                                    }}
                                  >
                                    Rate Latest Trip
                                  </Button>
                                </div>
                              </div>

                              <div className="mt-4 pt-4 border-t border-gray-100">
                                <Text
                                  strong
                                  className="text-gray-400 uppercase text-[10px] tracking-widest block mb-3"
                                >
                                  Trip History with you
                                </Text>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {customer.latestBookings.slice(0, 3).map((b: Booking) => (
                                    <div
                                      key={b.id}
                                      className="bg-gray-50/50 p-3 rounded-xl border border-gray-100 flex flex-col gap-2"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <Text
                                          type="secondary"
                                          className="text-[10px] uppercase tracking-wider"
                                        >
                                          {dayjs(b.createdAt).format("MMM D, YYYY")}
                                        </Text>
                                        <Tag
                                          color={
                                            b.status === "confirmed"
                                              ? "green"
                                              : b.status === "completed"
                                                ? "blue"
                                                : "orange"
                                          }
                                          className="rounded-full text-[9px] border-none font-bold uppercase px-1.5 m-0"
                                        >
                                          {b.status}
                                        </Tag>
                                      </div>
                                      <Text className="text-xs font-semibold">
                                        {b.seatsBooked} Seat{b.seatsBooked > 1 ? "s" : ""} • ₹
                                        {b.segmentPrice}
                                      </Text>

                                      {b.verified && (
                                        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1.5">
                                          <Star
                                            size={12}
                                            className="text-emerald-600 fill-emerald-600"
                                          />
                                          <Text className="text-[11px] font-bold text-emerald-700">
                                            Customer Verified
                                          </Text>
                                        </div>
                                      )}

                                      {b.ratingByHost && (
                                        <div className="flex items-center gap-1.5">
                                          {[...Array(5)].map((_, i) => (
                                            <Star
                                              key={i}
                                              size={10}
                                              className={
                                                i < b.ratingByHost!
                                                  ? "text-amber-400 fill-amber-400"
                                                  : "text-gray-200"
                                              }
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* — ONBOARDING MODULE — */}
              {activeModule === "onboarding" && (
                <div className="-mx-5 sm:mx-auto sm:max-w-2xl space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="text-center px-5 sm:px-0 pt-2">
                    <div className="mx-auto w-20 h-20 bg-gradient-primary rounded-3xl flex items-center justify-center text-white shadow-glow mb-6">
                      <Sparkles size={40} />
                    </div>
                    <Title level={2}>Host Onboarding</Title>
                    <Text type="secondary" className="text-lg">
                      Verify your identity to get started. You'll add your vehicle next.
                    </Text>
                  </div>

                  <Card className="rounded-none sm:rounded-3xl border-0 sm:border sm:border-white/60 shadow-none sm:shadow-card bg-white sm:bg-white/80 backdrop-blur-md px-5 pt-6 pb-10 sm:p-8">
                    <Form
                      layout="vertical"
                      initialValues={{
                        phone:
                          (user?.prefs as Record<string, unknown> | undefined)?.phone ??
                          (user as { phone?: string } | null)?.phone ??
                          "",
                        email: hasRealEmail ? user?.email : "",
                      }}
                      onFinish={async (v) => {
                        if (!user) return;

                        if (!v.idDocType) {
                          message.error("Select which ID document you're uploading.");
                          return;
                        }
                        if (
                          !idFrontFileList[0]?.originFileObj ||
                          !idBackFileList[0]?.originFileObj
                        ) {
                          message.error("Upload both the front and back of your ID document.");
                          return;
                        }

                        setOnboardingSubmitting(true);
                        try {
                          const phoneDigits = String(v.phone || "").replace(/[^\d]/g, "");
                          const enteredEmail = String(v.email || "").trim();
                          // The `drivers` collection requires a non-empty email.
                          // Phone-based accounts may have no real email, so fall
                          // back to a deterministic phone-derived address.
                          const profileEmail =
                            enteredEmail ||
                            (user.email && user.email.trim()
                              ? user.email
                              : `u${phoneDigits}@phone.coolpool.in`);

                          // The ID document is the actual proof of identity, so
                          // a failed upload here aborts onboarding instead of
                          // silently continuing.
                          const idDocPerms = [
                            Permission.read(Role.user(user.$id)),
                            Permission.delete(Role.user(user.$id)),
                          ];
                          let idFrontDocId: string;
                          let idBackDocId: string;
                          try {
                            const upFront = await storage.createFile(
                              appwriteConfig.driverDocsBucketId,
                              ID.unique(),
                              await compressImage(idFrontFileList[0].originFileObj as File),
                              idDocPerms,
                            );
                            idFrontDocId = upFront.$id;
                            const upBack = await storage.createFile(
                              appwriteConfig.driverDocsBucketId,
                              ID.unique(),
                              await compressImage(idBackFileList[0].originFileObj as File),
                              idDocPerms,
                            );
                            idBackDocId = upBack.$id;
                          } catch {
                            message.error("ID document upload failed. Please try again.");
                            setOnboardingSubmitting(false);
                            return;
                          }

                          // The live selfie is best-effort.
                          let selfieDocId: string | undefined;
                          if (selfieFileList[0]?.originFileObj) {
                            try {
                              const up = await storage.createFile(
                                appwriteConfig.driverDocsBucketId,
                                ID.unique(),
                                await compressImage(selfieFileList[0].originFileObj as File),
                                idDocPerms,
                              );
                              selfieDocId = up.$id;
                            } catch {
                              message.warning("Selfie upload failed — you can add it later.");
                            }
                          }

                          await upsertDriverProfile({
                            userId: user.$id,
                            fullName: user.name || String(v.phone || ""),
                            email: profileEmail,
                            phone: String(v.phone),
                            licenseNumber: String(v.licenseNumber),
                            city: String(v.city),
                            idDocType: v.idDocType,
                            idFrontDoc: idFrontDocId,
                            idBackDoc: idBackDocId,
                            selfieDoc: selfieDocId,
                          });

                          await assignRole(user.$id, "driver");
                          message.success(
                            "Identity verified! Now add your vehicle to start hosting.",
                          );
                          await refreshRoles();
                          setActiveModule("dashboard");
                          setVehicleDrawerOpen(true);
                        } catch (err) {
                          message.error(err instanceof Error ? err.message : "Onboarding failed");
                        } finally {
                          setOnboardingSubmitting(false);
                        }
                      }}
                    >
                      <Divider>
                        <Text className="text-base font-bold uppercase tracking-widest text-purple-600">
                          Personal & License
                        </Text>
                      </Divider>
                      <div className="grid grid-cols-1 gap-x-6">
                        <Form.Item
                          name="phone"
                          label={<span className="text-lg font-semibold">Phone Number</span>}
                          rules={[{ required: true }]}
                        >
                          <Input
                            size="large"
                            className="rounded-2xl h-16 text-xl"
                            placeholder="+91 98765 43210"
                          />
                        </Form.Item>
                        <Form.Item
                          name="city"
                          label={<span className="text-lg font-semibold">City</span>}
                          rules={[{ required: true }]}
                        >
                          <Input
                            size="large"
                            className="rounded-2xl h-16 text-xl"
                            placeholder="Chennai"
                          />
                        </Form.Item>
                        {!hasRealEmail && (
                          <Form.Item
                            name="email"
                            label={
                              <span className="text-lg font-semibold">
                                Email{" "}
                                <span className="text-sm font-normal text-muted-foreground">
                                  (optional)
                                </span>
                              </span>
                            }
                          >
                            <Input
                              type="email"
                              size="large"
                              className="rounded-2xl h-16 text-xl"
                              placeholder="you@example.com"
                            />
                          </Form.Item>
                        )}
                        <Form.Item
                          name="licenseNumber"
                          label={
                            <span className="text-lg font-semibold">Driving License Number</span>
                          }
                          rules={[{ required: true }]}
                        >
                          <Input
                            size="large"
                            className="rounded-2xl h-16 text-xl"
                            placeholder="TN01 20150012345"
                          />
                        </Form.Item>
                      </div>

                      <Divider orientation="left" className="mt-8">
                        <Text className="text-sm font-bold uppercase tracking-widest text-purple-600">
                          Identity Verification
                        </Text>
                      </Divider>
                      <div className="grid grid-cols-1 gap-x-6">
                        <Form.Item
                          name="idDocType"
                          label={
                            <span className="text-lg font-semibold">
                              Which document are you uploading?
                            </span>
                          }
                          rules={[{ required: true, message: "Select an ID document" }]}
                        >
                          <Segmented
                            size="large"
                            block
                            options={[
                              { label: "Aadhar Card", value: "aadhar" },
                              { label: "Driving Licence", value: "license" },
                            ]}
                          />
                        </Form.Item>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-8">
                        <div>
                          <Text className="text-lg font-semibold mb-2 block">
                            Front Side
                          </Text>
                          <Upload
                            beforeUpload={() => false}
                            maxCount={1}
                            accept="image/*"
                            fileList={idFrontFileList}
                            onChange={({ fileList }) => setIdFrontFileList(fileList)}
                          >
                            <Button
                              block
                              size="large"
                              className="rounded-2xl border-dashed h-32 flex flex-col items-center justify-center gap-2"
                            >
                              <Plus size={24} />
                              <span className="text-base font-medium">Upload Front</span>
                            </Button>
                          </Upload>
                        </div>
                        <div>
                          <Text className="text-lg font-semibold mb-2 block">
                            Back Side
                          </Text>
                          <Upload
                            beforeUpload={() => false}
                            maxCount={1}
                            accept="image/*"
                            fileList={idBackFileList}
                            onChange={({ fileList }) => setIdBackFileList(fileList)}
                          >
                            <Button
                              block
                              size="large"
                              className="rounded-2xl border-dashed h-32 flex flex-col items-center justify-center gap-2"
                            >
                              <Plus size={24} />
                              <span className="text-base font-medium">Upload Back</span>
                            </Button>
                          </Upload>
                        </div>
                        <div className="col-span-2">
                          <Text className="text-lg font-semibold mb-2 block">Live Selfie</Text>
                          <Upload
                            beforeUpload={() => false}
                            maxCount={1}
                            accept="image/*"
                            capture="user"
                            fileList={selfieFileList}
                            onChange={({ fileList }) => setSelfieFileList(fileList)}
                          >
                            <Button
                              block
                              size="large"
                              className="rounded-2xl border-dashed h-32 flex flex-col items-center justify-center gap-2"
                            >
                              <Camera size={24} />
                              <span className="text-base font-medium">Take Selfie</span>
                            </Button>
                          </Upload>
                          <Text type="secondary" className="text-sm mt-2 block">
                            Used only to verify your identity — not shown publicly.
                          </Text>
                        </div>
                      </div>

                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        size="large"
                        loading={onboardingSubmitting}
                        className="bg-gradient-primary border-none rounded-2xl h-16 font-bold text-xl shadow-glow mt-4"
                      >
                        Complete Verification
                      </Button>
                    </Form>
                  </Card>
                </div>
              )}
            </Content>
          </Layout>
        </Layout>

        {/* App-like Mobile Bottom Navigation */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-200 pb-safe z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex justify-around items-center h-16">
            <button
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeModule === "dashboard" ? "text-primary" : "text-gray-400"}`}
              onClick={() => setActiveModule("dashboard")}
            >
              <LayoutDashboard size={20} />
              <span className="text-[10px] font-semibold">Home</span>
            </button>

            <button
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeModule === "trips" ? "text-primary" : "text-gray-400"}`}
              onClick={() => {
                setShowTripForm(false);
                setActiveModule("trips");
              }}
            >
              <div
                className={`p-1.5 rounded-full ${activeModule === "trips" ? "bg-primary/10" : ""}`}
              >
                <RouteIcon size={22} />
              </div>
              <span className="text-[10px] font-semibold -mt-1">Trips</span>
            </button>

            <button
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeModule === "history" ? "text-primary" : "text-gray-400"}`}
              onClick={() => setActiveModule("history")}
            >
              <History size={20} />
              <span className="text-[10px] font-semibold">History</span>
            </button>

            <button
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeModule === "customers" ? "text-primary" : "text-gray-400"}`}
              onClick={() => setActiveModule("customers")}
            >
              <UserCheck size={20} />
              <span className="text-[10px] font-semibold">Guest</span>
            </button>

            <button
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeModule === "drivers" ? "text-primary" : "text-gray-400"}`}
              onClick={() => setActiveModule("drivers")}
            >
              <Users2 size={20} />
              <span className="text-[10px] font-semibold">Drivers</span>
            </button>

            <button
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeModule === "payouts" ? "text-primary" : "text-gray-400"}`}
              onClick={() => setActiveModule("payouts")}
            >
              <Wallet size={20} />
              <span className="text-[10px] font-semibold">Payouts</span>
            </button>
          </div>
        </div>
      </div>

      {/* Manage Passengers Drawer */}
      {managingTripId &&
        (() => {
          const managingTrip = trips.find((t) => t.id === managingTripId);
          const tripBookings = bookings.filter((b) => b.tripId === managingTripId);
          const seatsBooked = tripBookings.reduce((sum, b) => sum + (b.seatsBooked || 0), 0);
          const managingStopsByIndex = new Map(
            managingTripStops.map((s) => [s.stopIndex, s.location]),
          );

          return (
            <Drawer
              title={null}
              placement="right"
              width={480}
              onClose={() => {
                setManagingTripId(null);
                setShowManagingTripRoute(false);
                setTravelerDetailBooking(null);
              }}
              open={!!managingTripId}
              closable={false}
              className="bg-gray-50"
              styles={{ body: { padding: 0, overflowY: "auto", background: "#f9fafb" } }}
            >
              {managingTrip && (
                <div className="min-h-full">
                  <div className="bg-gradient-primary p-6 text-white relative">
                    <Button
                      type="text"
                      icon={<XCircle size={24} className="!text-white/80 hover:!text-white" />}
                      onClick={() => {
                        setManagingTripId(null);
                        setShowManagingTripRoute(false);
                        setTravelerDetailBooking(null);
                      }}
                      className="absolute top-4 right-4 p-0 hover:bg-transparent"
                    />
                    <div className="mt-4">
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <Tag
                          color="purple"
                          className="border-none bg-white/90 !text-gray-900 rounded-full px-3 py-1"
                        >
                          {dayjs(managingTrip.departureAt).format("MMM D, YYYY • h:mm A")}
                        </Tag>
                        {managingTrip.tripCode && (
                          <Tag className="border-none bg-white !text-black rounded-full px-3 py-1 font-mono">
                            {managingTrip.tripCode}
                          </Tag>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-white flex-shrink-0"></div>
                          <Text className="!text-white font-medium text-lg leading-tight">
                            {managingTrip.fromLocation}
                          </Text>
                        </div>
                        <div className="ml-1 w-0.5 h-6 bg-white/30"></div>
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-white flex-shrink-0"></div>
                          <Text className="!text-white font-medium text-lg leading-tight">
                            {managingTrip.toLocation}
                          </Text>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowManagingTripRoute(true)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 text-xs font-bold !text-white"
                        >
                          <Navigation size={14} /> View full route
                        </button>

                        {(() => {
                          const s = startTripState(managingTrip, now);
                          if (!s.show) return null;
                          return s.enabled ? (
                            <button
                              type="button"
                              onClick={() => handleStartTrip(managingTrip.id)}
                              disabled={tripActionLoading === managingTrip.id}
                              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 transition-colors px-3 py-1.5 text-xs font-bold !text-white disabled:opacity-60"
                            >
                              <PlayCircle size={14} />
                              {tripActionLoading === managingTrip.id ? "Starting…" : "Start Trip"}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold !text-white/60">
                              <PlayCircle size={14} />
                              {s.label} · {dayjs(managingTrip.departureAt).format("h:mm A")}
                            </span>
                          );
                        })()}

                        {managingTrip.status === "in_progress" && (
                          <>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1.5 text-xs font-bold !text-white animate-pulse">
                              <RadioTower size={14} /> Sharing live location
                            </span>
                            <button
                              type="button"
                              onClick={() => handleEndTrip(managingTrip.id)}
                              disabled={tripActionLoading === managingTrip.id}
                              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 text-xs font-bold !text-white disabled:opacity-60"
                            >
                              <FlagTriangleRight size={14} />
                              {tripActionLoading === managingTrip.id ? "Finishing…" : "End Trip"}
                            </button>
                          </>
                        )}
                      </div>

                      <div className="mt-4 bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/20">
                        <div className="flex justify-between items-center mb-2">
                          <Text className="!text-white/80 font-medium">Capacity</Text>
                          <Text className="!text-white font-bold">
                            {seatsBooked} / {managingTrip.totalSeats} booked
                          </Text>
                        </div>
                        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, (seatsBooked / (managingTrip.totalSeats || 1)) * 100)}%`,
                            }}
                          ></div>
                        </div>
                      </div>

                      {typeof managingTrip.fromLat === "number" &&
                        typeof managingTrip.fromLng === "number" && (
                          <div className="mt-4">
                            <Text className="!text-white/80 font-medium block mb-2">
                              Pickup point — 360° view
                            </Text>
                            <StreetView360
                              lat={managingTrip.fromLat}
                              lng={managingTrip.fromLng}
                              label={`Pickup · ${managingTrip.fromLocation.split(",")[0]}`}
                              heightClass="h-48"
                            />
                          </div>
                        )}
                    </div>
                  </div>

                  <Modal
                    title="Full route"
                    open={showManagingTripRoute}
                    onCancel={() => setShowManagingTripRoute(false)}
                    footer={null}
                    centered
                  >
                    <div className="space-y-3 py-2">
                      {(() => {
                        const sortedStops = [...managingTripStops].sort(
                          (a, b) => a.stopIndex - b.stopIndex,
                        );
                        const last = sortedStops.length - 1;
                        return sortedStops.map((stop, i) => (
                          <div key={stop.id} className="flex items-start gap-3">
                            <div
                              className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                                i === 0 ? "bg-primary" : i === last ? "bg-pink-500" : "bg-amber-400"
                              }`}
                            ></div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                                {i === 0
                                  ? "Pickup"
                                  : i === last
                                    ? "Drop-off"
                                    : `Stop ${stop.stopIndex}`}
                              </p>
                              <p className="font-semibold text-gray-800">{stop.location}</p>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </Modal>

                  <div className="p-6">
                    <Title level={4} className="mb-6 font-bold text-gray-800">
                      Passenger Roster
                    </Title>

                    {tripBookings.length === 0 ? (
                      <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-sm">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                          <User size={32} />
                        </div>
                        <Text className="text-gray-500 font-medium text-base">
                          No passengers yet
                        </Text>
                        <p className="text-gray-400 text-sm mt-1">
                          Bookings for this trip will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {tripBookings.map((b) => {
                          const contact = getContactLinks(b.passengerPhone);
                          const passengers = getBookingPassengers(b);
                          const primaryPassenger = passengers[0];
                          const primaryName = primaryPassenger?.name || "Passenger";
                          const seatLabel = passengers
                            .map((passenger) => passengerSeatLabel(passenger.seatCode))
                            .join(", ");
                          const genderLabel = [
                            ...new Set(
                              passengers
                                .map((passenger) => passenger.gender)
                                .map(passengerGenderLabel),
                            ),
                          ].join(" · ");
                          const reviews = travelerReviewsByUser[b.travelerId] ?? [];
                          const rating =
                            reviews.length > 0
                              ? reviews.reduce((sum, review) => sum + review.stars, 0) /
                                reviews.length
                              : null;
                          return (
                            <Card
                              key={b.id}
                              className="rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden"
                              bodyStyle={{ padding: 16 }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <Avatar
                                    size={54}
                                    src={getUserAvatarUrl(primaryName, 108)}
                                    className="bg-gradient-primary shadow-sm text-lg font-bold text-white shrink-0"
                                  >
                                    {primaryName[0] || "P"}
                                  </Avatar>
                                  <div className="min-w-0">
                                    <Text strong className="block text-base text-gray-900 truncate">
                                      {primaryName}
                                      {passengers.length > 1 ? ` +${passengers.length - 1}` : ""}
                                    </Text>
                                    <Text type="secondary" className="block text-xs mt-0.5">
                                      {genderLabel || "—"} · {seatLabel || "—"}
                                    </Text>
                                    <div className="mt-1.5 flex items-center gap-1 text-xs">
                                      <Star
                                        size={13}
                                        className={
                                          rating ? "fill-amber-400 text-amber-400" : "text-gray-300"
                                        }
                                      />
                                      <span className="font-bold text-gray-700">
                                        {rating ? rating.toFixed(1) : "New"}
                                      </span>
                                      <span className="text-gray-400">
                                        · {reviews.length} reviews
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <Text strong className="block text-base text-emerald-600">
                                    ₹{b.segmentPrice}
                                  </Text>
                                  <Tag
                                    color={
                                      b.status === "confirmed"
                                        ? "success"
                                        : b.status === "no_show"
                                          ? "error"
                                          : "processing"
                                    }
                                    className="m-0 rounded-full uppercase text-[10px] font-bold border-none"
                                  >
                                    {b.status === "no_show" ? "No-show" : b.status}
                                  </Tag>
                                </div>
                              </div>

                              <div className="mt-4 flex items-center gap-2">
                                {contact.tel && (
                                  <a
                                    href={contact.tel}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100"
                                    title="Call passenger"
                                  >
                                    <Phone size={16} />
                                  </a>
                                )}
                                {contact.whatsapp && (
                                  <a
                                    href={contact.whatsapp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                    title="Message on WhatsApp"
                                  >
                                    <MessageCircle size={16} />
                                  </a>
                                )}
                                <Button
                                  className="ml-auto h-9 rounded-xl font-semibold"
                                  onClick={() => setTravelerDetailBooking(b)}
                                >
                                  View details
                                </Button>
                              </div>

                              <div className="mt-4 pt-4 border-t border-gray-100">
                                {b.status === "no_show" ? (
                                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2">
                                    <UserX size={14} className="text-rose-600 shrink-0" />
                                    <Text className="text-sm font-bold text-rose-700 flex-1">
                                      Marked as no-show
                                    </Text>
                                    <Button
                                      size="small"
                                      loading={noShowId === b.id}
                                      className="rounded-xl font-semibold"
                                      onClick={() => handleSetBookingStatus(b.id, "confirmed")}
                                    >
                                      Undo
                                    </Button>
                                  </div>
                                ) : b.verified ? (
                                  <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                                    <Star
                                      size={14}
                                      className="text-emerald-600 fill-emerald-600 shrink-0"
                                    />
                                    <Text className="text-sm font-bold text-emerald-700 flex-1">
                                      Customer Verified
                                    </Text>
                                  </div>
                                ) : (
                                  <div>
                                    <Text className="text-[10px] uppercase tracking-widest text-gray-400 block mb-2 font-bold">
                                      Boarding OTP
                                    </Text>
                                    <div className="flex items-center gap-3">
                                      <InputOTP
                                        maxLength={4}
                                        value={otpInputs[b.id] || ""}
                                        onChange={(v) =>
                                          setOtpInputs((prev) => ({
                                            ...prev,
                                            [b.id]: v.replace(/\D/g, ""),
                                          }))
                                        }
                                        inputMode="numeric"
                                        containerClassName="flex-1"
                                      >
                                        <InputOTPGroup className="grid w-full grid-cols-4 gap-2">
                                          {[0, 1, 2, 3].map((i) => (
                                            <InputOTPSlot
                                              key={i}
                                              index={i}
                                              className="h-12 w-full rounded-xl border border-border/80 bg-background text-xl font-bold first:rounded-xl last:rounded-xl"
                                            />
                                          ))}
                                        </InputOTPGroup>
                                      </InputOTP>
                                      <Button
                                        type="primary"
                                        loading={verifyingId === b.id}
                                        onClick={() => handleVerifyOtp(b.id)}
                                        className="rounded-xl bg-purple-600 border-none font-semibold h-12 px-5"
                                      >
                                        Verify
                                      </Button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => confirmMarkNoShow(b.id, b.passengerName)}
                                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-rose-600 transition-colors"
                                    >
                                      <UserX size={12} />
                                      Passenger didn't show up
                                    </button>
                                  </div>
                                )}
                              </div>

                              {b.status !== "no_show" && b.status !== "cancelled" && (
                                <Button
                                  type={
                                    completedTripIds.has(b.tripId) &&
                                    !existingHostReviewsLoading &&
                                    !existingHostReviewMap[b.id]
                                      ? "primary"
                                      : "default"
                                  }
                                  block
                                  loading={
                                    completedTripIds.has(b.tripId) && existingHostReviewsLoading
                                  }
                                  disabled={
                                    !completedTripIds.has(b.tripId) ||
                                    existingHostReviewsLoading ||
                                    !!existingHostReviewMap[b.id]
                                  }
                                  className={`mt-3 h-10 rounded-xl font-semibold ${
                                    completedTripIds.has(b.tripId) &&
                                    !existingHostReviewsLoading &&
                                    !existingHostReviewMap[b.id]
                                      ? "bg-purple-600 border-none"
                                      : ""
                                  }`}
                                  onClick={() => {
                                    setSelectedBooking(b);
                                    setManagingTripId(null);
                                    setRatingModalVisible(true);
                                  }}
                                >
                                  {existingHostReviewMap[b.id]
                                    ? "Review submitted"
                                    : completedTripIds.has(b.tripId)
                                      ? "Review traveller"
                                      : "Review after trip"}
                                </Button>
                              )}
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Drawer>
          );
        })()}

      {/* Traveller profile and booking details */}
      {travelerDetailBooking &&
        (() => {
          const booking = travelerDetailBooking;
          const trip = trips.find((item) => item.id === booking.tripId);
          const passengers = getBookingPassengers(booking);
          const primaryPassenger = passengers[0];
          const primaryName = primaryPassenger?.name || "Passenger";
          const contact = getContactLinks(primaryPassenger?.phone || booking.passengerPhone);
          const reviews = travelerReviewsByUser[booking.travelerId] ?? [];
          const rating =
            reviews.length > 0
              ? reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length
              : null;
          const travelerBookings = bookings.filter(
            (item) => item.travelerId === booking.travelerId,
          );
          const completedTravelerTrips = travelerBookings.filter((item) =>
            completedTripIds.has(item.tripId),
          ).length;
          const fromLocation =
            managingStopsByIndexForDetail(managingTripStops, booking.fromStopIndex) ??
            trip?.fromLocation ??
            "Pickup";
          const toLocation =
            managingStopsByIndexForDetail(managingTripStops, booking.toStopIndex) ??
            trip?.toLocation ??
            "Drop-off";
          const canReview =
            completedTripIds.has(booking.tripId) &&
            booking.status !== "no_show" &&
            booking.status !== "cancelled" &&
            !existingHostReviewMap[booking.id];

          return (
            <Drawer
              title={null}
              placement="right"
              width={440}
              zIndex={1100}
              open
              closable={false}
              onClose={() => setTravelerDetailBooking(null)}
              styles={{ body: { padding: 0, overflowY: "auto" } }}
            >
              <div className="min-h-full bg-gray-50" style={{ fontFamily: APP_FONT_FAMILY }}>
                <div className="relative bg-gradient-primary px-6 pb-7 pt-5 text-white">
                  <button
                    type="button"
                    onClick={() => setTravelerDetailBooking(null)}
                    className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white"
                    aria-label="Back to passenger roster"
                  >
                    <ArrowRight size={18} className="rotate-180" />
                  </button>
                  <div className="flex flex-col items-center pt-7 text-center">
                    <Avatar
                      size={92}
                      src={getUserAvatarUrl(primaryName, 184)}
                      className="border-4 border-white/80 bg-white/20 text-2xl font-bold"
                    >
                      {primaryName[0] || "P"}
                    </Avatar>
                    <h2 className="mt-3 text-xl font-black text-white">{primaryName}</h2>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
                      <Star size={15} className={rating ? "fill-amber-300 text-amber-300" : ""} />
                      <span className="font-bold">
                        {rating ? rating.toFixed(1) : "New traveller"}
                      </span>
                      <span>· {reviews.length} reviews</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <TravelerStat value={String(completedTravelerTrips)} label="trips" />
                    <TravelerStat value={rating ? `${rating.toFixed(1)}★` : "New"} label="rating" />
                    <TravelerStat value={String(reviews.length)} label="reviews" />
                  </div>

                  <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      This booking
                    </p>
                    <div className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-800">
                      <span className="truncate">{fromLocation}</span>
                      <ArrowRight size={14} className="shrink-0 text-gray-300" />
                      <span className="truncate">{toLocation}</span>
                    </div>
                    <div className="space-y-2">
                      {passengers.map((passenger) => (
                        <div
                          key={`${passenger.seatCode}-${passenger.name}`}
                          className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-gray-800">
                              {passenger.name}
                            </p>
                            <p className="text-xs text-gray-400">{passenger.phone}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                passengerGenderTone(passenger.gender) === "male"
                                  ? "bg-blue-50 text-blue-700"
                                  : passengerGenderTone(passenger.gender) === "female"
                                    ? "bg-pink-50 text-pink-700"
                                    : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {passengerGenderLabel(passenger.gender)}
                            </span>
                            <span className="rounded-full bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-700">
                              {passengerSeatLabel(passenger.seatCode)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Price
                        </p>
                        <p className="font-black text-emerald-600">₹{booking.segmentPrice}</p>
                      </div>
                      <Tag
                        color={
                          booking.status === "no_show"
                            ? "error"
                            : booking.status === "cancelled"
                              ? "default"
                              : "success"
                        }
                        className="m-0 rounded-full border-none px-3 font-bold capitalize"
                      >
                        {booking.status === "no_show" ? "No-show" : booking.status}
                      </Tag>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        href={contact.tel ?? undefined}
                        disabled={!contact.tel}
                        className="h-10 rounded-xl"
                      >
                        <Phone size={15} /> Call
                      </Button>
                      <Button
                        href={contact.whatsapp ?? undefined}
                        target="_blank"
                        disabled={!contact.whatsapp}
                        className="h-10 rounded-xl"
                      >
                        <MessageCircle size={15} /> Message
                      </Button>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        Reviews from hosts
                      </p>
                      {travelerReviewsLoading && <Spin size="small" />}
                    </div>
                    {reviews.length === 0 ? (
                      <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">
                        No reviews yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {reviews.slice(0, 5).map((review) => (
                          <div
                            key={review.id}
                            className="border-b border-gray-50 pb-3 last:border-0 last:pb-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    size={13}
                                    className={
                                      star <= review.stars
                                        ? "fill-amber-400 text-amber-400"
                                        : "text-gray-200"
                                    }
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-gray-400">
                                {dayjs(review.createdAt).fromNow()}
                              </span>
                            </div>
                            <p className="mt-1 text-sm font-semibold text-gray-700">
                              {review.tags.join(" · ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {booking.status !== "no_show" && booking.status !== "cancelled" && (
                    <Button
                      type={canReview ? "primary" : "default"}
                      block
                      disabled={!canReview || existingHostReviewsLoading}
                      loading={completedTripIds.has(booking.tripId) && existingHostReviewsLoading}
                      className={`h-12 rounded-2xl font-bold ${canReview ? "bg-purple-600 border-none" : ""}`}
                      onClick={() => {
                        setSelectedBooking(booking);
                        setTravelerDetailBooking(null);
                        setManagingTripId(null);
                        setRatingModalVisible(true);
                      }}
                    >
                      {existingHostReviewMap[booking.id]
                        ? "Review submitted"
                        : completedTripIds.has(booking.tripId)
                          ? "Review traveller"
                          : "Review after trip"}
                    </Button>
                  )}
                </div>
              </div>
            </Drawer>
          );
        })()}

      {/* Add/Edit Driver Drawer — rendered globally (zIndex above the trip
          wizard) so it can open on top without closing the wizard */}
      <Drawer
        title={editingDriverId ? "Edit Driver" : "Add Driver"}
        placement="right"
        width={420}
        zIndex={1200}
        styles={{ body: { background: "#ffffff" }, header: { background: "#ffffff" }, footer: { background: "#ffffff" } }}
        open={driverDrawerOpen}
        onClose={() => {
          setDriverDrawerOpen(false);
          driverForm.resetFields();
          setEditingDriverId(null);
        }}
        footer={
          <Button
            type="primary"
            loading={savingDriver}
            block
            size="large"
            className="bg-gradient-primary border-none rounded-3xl font-extrabold h-16 !text-xl tracking-wide"
            onClick={() => driverForm.submit()}
          >
            {editingDriverId ? "Save Changes" : "Add Driver"}
          </Button>
        }
      >
        <Form
          form={driverForm}
          layout="vertical"
          onFinish={(vals) => saveDriver(vals as Omit<CreateTeamDriverInput, "ownerUserId">)}
        >
          <Form.Item
            name="fullName"
            label={<span className="font-bold text-lg text-gray-800">Full Name</span>}
            rules={[{ required: true, message: "Required" }]}
          >
            <Input size="large" className="rounded-3xl h-16 text-xl" />
          </Form.Item>
          <Form.Item
            name="email"
            label={<span className="font-bold text-lg text-gray-800">Email</span>}
            rules={[{ required: true, type: "email", message: "Valid email required" }]}
          >
            <Input size="large" className="rounded-3xl h-16 text-xl" />
          </Form.Item>
          <Form.Item
            name="phone"
            label={<span className="font-bold text-lg text-gray-800">Phone</span>}
            rules={[
              { required: true, message: "Required" },
              { len: 10, message: "Must be exactly 10 digits" },
              { pattern: /^\d{10}$/, message: "Digits only" },
            ]}
          >
            <Input
              size="large"
              inputMode="numeric"
              maxLength={10}
              className="rounded-3xl h-16 text-xl"
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                driverForm.setFieldValue("phone", digits);
              }}
            />
          </Form.Item>
          <Form.Item
            name="licenseNumber"
            label={<span className="font-bold text-lg text-gray-800">License Number</span>}
            rules={[{ required: true, message: "Required" }]}
          >
            <Input size="large" className="rounded-3xl h-16 text-xl" />
          </Form.Item>
          <Form.Item
            name="city"
            label={<span className="font-bold text-lg text-gray-800">City</span>}
            rules={[{ required: true, message: "Required" }]}
          >
            <Input size="large" className="rounded-3xl h-16 text-xl" />
          </Form.Item>
        </Form>
      </Drawer>
      {/* Add/Edit Vehicle Drawer */}
      <Drawer
        title={editingVehicleId ? "Edit Vehicle" : "Add Vehicle"}
        placement="right"
        width={420}
        zIndex={1200}
        styles={{ body: { background: "#ffffff" }, header: { background: "#ffffff" }, footer: { background: "#ffffff" } }}
        open={vehicleDrawerOpen}
        onClose={() => {
          setVehicleDrawerOpen(false);
          vehicleForm.resetFields();
          setCarImagesList([]);
          setRegFileList([]);
          setInsFileList([]);
          setEditingVehicleId(null);
        }}
        footer={
          <Button
            type="primary"
            loading={savingVehicle}
            block
            size="large"
            className="bg-gradient-primary border-none rounded-3xl font-extrabold h-16 !text-xl tracking-wide"
            onClick={() => vehicleForm.submit()}
          >
            {editingVehicleId ? "Save Changes" : "Add Vehicle"}
          </Button>
        }
      >
        <Form
          form={vehicleForm}
          layout="vertical"
          onFinish={(vals) =>
            saveVehicle(
              vals as { make: string; model: string; color: string; plate: string; seats: number },
            )
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="make"
              label={<span className="font-semibold text-gray-700">Car</span>}
              rules={[{ required: true, message: "Required" }]}
            >
              <Input size="large" placeholder="Hyundai" className="rounded-3xl h-12" />
            </Form.Item>
            <Form.Item
              name="model"
              label={<span className="font-semibold text-gray-700">Model</span>}
              rules={[{ required: true, message: "Required" }]}
            >
              <Input size="large" placeholder="Creta" className="rounded-3xl h-12" />
            </Form.Item>
          </div>
          <Form.Item
            name="color"
            label={<span className="font-semibold text-gray-700">Color</span>}
          >
            <Input size="large" placeholder="White, Black…" className="rounded-3xl h-12" />
          </Form.Item>
          <Form.Item
            name="plate"
            label={<span className="font-semibold text-gray-700">License Plate</span>}
            rules={[{ required: true, message: "Required" }]}
          >
            <Input
              size="large"
              placeholder="TN 01 AB 1234"
              className="rounded-3xl h-12 font-mono tracking-widest uppercase"
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase();
              }}
            />
          </Form.Item>
          <Form.Item
            name="seats"
            label={<span className="font-semibold text-gray-700">Seats</span>}
            rules={[{ required: true, message: "Please choose a seat count" }]}
            initialValue={5}
          >
            <Segmented
              size="large"
              block
              options={[
                { label: "5S", value: 5 },
                { label: "7S", value: 7 },
              ]}
            />
          </Form.Item>
          <Form.Item
            label={<span className="font-semibold text-gray-700">Car Photos (Optional)</span>}
          >
            <Upload
              listType="picture-card"
              fileList={carImagesList}
              onChange={({ fileList }) => setCarImagesList(fileList)}
              beforeUpload={() => false}
              maxCount={10}
              multiple
              className="car-upload"
            >
              {carImagesList.length >= 10 ? null : (
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <Camera size={28} />
                  <span className="text-xs font-semibold">Add Photo</span>
                </div>
              )}
            </Upload>
          </Form.Item>
          <div className="space-y-3">
            <Form.Item
              label={<span className="font-semibold text-gray-700">Registration (RC)</span>}
              className="!mb-0"
            >
              <Upload
                beforeUpload={() => false}
                maxCount={1}
                fileList={regFileList}
                onChange={({ fileList }) => setRegFileList(fileList)}
                showUploadList={false}
              >
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-2xl border-2 border-dashed p-4 flex items-center gap-4 transition-all",
                    regFileList.length > 0
                      ? "border-purple-400 bg-purple-50"
                      : "border-gray-200 bg-gray-50 hover:border-purple-300 hover:bg-purple-50/40",
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    regFileList.length > 0 ? "bg-purple-100" : "bg-white border border-gray-200",
                  )}>
                    <FileText size={22} className={regFileList.length > 0 ? "text-purple-600" : "text-gray-400"} />
                  </div>
                  <div className="text-left min-w-0">
                    <p className={cn("font-semibold text-sm truncate", regFileList.length > 0 ? "text-purple-700" : "text-gray-600")}>
                      {regFileList.length > 0 ? regFileList[0].name : "Upload RC Book"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {regFileList.length > 0 ? "Tap to change" : "PDF, JPG or PNG"}
                    </p>
                  </div>
                  {regFileList.length > 0 ? (
                    <Check size={18} className="ml-auto text-purple-500 shrink-0" />
                  ) : (
                    <Plus size={18} className="ml-auto text-gray-400 shrink-0" />
                  )}
                </button>
              </Upload>
            </Form.Item>
            <Form.Item
              label={<span className="font-semibold text-gray-700">Insurance (Optional)</span>}
              className="!mb-0"
            >
              <Upload
                beforeUpload={() => false}
                maxCount={1}
                fileList={insFileList}
                onChange={({ fileList }) => setInsFileList(fileList)}
                showUploadList={false}
              >
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-2xl border-2 border-dashed p-4 flex items-center gap-4 transition-all",
                    insFileList.length > 0
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40",
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    insFileList.length > 0 ? "bg-blue-100" : "bg-white border border-gray-200",
                  )}>
                    <ShieldCheck size={22} className={insFileList.length > 0 ? "text-blue-600" : "text-gray-400"} />
                  </div>
                  <div className="text-left min-w-0">
                    <p className={cn("font-semibold text-sm truncate", insFileList.length > 0 ? "text-blue-700" : "text-gray-600")}>
                      {insFileList.length > 0 ? insFileList[0].name : "Upload Insurance"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {insFileList.length > 0 ? "Tap to change" : "PDF, JPG or PNG"}
                    </p>
                  </div>
                  {insFileList.length > 0 ? (
                    <Check size={18} className="ml-auto text-blue-500 shrink-0" />
                  ) : (
                    <Plus size={18} className="ml-auto text-gray-400 shrink-0" />
                  )}
                </button>
              </Upload>
            </Form.Item>
          </div>
        </Form>
      </Drawer>

      {/* Publish Trips Modal */}
      <Modal
        title={publishModalView === "trips" ? "Manage Your Published Trips" : "Publish a New Trip"}
        open={publishTripsModalOpen}
        onCancel={() => {
          setPublishTripsModalOpen(false);
          setPublishModalView("trips");
        }}
        footer={null}
        width={800}
        className="publish-trips-modal"
      >
        {publishModalView === "trips" ? (
          <div className="space-y-6">
            {tripsLoading ? (
              <div className="py-12 text-center">
                <Spin size="large" />
              </div>
            ) : upcomingTrips.length === 0 ? (
              <div className="py-8 text-center">
                <RouteIcon size={32} className="text-purple-500 mx-auto mb-4" />
                <Title level={4}>No trips published yet</Title>
                <Text type="secondary" className="block mb-6">
                  Start sharing your empty seats to earn money on your journeys.
                </Text>
                <Button
                  type="primary"
                  size="large"
                  className="bg-gradient-primary border-none rounded-3xl"
                  onClick={() => {
                    setPublishTripsModalOpen(false);
                    openWizard();
                  }}
                >
                  Publish Your First Trip
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {sortedTrips.map((item) => (
                    <div
                      key={item.id}
                      className="bg-gray-50 rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Tag
                          color="purple"
                          className="rounded-full border-none px-3 py-1 font-semibold text-xs m-0"
                        >
                          {dayjs(item.departureAt).format("MMM D, YYYY • h:mm A")}
                        </Tag>
                        <Text strong className="text-lg text-emerald-600">
                          ₹{item.totalPrice}
                        </Text>
                      </div>
                      <div className="flex items-center gap-4 mb-3">
                        <div>
                          <Text className="text-xs text-gray-500 uppercase tracking-wider block mb-0.5">
                            From
                          </Text>
                          <Text strong className="text-sm text-gray-800 line-clamp-1">
                            {item.fromLocation}
                          </Text>
                        </div>
                        <ArrowRight size={16} className="text-gray-300 shrink-0" />
                        <div>
                          <Text className="text-xs text-gray-500 uppercase tracking-wider block mb-0.5">
                            To
                          </Text>
                          <Text strong className="text-sm text-gray-800 line-clamp-1">
                            {item.toLocation}
                          </Text>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Button
                          type="text"
                          size="small"
                          className="text-primary font-medium p-0"
                          onClick={async () => {
                            const hide = message.loading("Fetching trip details...", 0);
                            try {
                              setEditingTripId(item.id);
                              setIsEditingTrip(true);

                              const stops = await listTripStops(item.id);
                              const fromStop = stops.find((s) => s.stopType === "pickup");
                              const toStop = stops.find((s) => s.stopType === "drop");

                              if (fromStop)
                                setSelectedFrom({
                                  label: fromStop.location,
                                  value: fromStop.location,
                                  lat: fromStop.lat,
                                  lng: fromStop.lng,
                                });
                              if (toStop)
                                setSelectedTo({
                                  label: toStop.location,
                                  value: toStop.location,
                                  lat: toStop.lat,
                                  lng: toStop.lng,
                                });

                              form.setFieldsValue({
                                fromLocation: item.fromLocation,
                                toLocation: item.toLocation,
                                departureAt: dayjs(item.departureAt),
                                totalSeats: item.totalSeats,
                                totalTripPrice: Math.round(
                                  item.totalPrice / (item.totalSeats || 1),
                                ),
                                vehicleId: item.vehicleId,
                                driverId: item.assignedDriverId,
                              });

                              setPublishModalView("form");
                              message.success("Trip loaded for editing.");
                            } catch (err) {
                              console.error("[EditTrip] Error:", err);
                              message.error("Failed to load trip details.");
                            } finally {
                              hide();
                            }
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          danger
                          className="font-medium p-0"
                          onClick={() => message.info("Cancel functionality coming soon")}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  type="primary"
                  size="large"
                  block
                  className="bg-gradient-primary border-none rounded-3xl mt-6"
                  onClick={() => {
                    setPublishTripsModalOpen(false);
                    openWizard();
                  }}
                >
                  Publish New Trip
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              onValuesChange={() => {
                setPendingTripPayload(null);
                setSegmentPricePreview([]);
              }}
              initialValues={{
                totalSeats: 3,
                seatConfig: defaultOfferedSeatCodes(5) as SeatId[],
                driverId: user?.$id,
              }}
              requiredMark={false}
            >
              <div className="space-y-6">
                {/* Routing configuration — replaces the old From/To/Departure
                    inputs with a wizard launcher. The form fields underneath
                    are kept hidden so the rest of the publish pipeline (which
                    reads fromLocation / toLocation / departureAt + the
                    intermediate-stop state) keeps working unchanged. */}
                <div>
                  <Title level={5} className="mb-3 flex items-center gap-2">
                    <RouteIcon size={18} className="text-primary" /> Routing
                  </Title>
                  {wizardResult ? (
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center self-stretch py-1">
                          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                          <div className="my-1 w-px flex-1 bg-gray-200" />
                          <div className="h-2.5 w-2.5 rounded-full border-2 border-gray-300" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate text-base font-bold text-gray-900">
                            {wizardResult.from.label}
                          </p>
                          <p className="truncate text-base font-bold text-gray-500">
                            {wizardResult.to.label}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <p className="font-bold text-gray-900">
                            {dayjs(wizardResult.departureAt).format("MMM D, h:mm A")}
                          </p>
                          <p className="text-gray-500">Departure</p>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">
                            {wizardResult.totalDistanceKm.toFixed(1)} km
                          </p>
                          <p className="text-gray-500">Distance</p>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{wizardResult.stops.length}</p>
                          <p className="text-gray-500">Stops</p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button
                          block
                          size="large"
                          onClick={() => setWizardOpen(true)}
                          style={{ borderRadius: 12 }}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setWizardOpen(true)}
                      className="w-full rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-6 text-center transition-colors hover:border-primary/70 hover:bg-primary/10"
                    >
                      <div className="mb-1 inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-primary">
                        <RouteIcon size={16} /> Plan your route
                      </div>
                      <p className="text-xs text-gray-600">
                        Pick start &amp; end, choose the route on the map, set the time, and add
                        boarding points.
                      </p>
                    </button>
                  )}
                  <Form.Item name="fromLocation" hidden rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="toLocation" hidden rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="departureAt" hidden rules={[{ required: true }]}>
                    <DatePicker />
                  </Form.Item>
                </div>

                {renderSegmentPricePreview()}

                {/* Vehicle & Driver */}
                <div>
                  <Title level={5} className="mb-3 flex items-center gap-2">
                    <Car size={18} className="text-primary" /> Vehicle & Driver
                  </Title>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Form.Item
                      label={<span className="font-semibold text-sm text-gray-700">Vehicle</span>}
                      name="vehicleId"
                      rules={[{ required: true, message: "Please select a vehicle" }]}
                      className="mb-0"
                    >
                      <Select
                        size="large"
                        placeholder="Select vehicle"
                        className="h-12 w-full"
                        style={{ borderRadius: "8px" }}
                        options={[
                          ...vehicles.map((v) => ({
                            label: `${v.modelName} · ${v.plateNumber.toUpperCase()}`,
                            value: v.id,
                          })),
                          {
                            label: (
                              <span className="text-primary font-medium flex items-center gap-1">
                                <Plus size={14} /> Add vehicle
                              </span>
                            ),
                            value: "ADD_NEW_VEHICLE",
                          },
                        ]}
                        onChange={(val) => {
                          if (val === "ADD_NEW_VEHICLE") {
                            form.setFieldsValue({ vehicleId: undefined });
                            setEditingVehicleId(null);
                            vehicleForm.resetFields();
                            setVehicleDrawerOpen(true);
                            return;
                          }
                          const selectedVeh = vehicles.find((v) => v.id === val);
                          if (selectedVeh) {
                            const seatConfig = defaultOfferedSeatCodes(
                              selectedVeh.seatCapacity,
                            ) as SeatId[];
                            form.setFieldsValue({ seatConfig, totalSeats: seatConfig.length });
                          }
                        }}
                      />
                    </Form.Item>
                    <Form.Item
                      label={<span className="font-semibold text-sm text-gray-700">Driver</span>}
                      name="driverId"
                      rules={[{ required: true, message: "Please select a driver" }]}
                      className="mb-0"
                    >
                      <Select
                        size="large"
                        placeholder="Select driver"
                        className="h-12 w-full"
                        style={{ borderRadius: "8px" }}
                        options={[
                          {
                            label: `You (${user?.name?.split(" ")[0] || "Owner"})`,
                            value: user?.$id || "",
                          },
                          ...teamDrivers.map((d) => ({ label: `${d.fullName}`, value: d.id })),
                        ]}
                      />
                    </Form.Item>
                  </div>
                </div>

                {/* Seating */}
                <div>
                  <Title level={5} className="mb-3">
                    Configure Seating
                  </Title>
                  <Form.Item
                    name="seatConfig"
                    rules={[{ required: true, message: "Select seats" }]}
                  >
                    <SeatPicker
                      seatCapacity={formSeatCapacity}
                      onChange={(seats) => form.setFieldsValue({ totalSeats: seats.length })}
                    />
                  </Form.Item>
                </div>

                {/* Pricing */}
                <div>
                  <Title level={5} className="mb-3">
                    Pricing
                  </Title>
                  <Form.Item
                    label={
                      <span className="font-semibold text-sm text-gray-700">
                        Full Trip Price Per Seat
                      </span>
                    }
                    name="totalTripPrice"
                    rules={[{ required: true, message: "Enter price" }]}
                  >
                    <InputNumber
                      prefix="₹"
                      min={0}
                      max={9999}
                      precision={0}
                      size="large"
                      className="w-full h-12"
                      style={{ borderRadius: "8px", height: "48px", width: "100%" }}
                      onChange={(val) => {
                        if (typeof val === "number" && val > 9999) {
                          form.setFieldsValue({ totalTripPrice: 9999 });
                        }
                      }}
                    />
                  </Form.Item>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    htmlType="button"
                    size="large"
                    className="flex-1 rounded-lg"
                    onClick={() => {
                      setPublishModalView("trips");
                      form.resetFields();
                      setEditingTripId(null);
                      setIsEditingTrip(false);
                    }}
                  >
                    Back to Trips
                  </Button>
                  <Button
                    htmlType="submit"
                    type="primary"
                    size="large"
                    className="flex-1 bg-gradient-primary border-none rounded-lg font-semibold"
                  >
                    {pendingTripPayload
                      ? isEditingTrip
                        ? "Confirm Update"
                        : "Confirm & Publish"
                      : "Calculate Route & Prices"}
                  </Button>
                </div>
              </div>
            </Form>
          </div>
        )}
      </Modal>

      <TripWizard
        open={wizardOpen}
        vehicles={vehicles}
        drivers={wizardDriverOptions}
        trips={trips}
        editingTripId={editingTripId}
        publishing={creating}
        onClose={() => setWizardOpen(false)}
        onComplete={publishViaWizard}
        onAddVehicle={() => {
          // Drawer opens above the wizard (zIndex) so trip data is preserved.
          setEditingVehicleId(null);
          vehicleForm.resetFields();
          setVehicleDrawerOpen(true);
        }}
        onAddDriver={() => {
          setEditingDriverId(null);
          driverForm.resetFields();
          setDriverDrawerOpen(true);
        }}
      />

      {/* Host → Passenger review modal */}
      {selectedBooking && user && (
        <ReviewModal
          open={ratingModalVisible}
          onClose={() => setRatingModalVisible(false)}
          direction="host_to_guest"
          tripId={selectedBooking.tripId}
          bookingId={selectedBooking.id}
          toUserId={selectedBooking.travelerId}
          toUserName={(() => {
            const raw = selectedBooking.passengerName?.split("|")[0] ?? "";
            const m = raw.match(/^Seat\s+[^:]+:\s*(.*)$/i);
            return (m ? m[1] : raw).trim() || "Passenger";
          })()}
          fromUserId={user.$id}
          onSuccess={() => {
            // Optimistically mark this booking reviewed so the prompt hides
            // immediately — getExistingReview can lag right after creation.
            queryClient.setQueriesData<Record<string, boolean>>(
              { queryKey: ["existing-reviews-host"] },
              (old) => (old ? { ...old, [selectedBooking.id]: true } : old),
            );
            void queryClient.invalidateQueries({ queryKey: ["host-bookings"] });
            void queryClient.invalidateQueries({ queryKey: ["existing-reviews-host"] });
            void queryClient.invalidateQueries({ queryKey: ["host-reviews-for-travelers"] });
          }}
        />
      )}
    </ConfigProvider>
  );
}
