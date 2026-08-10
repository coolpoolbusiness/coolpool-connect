// Exercises the REAL repository.server.ts functions against the local Postgres
// loaded with production data — proves the reads that render the whole app.
import {
  listTrips, listActiveTrips, listAllTrips, getTripByCode, listHostTrips,
  listTripStopsByTripIds, listTripBookings, listAllBookings,
  listTripSeatReservationsByTripIds, listAllPayoutRequests, getBankAccount,
} from "../../src/integrations/postgres/repository.server.ts";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  cond ? pass++ : fail++;
};

const all = await listAllTrips(1000);
check("listAllTrips returns 74 trips", all.length === 74, `got ${all.length}`);
check("trip mapped with camelCase fields", !!all[0].fromLocation && typeof all[0].totalPrice === "number");

const active = await listActiveTrips();
check("listActiveTrips only scheduled+future", active.every((t) => t.status === "scheduled"), `${active.length} active`);

const coded = all.find((t) => t.tripCode);
const byCode = await getTripByCode(coded!.tripCode!);
check("getTripByCode resolves a real trip", byCode?.id === coded!.id, coded!.tripCode!);

const hostId = all[0].hostId;
const hostTrips = await listHostTrips(hostId);
check("listHostTrips filters by host", hostTrips.every((t) => t.hostId === hostId), `${hostTrips.length} for host`);

const stops = await listTripStopsByTripIds(all.slice(0, 10).map((t) => t.id));
check("listTripStopsByTripIds returns stops", stops.length > 0, `${stops.length} stops`);
check("stops sorted + typed", stops.every((s) => typeof s.stopIndex === "number"));

const bookings = await listAllBookings();
check("listAllBookings returns 14", bookings.length === 14, `got ${bookings.length}`);
const withTrip = bookings[0];
const tripBk = await listTripBookings(withTrip.tripId);
check("listTripBookings filters by trip", tripBk.every((b) => b.tripId === withTrip.tripId));

const seats = await listTripSeatReservationsByTripIds([...new Set(bookings.map((b) => b.tripId))]);
check("seat reservations load", seats.length > 0, `${seats.length} seats`);

const payouts = await listAllPayoutRequests();
check("listAllPayoutRequests returns 2", payouts.length === 2, `got ${payouts.length}`);
check("payout deduction/paidAmount defaulted", payouts.every((p) => typeof p.deduction === "number"));

const bank = await getBankAccount(payouts[0]?.driverUserId ?? "");
check("getBankAccount runs", bank === null || !!bank.accountNumber);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
