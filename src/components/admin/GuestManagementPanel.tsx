import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Typography, Table, Tag, Input, Drawer, Modal } from "antd";
import { Car, Route as RouteIcon, User as UserIcon } from "lucide-react";
import {
  listAllBookings,
  listAllTrips,
  listAllVehicles,
  listDriverProfiles,
} from "@/data/appwrite-repository";
import { getBookingPassengers } from "@/lib/booking-passengers";
import { hostNetEarnings } from "@/lib/pricing";
import { passengerGenderLabel, passengerSeatLabel } from "@/lib/passenger-display";
import { formatVehicleCode } from "@/lib/vehicleCode";
import { CreateUserButton, ResetPasswordButton } from "./AdminUserActions";
import { getUserCodesAsAdmin } from "./adminUserApi";
import type { Booking, Trip } from "@/lib/domain";

const { Title, Text } = Typography;

interface GuestRow {
  userId: string;
  name: string;
  phone: string;
  gender?: string;
  memberCode?: string | null;
  bookings: Booking[];
  lastAt: number;
}

const BOOKING_STATUS_COLOR: Record<string, string> = {
  pending: "default",
  confirmed: "processing",
  completed: "success",
  cancelled: "error",
  no_show: "error",
};

export function GuestManagementPanel({ initialSearch = "" }: { initialSearch?: string } = {}) {
  const [search, setSearch] = useState(initialSearch);
  const [selected, setSelected] = useState<GuestRow | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["admin-all-bookings"],
    queryFn: () => listAllBookings(1000),
  });
  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ["admin-all-trips"],
    queryFn: () => listAllTrips(1000),
  });
  const { data: drivers = [] } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: listDriverProfiles,
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["admin-all-vehicles"],
    queryFn: listAllVehicles,
  });

  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);
  const driverByUserId = useMemo(() => new Map(drivers.map((d) => [d.userId, d])), [drivers]);
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const bookingsByTrip = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const booking of bookings) {
      const arr = m.get(booking.tripId) || [];
      arr.push(booking);
      m.set(booking.tripId, arr);
    }
    return m;
  }, [bookings]);
  const hostNameByUserId = useMemo(() => {
    const m = new Map<string, string>();
    drivers.forEach((d) => m.set(d.userId, d.fullName));
    return m;
  }, [drivers]);

  // Build one row per traveler (guest) from their bookings.
  const guests = useMemo<GuestRow[]>(() => {
    const byUser = new Map<string, GuestRow>();
    for (const b of bookings) {
      if (!b.travelerId) continue;
      const primary = getBookingPassengers(b)[0];
      const at = new Date(b.createdAt).getTime();
      const existing = byUser.get(b.travelerId);
      if (existing) {
        existing.bookings.push(b);
        if (at > existing.lastAt) existing.lastAt = at;
      } else {
        byUser.set(b.travelerId, {
          userId: b.travelerId,
          name: primary?.name || b.passengerName || "Guest",
          phone: primary?.phone || b.passengerPhone || "",
          gender: primary?.gender,
          bookings: [b],
          lastAt: at,
        });
      }
    }
    return [...byUser.values()].sort((a, b) => b.lastAt - a.lastAt);
  }, [bookings]);

  const guestUserIds = useMemo(() => guests.map((g) => g.userId), [guests]);
  const { data: userCodes = [] } = useQuery({
    queryKey: ["admin-user-codes", "guests", guestUserIds],
    queryFn: () => getUserCodesAsAdmin(guestUserIds),
    enabled: guestUserIds.length > 0,
  });
  const codeByUserId = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of userCodes) m.set(c.userId, c.memberCode);
    return m;
  }, [userCodes]);

  const guestsWithCodes = useMemo(
    () => guests.map((g) => ({ ...g, memberCode: codeByUserId.get(g.userId) ?? null })),
    [guests, codeByUserId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guestsWithCodes;
    return guestsWithCodes.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.phone.toLowerCase().includes(q) ||
        g.userId.toLowerCase().includes(q) ||
        (g.memberCode ?? "").toLowerCase().includes(q),
    );
  }, [guestsWithCodes, search]);

  const hostNameForTrip = (trip?: Trip) =>
    trip ? trip.hostDisplayName || hostNameByUserId.get(trip.hostId) || "Host" : "—";

  const tripDetail = useMemo(() => {
    if (!selectedBooking) return null;
    const trip = tripById.get(selectedBooking.tripId);
    if (!trip) return { booking: selectedBooking, trip: null };

    const tripBookings = bookingsByTrip.get(trip.id) || [];
    const vehicle = trip.vehicleId ? vehicleById.get(trip.vehicleId) : undefined;
    const host = driverByUserId.get(trip.hostId);
    const assignedDriver =
      trip.assignedDriverId && trip.assignedDriverId !== trip.hostId
        ? driverByUserId.get(trip.assignedDriverId)
        : host;
    const selectedPassengers = getBookingPassengers(selectedBooking);
    const tripPassengers = tripBookings.flatMap((b) =>
      getBookingPassengers(b).map((p) => ({
        ...p,
        booking: b,
        otp: b.otp,
        verified: b.verified,
        price: b.segmentPrice,
      })),
    );
    const tripGross = tripBookings.reduce((sum, b) => sum + b.segmentPrice * b.seatsBooked, 0);
    const bookingTotal = selectedBooking.segmentPrice * selectedBooking.seatsBooked;
    const activeSeats = tripBookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .reduce((sum, b) => sum + b.seatsBooked, 0);

    return {
      booking: selectedBooking,
      trip,
      tripBookings,
      vehicle,
      host,
      assignedDriver,
      selectedPassengers,
      tripPassengers,
      tripGross,
      bookingTotal,
      activeSeats,
      hostNet: trip.status === "completed" ? hostNetEarnings(tripGross) : 0,
    };
  }, [selectedBooking, tripById, bookingsByTrip, vehicleById, driverByUserId]);

  const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
  const perSeat = (value: number) => `${money(value)}/seat`;
  const dateTime = (value?: string) => (value ? new Date(value).toLocaleString("en-IN") : "—");

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-1">
        <Title level={2} style={{ margin: 0 }}>
          Guest Management
        </Title>
        <Text type="secondary">
          Everyone who has booked a ride. Search by name, phone, or user ID.
        </Text>
      </div>

      <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md p-2 overflow-hidden">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <Input.Search
            allowClear
            placeholder="Search guests by name, phone, or user ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 420 }}
          />
          <CreateUserButton role="guest" />
        </div>
        <Table
          scroll={{ x: "max-content" }}
          rowKey="userId"
          loading={bookingsLoading || tripsLoading}
          dataSource={filtered}
          locale={{ emptyText: "No guests found." }}
          pagination={{ pageSize: 10 }}
          onRow={(g) => ({ onClick: () => setSelected(g), style: { cursor: "pointer" } })}
          columns={[
            {
              title: "Member ID",
              key: "memberCode",
              render: (_, g) => (
                <Text type="secondary" className="font-mono text-xs">
                  {g.memberCode || "—"}
                </Text>
              ),
            },
            {
              title: "Name",
              key: "name",
              render: (_, g) => (
                <div>
                  <Text strong>{g.name}</Text>
                  {g.gender && (
                    <span className="ml-2 text-xs text-muted-foreground capitalize">
                      {g.gender}
                    </span>
                  )}
                </div>
              ),
            },
            { title: "Phone", dataIndex: "phone", key: "phone", render: (v: string) => v || "—" },
            { title: "Bookings", key: "count", render: (_, g) => g.bookings.length },
            {
              title: "Last booking",
              key: "last",
              render: (_, g) => new Date(g.lastAt).toLocaleDateString("en-IN"),
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setSelectedBooking(null);
        }}
        placement="right"
        width={Math.min(520, typeof window !== "undefined" ? window.innerWidth : 520)}
        title={selected?.name}
      >
        {selected && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-gray-50 p-4 space-y-1 text-sm">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <UserIcon size={16} /> {selected.name}
                {selected.gender && (
                  <span className="text-xs font-normal text-muted-foreground capitalize">
                    · {selected.gender}
                  </span>
                )}
              </div>
              <div className="text-muted-foreground">Phone: {selected.phone || "—"}</div>
              <div className="text-muted-foreground">
                Member ID: {selected.memberCode || <span className="break-all">{selected.userId}</span>}
              </div>
              <div className="text-muted-foreground">{selected.bookings.length} booking(s)</div>
            </div>

            <div>
              <Text strong className="block mb-2">
                Trips booked
              </Text>
              <div className="space-y-2">
                {selected.bookings
                  .slice()
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((b) => {
                    const trip = tripById.get(b.tripId);
                    const seats = getBookingPassengers(b)
                      .map((p) => passengerSeatLabel(p.seatCode))
                      .join(", ");
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBooking(b)}
                        className="w-full rounded-xl border border-gray-100 bg-white p-3 text-left text-sm transition hover:border-primary/40 hover:shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            {trip
                              ? `${trip.fromLocation.split(",")[0]} → ${trip.toLocation.split(",")[0]}`
                              : "Trip not found"}
                          </span>
                          <Tag
                            color={BOOKING_STATUS_COLOR[b.status] || "default"}
                            bordered={false}
                            className="capitalize m-0"
                          >
                            {b.status === "no_show" ? "No-show" : b.status}
                          </Tag>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {trip ? new Date(trip.departureAt).toLocaleString("en-IN") : "—"}
                          {seats ? ` · Seat ${seats}` : ""} · {perSeat(b.segmentPrice)}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Host: {hostNameForTrip(trip)}
                          {b.otp ? ` · OTP ${b.otp}${b.verified ? " ✓" : ""}` : ""}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="space-y-2">
              <ResetPasswordButton userId={selected.userId} block />
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={!!tripDetail}
        onCancel={() => setSelectedBooking(null)}
        footer={null}
        width={Math.min(820, typeof window !== "undefined" ? window.innerWidth - 24 : 820)}
        title={
          tripDetail?.trip
            ? `${tripDetail.trip.fromLocation.split(",")[0]} → ${tripDetail.trip.toLocation.split(",")[0]}`
            : "Trip details"
        }
      >
        {tripDetail &&
          (tripDetail.trip ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-muted-foreground">Booking</div>
                  <div className="font-semibold capitalize">
                    {tripDetail.booking.status === "no_show"
                      ? "No-show"
                      : tripDetail.booking.status}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-muted-foreground">Guest paid</div>
                  <div className="font-semibold">
                    {money(tripDetail.bookingTotal)} · {perSeat(tripDetail.booking.segmentPrice)}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-muted-foreground">Trip collected</div>
                  <div className="font-semibold">{money(tripDetail.tripGross)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-muted-foreground">Seats</div>
                  <div className="font-semibold">
                    {tripDetail.activeSeats}/{tripDetail.trip.totalSeats} booked
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-gray-100 p-3 text-sm">
                  <Text strong className="mb-2 flex items-center gap-1.5">
                    <RouteIcon size={15} /> Route and schedule
                  </Text>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <div>From: {tripDetail.trip.fromLocation}</div>
                    <div>To: {tripDetail.trip.toLocation}</div>
                    <div>Departure: {dateTime(tripDetail.trip.departureAt)}</div>
                    <div>Arrival: {dateTime(tripDetail.trip.arrivalAt)}</div>
                    <div>
                      Distance: {tripDetail.trip.totalDistanceKm || "—"} km · Base fare{" "}
                      {perSeat(tripDetail.trip.totalPrice || 0)}
                    </div>
                    <div>Trip status: {tripDetail.trip.status}</div>
                    <div>Trip ID: {tripDetail.trip.tripCode || tripDetail.trip.id}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 p-3 text-sm">
                  <Text strong className="mb-2 flex items-center gap-1.5">
                    <Car size={15} /> Host, driver and vehicle
                  </Text>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <div>
                      Host: {tripDetail.host?.fullName || tripDetail.trip.hostDisplayName || "—"}
                    </div>
                    <div>Host phone: {tripDetail.host?.phone || "—"}</div>
                    <div>Assigned driver: {tripDetail.assignedDriver?.fullName || "Host"}</div>
                    <div>Driver phone: {tripDetail.assignedDriver?.phone || "—"}</div>
                    <div>License: {tripDetail.assignedDriver?.licenseNumber || "—"}</div>
                    <div>
                      Vehicle:{" "}
                      {tripDetail.vehicle?.modelName || tripDetail.trip.vehicleModel || "—"}
                      {tripDetail.vehicle?.plateNumber
                        ? ` · ${tripDetail.vehicle.plateNumber} (${formatVehicleCode(tripDetail.vehicle.plateNumber)})`
                        : ""}
                    </div>
                    <div>
                      Color/seats:{" "}
                      {tripDetail.vehicle?.color || tripDetail.trip.vehicleColor || "—"} ·{" "}
                      {tripDetail.vehicle?.seatCapacity || tripDetail.trip.totalSeats} seats
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 p-3">
                <Text strong>
                  This guest's passenger details ({tripDetail.selectedPassengers.length})
                </Text>
                <div className="mt-3 space-y-2">
                  {tripDetail.selectedPassengers.map((p, index) => (
                    <div
                      key={`${p.seatCode}-${index}`}
                      className="grid gap-2 rounded-lg bg-gray-50 p-2 text-xs sm:grid-cols-4"
                    >
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-muted-foreground">
                          {passengerGenderLabel(p.gender)} · {p.phone || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Seat</div>
                        <div className="font-semibold">{passengerSeatLabel(p.seatCode)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">OTP</div>
                        <div className="font-semibold">
                          {tripDetail.booking.otp || "—"}
                          {tripDetail.booking.verified ? " · verified" : ""}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Price</div>
                        <div className="font-semibold">
                          {perSeat(tripDetail.booking.segmentPrice)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 p-3">
                <Text strong>
                  Full trip passenger manifest ({tripDetail.tripPassengers.length})
                </Text>
                <div className="mt-3 space-y-2">
                  {tripDetail.tripPassengers.length === 0 && (
                    <Text type="secondary">No passengers on this trip.</Text>
                  )}
                  {tripDetail.tripPassengers.map((p, index) => (
                    <div
                      key={`${p.booking.id}-${index}`}
                      className="grid gap-2 rounded-lg bg-gray-50 p-2 text-xs sm:grid-cols-4"
                    >
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-muted-foreground">
                          {passengerGenderLabel(p.gender)} · {p.phone || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Seat</div>
                        <div className="font-semibold">{passengerSeatLabel(p.seatCode)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">OTP</div>
                        <div className="font-semibold">
                          {p.otp || "—"}
                          {p.verified ? " · verified" : ""}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Booking</div>
                        <div className="font-semibold capitalize">
                          {p.booking.status} · {perSeat(p.price)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 p-3">
                <Text strong>Booking record</Text>
                <div className="mt-3 rounded-lg bg-gray-50 p-2 text-xs">
                  <div className="font-semibold">
                    Seat(s):{" "}
                    {tripDetail.selectedPassengers
                      .map((p) => passengerSeatLabel(p.seatCode))
                      .join(", ") || "—"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Booking ID: {tripDetail.booking.id} · Traveler ID:{" "}
                    {tripDetail.booking.travelerId || "—"} · Seats {tripDetail.booking.seatsBooked}{" "}
                    · {perSeat(tripDetail.booking.segmentPrice)} · Total{" "}
                    {money(tripDetail.bookingTotal)} · Created{" "}
                    {dateTime(tripDetail.booking.createdAt)}
                  </div>
                </div>
              </div>

              {tripDetail.hostNet > 0 && (
                <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                  Completed trip host net: {money(tripDetail.hostNet)}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-gray-50 p-4 text-sm">
              Trip not found for booking {tripDetail.booking.id}. Booking price:{" "}
              {perSeat(tripDetail.booking.segmentPrice)}.
            </div>
          ))}
      </Modal>
    </div>
  );
}
