import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Typography,
  Table,
  Tag,
  Button,
  Input,
  Drawer,
  Tabs,
  message,
  Popconfirm,
  Space,
  Modal,
} from "antd";
import { ShieldCheck, Car, Users as UsersIcon, Route as RouteIcon } from "lucide-react";
import {
  listDriverProfiles,
  listAllVehicles,
  listAllTrips,
  listAllBookings,
} from "@/data/appwrite-repository";
import { getBookingPassengers } from "@/lib/booking-passengers";
import { passengerGenderLabel, passengerSeatLabel } from "@/lib/passenger-display";
import { hostNetEarnings } from "@/lib/pricing";
import { formatVehicleCode } from "@/lib/vehicleCode";
import { CreateUserButton, ResetPasswordButton } from "./AdminUserActions";
import type { DriverProfile, Trip } from "@/lib/domain";
import { account } from "@/integrations/appwrite/client";
import {
  adminGrantAdminLabel,
  adminUpdateDriverVerification,
  adminUpdateVehicleVerification,
} from "@/integrations/appwrite/account-server";

const { Title, Text } = Typography;

const VERIF_COLOR: Record<string, string> = {
  approved: "success",
  pending: "warning",
  rejected: "error",
};

export function HostManagementPanel({ initialSearch = "" }: { initialSearch?: string } = {}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(initialSearch);
  const [selected, setSelected] = useState<DriverProfile | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: listDriverProfiles,
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["admin-all-vehicles"],
    queryFn: listAllVehicles,
  });
  const { data: trips = [] } = useQuery({
    queryKey: ["admin-all-trips"],
    queryFn: () => listAllTrips(1000),
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-all-bookings"],
    queryFn: () => listAllBookings(1000),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-all-vehicles"] });
  };

  const verifyDriver = useMutation({
    mutationFn: async (v: { id: string; status: "approved" | "rejected" }) => {
      const { jwt } = await account.createJWT();
      await adminUpdateDriverVerification({ data: { jwt, driverId: v.id, status: v.status } });
    },
    onSuccess: () => {
      message.success("Host verification updated");
      invalidate();
    },
    onError: (e: any) => message.error(e?.message || "Failed"),
  });
  const verifyVehicle = useMutation({
    mutationFn: async (v: { id: string; status: "approved" | "rejected" }) => {
      const { jwt } = await account.createJWT();
      await adminUpdateVehicleVerification({ data: { jwt, vehicleId: v.id, status: v.status } });
    },
    onSuccess: () => {
      message.success("Vehicle verification updated");
      invalidate();
    },
    onError: (e: any) => message.error(e?.message || "Failed"),
  });
  const makeAdmin = useMutation({
    mutationFn: async (userId: string) => {
      const { jwt } = await account.createJWT();
      await adminGrantAdminLabel({ data: { jwt, userId } });
    },
    onSuccess: () => message.success("Admin role granted"),
    onError: (e: any) => message.error(e?.message || "Failed"),
  });

  // Hosts = account holders (a profile that isn't owned by another host).
  const hosts = useMemo(
    () => drivers.filter((d) => !d.ownerUserId || d.ownerUserId === d.userId),
    [drivers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hosts;
    return hosts.filter(
      (h) =>
        h.fullName.toLowerCase().includes(q) ||
        (h.email || "").toLowerCase().includes(q) ||
        (h.phone || "").toLowerCase().includes(q) ||
        h.userId.toLowerCase().includes(q) ||
        (h.memberCode || "").toLowerCase().includes(q),
    );
  }, [hosts, search]);

  const detail = useMemo(() => {
    if (!selected) return null;
    const uid = selected.userId;
    const hostVehicles = vehicles.filter((v) => v.driverUserId === uid);
    const teamDrivers = drivers.filter((d) => d.ownerUserId === uid && d.userId !== uid);
    const hostDriverIds = new Set([uid, ...teamDrivers.map((d) => d.userId)]);
    const hostTrips = trips
      .filter((t) => t.hostId === uid)
      .sort((a, b) => new Date(b.departureAt).getTime() - new Date(a.departureAt).getTime());
    const bookingsByTrip = new Map<string, typeof bookings>();
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const arr = bookingsByTrip.get(b.tripId) || [];
      arr.push(b);
      bookingsByTrip.set(b.tripId, arr);
    }
    const grossCompleted = hostTrips
      .filter((t) => t.status === "completed")
      .reduce(
        (sum, t) =>
          sum +
          (bookingsByTrip.get(t.id) || []).reduce((s, b) => s + b.segmentPrice * b.seatsBooked, 0),
        0,
      );
    const driverTripStats = new Map<
      string,
      {
        total: number;
        scheduled: number;
        completed: number;
        cancelled: number;
        collected: number;
        lastTripAt: number;
      }
    >();
    for (const driverId of hostDriverIds) {
      driverTripStats.set(driverId, {
        total: 0,
        scheduled: 0,
        completed: 0,
        cancelled: 0,
        collected: 0,
        lastTripAt: 0,
      });
    }
    for (const t of hostTrips) {
      const driverId = t.assignedDriverId || uid;
      const stats = driverTripStats.get(driverId) || {
        total: 0,
        scheduled: 0,
        completed: 0,
        cancelled: 0,
        collected: 0,
        lastTripAt: 0,
      };
      const collected = (bookingsByTrip.get(t.id) || []).reduce(
        (sum, b) => sum + b.segmentPrice * b.seatsBooked,
        0,
      );
      stats.total += 1;
      if (t.status === "scheduled" || t.status === "in_progress") stats.scheduled += 1;
      if (t.status === "completed") stats.completed += 1;
      if (t.status === "cancelled") stats.cancelled += 1;
      stats.collected += collected;
      stats.lastTripAt = Math.max(stats.lastTripAt, new Date(t.departureAt).getTime());
      driverTripStats.set(driverId, stats);
    }
    return {
      hostVehicles,
      teamDrivers,
      hostTrips,
      bookingsByTrip,
      driverByUserId: new Map(drivers.map((d) => [d.userId, d])),
      vehicleById: new Map(vehicles.map((v) => [v.id, v])),
      driverTripStats,
      netEarnings: hostNetEarnings(grossCompleted),
    };
  }, [selected, vehicles, drivers, trips, bookings]);

  const tripDetail = useMemo(() => {
    if (!selectedTrip || !selected || !detail) return null;
    const tripBookings = detail.bookingsByTrip.get(selectedTrip.id) || [];
    const vehicle = selectedTrip.vehicleId
      ? detail.vehicleById.get(selectedTrip.vehicleId)
      : undefined;
    const assignedDriver =
      selectedTrip.assignedDriverId && selectedTrip.assignedDriverId !== selected.userId
        ? detail.driverByUserId.get(selectedTrip.assignedDriverId)
        : selected;
    const passengers = tripBookings.flatMap((b) =>
      getBookingPassengers(b).map((p) => ({
        ...p,
        booking: b,
        otp: b.otp,
        verified: b.verified,
        price: b.segmentPrice,
      })),
    );
    const gross = tripBookings.reduce((sum, b) => sum + b.segmentPrice * b.seatsBooked, 0);
    const activeBookings = tripBookings.filter(
      (b) => b.status === "confirmed" || b.status === "completed",
    );
    const cancelledBookings = tripBookings.filter(
      (b) => b.status === "cancelled" || b.status === "no_show",
    );

    return {
      trip: selectedTrip,
      tripBookings,
      vehicle,
      assignedDriver,
      passengers,
      gross,
      activeSeats: activeBookings.reduce((sum, b) => sum + b.seatsBooked, 0),
      cancelledSeats: cancelledBookings.reduce((sum, b) => sum + b.seatsBooked, 0),
      hostNet: selectedTrip.status === "completed" ? hostNetEarnings(gross) : 0,
    };
  }, [selectedTrip, selected, detail]);

  const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
  const perSeat = (value: number) => `${money(value)}/seat`;
  const dateTime = (value?: string) => (value ? new Date(value).toLocaleString("en-IN") : "—");

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-2">
        <Title level={1} style={{ margin: 0 }}>
          Host Management
        </Title>
        <Text type="secondary" className="text-base">All hosts. Search by name, email, phone, or user ID.</Text>
      </div>

      <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md overflow-hidden" styles={{ body: { padding: 0 } }}>
        <div className="px-6 py-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/40">
          <Input.Search
            allowClear
            size="large"
            placeholder="Search hosts by name, email, phone, or user ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 460 }}
          />
          <CreateUserButton role="host" />
        </div>
        <Table
          scroll={{ x: "max-content" }}
          rowKey="id"
          loading={driversLoading}
          dataSource={filtered}
          locale={{ emptyText: "No hosts found." }}
          pagination={{ pageSize: 10 }}
          onRow={(h) => ({ onClick: () => setSelected(h), style: { cursor: "pointer" } })}
          columns={[
            {
              title: "Member ID",
              key: "memberCode",
              render: (_, h) => (
                <Text type="secondary" className="font-mono text-xs">
                  {h.memberCode || "—"}
                </Text>
              ),
            },
            {
              title: "Name",
              key: "name",
              render: (_, h) => <Text strong>{h.fullName}</Text>,
            },
            {
              title: "Contact",
              key: "contact",
              render: (_, h) => (
                <div className="text-xs">
                  <div>{h.email || "—"}</div>
                  <div className="text-muted-foreground">{h.phone || "—"}</div>
                </div>
              ),
            },
            {
              title: "Verification",
              key: "verif",
              render: (_, h) => (
                <Tag
                  color={VERIF_COLOR[h.verificationStatus || "pending"]}
                  bordered={false}
                  className="capitalize"
                >
                  {h.verificationStatus || "pending"}
                </Tag>
              ),
            },
            {
              title: "Rating",
              key: "rating",
              render: (_, h) =>
                (h.ratingCount ?? 0) > 0 ? `${(h.ratingAvg ?? 0).toFixed(1)}★` : "New",
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setSelectedTrip(null);
        }}
        placement="right"
        width={Math.min(560, typeof window !== "undefined" ? window.innerWidth : 560)}
        title={selected?.fullName}
      >
        {selected && detail && (
          <Tabs
            defaultActiveKey="profile"
            items={[
              {
                key: "profile",
                label: "Profile",
                children: (
                  <div className="space-y-4">
            {/* Profile */}
            <div className="rounded-2xl bg-gray-50 p-4 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <Text strong>{selected.fullName}</Text>
                <Tag
                  color={VERIF_COLOR[selected.verificationStatus || "pending"]}
                  bordered={false}
                  className="capitalize m-0"
                >
                  {selected.verificationStatus || "pending"}
                </Tag>
              </div>
              <div className="text-muted-foreground">Email: {selected.email || "—"}</div>
              <div className="text-muted-foreground">Phone: {selected.phone || "—"}</div>
              <div className="text-muted-foreground">License: {selected.licenseNumber || "—"}</div>
              <div className="text-muted-foreground">City: {selected.city || "—"}</div>
              {selected.bio && <div className="text-muted-foreground">Bio: {selected.bio}</div>}
              <div className="text-muted-foreground">
                Member ID: {selected.memberCode || <span className="break-all">{selected.userId}</span>}
              </div>
              <div className="font-semibold text-emerald-700 pt-1">
                Net earnings (completed): ₹{detail.netEarnings.toLocaleString("en-IN")}
              </div>
            </div>

            <Space wrap>
              <Popconfirm
                title="Verify this host?"
                onConfirm={() => verifyDriver.mutate({ id: selected.id, status: "approved" })}
              >
                <Button type="primary">Verify</Button>
              </Popconfirm>
              <Popconfirm
                title="Reject this host?"
                onConfirm={() => verifyDriver.mutate({ id: selected.id, status: "rejected" })}
              >
                <Button danger>Reject</Button>
              </Popconfirm>
              <Popconfirm
                title="Grant admin access?"
                onConfirm={() => makeAdmin.mutate(selected.userId)}
              >
                <Button icon={<ShieldCheck size={16} />}>Make Admin</Button>
              </Popconfirm>
              <ResetPasswordButton userId={selected.userId} />
            </Space>
                  </div>
                ),
              },
              {
                key: "vehicles",
                label: `Vehicles (${detail.hostVehicles.length})`,
                children: (
            <div>
              <Text strong className="flex items-center gap-1.5 mb-2">
                <Car size={15} /> Vehicles ({detail.hostVehicles.length})
              </Text>
              <div className="space-y-2">
                {detail.hostVehicles.length === 0 && <Text type="secondary">No vehicles.</Text>}
                {detail.hostVehicles.map((v) => (
                  <div key={v.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{v.modelName}</span>
                      <Tag
                        color={VERIF_COLOR[v.verificationStatus || "pending"]}
                        bordered={false}
                        className="capitalize m-0"
                      >
                        {v.verificationStatus || "pending"}
                      </Tag>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {v.plateNumber}
                      {v.color ? ` · ${v.color}` : ""} · {v.seatCapacity} seats
                    </div>
                    <Space className="mt-2">
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => verifyVehicle.mutate({ id: v.id, status: "approved" })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        danger
                        onClick={() => verifyVehicle.mutate({ id: v.id, status: "rejected" })}
                      >
                        Reject
                      </Button>
                    </Space>
                  </div>
                ))}
              </div>
            </div>
                ),
              },
              {
                key: "drivers",
                label: `Drivers (${detail.teamDrivers.length})`,
                children: (
            <div>
              <Text strong className="flex items-center gap-1.5 mb-2">
                <UsersIcon size={15} /> Drivers under this host ({detail.teamDrivers.length})
              </Text>
              <div className="space-y-2">
                {detail.teamDrivers.length === 0 && (
                  <Text type="secondary">No added drivers under this host.</Text>
                )}
                {detail.teamDrivers.map((d) => {
                  const stats = detail.driverTripStats.get(d.userId);
                  return (
                    <div key={d.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{d.fullName}</span>
                        <Tag
                          color={d.active === false ? "default" : "success"}
                          bordered={false}
                          className="m-0"
                        >
                          {d.active === false ? "Inactive" : "Active"}
                        </Tag>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.phone || "—"} · {d.email || "—"} · License {d.licenseNumber || "—"}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-gray-50 p-2">
                          <div className="text-muted-foreground">Trips</div>
                          <div className="font-semibold">
                            {stats?.total ?? 0} total · {stats?.completed ?? 0} completed
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-2">
                          <div className="text-muted-foreground">Collected</div>
                          <div className="font-semibold">{money(stats?.collected ?? 0)}</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-2">
                          <div className="text-muted-foreground">Open / cancelled</div>
                          <div className="font-semibold">
                            {stats?.scheduled ?? 0} / {stats?.cancelled ?? 0}
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-2">
                          <div className="text-muted-foreground">Last driven</div>
                          <div className="font-semibold">
                            {stats?.lastTripAt
                              ? new Date(stats.lastTripAt).toLocaleDateString("en-IN")
                              : "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
                ),
              },
              {
                key: "trips",
                label: `Trips (${detail.hostTrips.length})`,
                children: (
            <div>
              <Text strong className="block mb-2">
                Trips hosted ({detail.hostTrips.length})
              </Text>
              <div className="space-y-2">
                {detail.hostTrips.length === 0 && <Text type="secondary">No trips yet.</Text>}
                {detail.hostTrips.map((t) => {
                  const tb = detail.bookingsByTrip.get(t.id) || [];
                  const gross = tb.reduce((s, b) => s + b.segmentPrice * b.seatsBooked, 0);
                  const passengers = tb.flatMap((b) =>
                    getBookingPassengers(b).map((p) => ({
                      ...p,
                      otp: b.otp,
                      verified: b.verified,
                      price: b.segmentPrice,
                    })),
                  );
                  const assignedDriver =
                    t.assignedDriverId && t.assignedDriverId !== selected.userId
                      ? detail.driverByUserId.get(t.assignedDriverId)
                      : selected;
                  const vehicle = t.vehicleId ? detail.vehicleById.get(t.vehicleId) : undefined;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTrip(t)}
                      className="w-full rounded-xl border border-gray-100 bg-white p-3 text-left text-sm transition hover:border-primary/40 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {t.fromLocation.split(",")[0]} → {t.toLocation.split(",")[0]}
                        </span>
                        <Tag bordered={false} className="capitalize m-0">
                          {t.status}
                        </Tag>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(t.departureAt).toLocaleString("en-IN")} · collected ₹{gross}
                        {t.status === "completed" ? ` · host net ₹${hostNetEarnings(gross)}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Driver: {assignedDriver?.fullName || "Host"} · Vehicle:{" "}
                        {vehicle?.modelName || t.vehicleModel || "—"}
                      </div>
                      {passengers.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {passengers.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span>
                                {p.name} ({passengerGenderLabel(p.gender)}) · {p.phone}
                              </span>
                              <span className="text-muted-foreground">
                                {passengerSeatLabel(p.seatCode)}
                                {p.verified ? " ✓" : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
                ),
              },
            ]}
          />
        )}
      </Drawer>

      <Modal
        open={!!tripDetail}
        onCancel={() => setSelectedTrip(null)}
        footer={null}
        width={Math.min(820, typeof window !== "undefined" ? window.innerWidth - 24 : 820)}
        title={
          tripDetail
            ? `${tripDetail.trip.fromLocation.split(",")[0]} → ${tripDetail.trip.toLocation.split(",")[0]}`
            : "Trip details"
        }
      >
        {tripDetail && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="font-semibold capitalize">{tripDetail.trip.status}</div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-xs text-muted-foreground">Collected</div>
                <div className="font-semibold">{money(tripDetail.gross)}</div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-xs text-muted-foreground">Host net</div>
                <div className="font-semibold">
                  {tripDetail.hostNet ? money(tripDetail.hostNet) : "—"}
                </div>
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
                  <div>Trip ID: {tripDetail.trip.tripCode || tripDetail.trip.id}</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 p-3 text-sm">
                <Text strong className="mb-2 flex items-center gap-1.5">
                  <Car size={15} /> Driver and vehicle
                </Text>
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <div>Host: {selected?.fullName || "—"}</div>
                  <div>Assigned driver: {tripDetail.assignedDriver?.fullName || "Host"}</div>
                  <div>Driver phone: {tripDetail.assignedDriver?.phone || "—"}</div>
                  <div>License: {tripDetail.assignedDriver?.licenseNumber || "—"}</div>
                  <div>
                    Vehicle: {tripDetail.vehicle?.modelName || tripDetail.trip.vehicleModel || "—"}
                    {tripDetail.vehicle?.plateNumber
                      ? ` · ${tripDetail.vehicle.plateNumber} (${formatVehicleCode(tripDetail.vehicle.plateNumber)})`
                      : ""}
                  </div>
                  <div>
                    Color/seats: {tripDetail.vehicle?.color || tripDetail.trip.vehicleColor || "—"}{" "}
                    · {tripDetail.vehicle?.seatCapacity || tripDetail.trip.totalSeats} seats
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 p-3">
              <Text strong>Passenger manifest ({tripDetail.passengers.length})</Text>
              <div className="mt-3 space-y-2">
                {tripDetail.passengers.length === 0 && (
                  <Text type="secondary">No passengers on this trip.</Text>
                )}
                {tripDetail.passengers.map((p, index) => (
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
              <Text strong>Booking records ({tripDetail.tripBookings.length})</Text>
              <div className="mt-3 space-y-2">
                {tripDetail.tripBookings.length === 0 && (
                  <Text type="secondary">No booking records.</Text>
                )}
                {tripDetail.tripBookings.map((b) => (
                  <div key={b.id} className="rounded-lg bg-gray-50 p-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{b.passengerName || "Passenger"}</span>
                      <Tag bordered={false} className="capitalize m-0">
                        {b.status}
                      </Tag>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Booking ID: {b.id} · Traveler ID: {b.travelerId || "—"} · Seats{" "}
                      {b.seatsBooked} · {perSeat(b.segmentPrice)} · Created {dateTime(b.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {tripDetail.cancelledSeats > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Cancelled/no-show seats recorded: {tripDetail.cancelledSeats}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
