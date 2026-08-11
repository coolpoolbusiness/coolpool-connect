export interface AppwriteCollectionIds {
  trips: string;
  tripStops: string;
  tripSeatReservations: string;
  bookings: string;
  userRoles: string;
  pricingRules: string;
  profiles: string;
  drivers: string;
  vehicles: string;
  heroBanners: string;
  bankAccounts: string;
  payoutRequests: string;
  reviews: string;
  tripShares: string;
  deletedAccounts: string;
  memberVerifications: string;
  noShowReports: string;
}

function optionalCollectionId(value: string | undefined): string {
  return value || "";
}

export interface AppwriteBucketIds {
  driverDocs: string;
  banners: string;
}

function requireCollectionId(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name}. Add it in environment variables.`);
  }
  return value;
}

export function getCollectionIds(): AppwriteCollectionIds {
  return {
    trips: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_TRIPS || process.env.APPWRITE_COLLECTION_TRIPS,
      "VITE_APPWRITE_COLLECTION_TRIPS / APPWRITE_COLLECTION_TRIPS",
    ),
    tripStops: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_TRIP_STOPS ||
        process.env.APPWRITE_COLLECTION_TRIP_STOPS,
      "VITE_APPWRITE_COLLECTION_TRIP_STOPS / APPWRITE_COLLECTION_TRIP_STOPS",
    ),
    tripSeatReservations: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_TRIP_SEAT_RESERVATIONS ||
        process.env.APPWRITE_COLLECTION_TRIP_SEAT_RESERVATIONS,
      "VITE_APPWRITE_COLLECTION_TRIP_SEAT_RESERVATIONS / APPWRITE_COLLECTION_TRIP_SEAT_RESERVATIONS",
    ),
    bookings: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_BOOKINGS || process.env.APPWRITE_COLLECTION_BOOKINGS,
      "VITE_APPWRITE_COLLECTION_BOOKINGS / APPWRITE_COLLECTION_BOOKINGS",
    ),
    userRoles: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_USER_ROLES ||
        process.env.APPWRITE_COLLECTION_USER_ROLES,
      "VITE_APPWRITE_COLLECTION_USER_ROLES / APPWRITE_COLLECTION_USER_ROLES",
    ),
    pricingRules: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_PRICING_RULES ||
        process.env.APPWRITE_COLLECTION_PRICING_RULES,
      "VITE_APPWRITE_COLLECTION_PRICING_RULES / APPWRITE_COLLECTION_PRICING_RULES",
    ),
    profiles: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_PROFILES || process.env.APPWRITE_COLLECTION_PROFILES,
      "VITE_APPWRITE_COLLECTION_PROFILES / APPWRITE_COLLECTION_PROFILES",
    ),
    drivers: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_DRIVERS || process.env.APPWRITE_COLLECTION_DRIVERS,
      "VITE_APPWRITE_COLLECTION_DRIVERS / APPWRITE_COLLECTION_DRIVERS",
    ),
    vehicles: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_VEHICLES || process.env.APPWRITE_COLLECTION_VEHICLES,
      "VITE_APPWRITE_COLLECTION_VEHICLES / APPWRITE_COLLECTION_VEHICLES",
    ),
    heroBanners: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_HERO_BANNERS ||
        process.env.APPWRITE_COLLECTION_HERO_BANNERS,
      "VITE_APPWRITE_COLLECTION_HERO_BANNERS / APPWRITE_COLLECTION_HERO_BANNERS",
    ),
    bankAccounts: optionalCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_BANK_ACCOUNTS ||
        process.env.APPWRITE_COLLECTION_BANK_ACCOUNTS,
    ),
    payoutRequests: optionalCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_PAYOUT_REQUESTS ||
        process.env.APPWRITE_COLLECTION_PAYOUT_REQUESTS,
    ),
    reviews: requireCollectionId(
      import.meta.env.VITE_APPWRITE_COLLECTION_REVIEWS ||
        process.env.APPWRITE_COLLECTION_REVIEWS,
      "VITE_APPWRITE_COLLECTION_REVIEWS / APPWRITE_COLLECTION_REVIEWS",
    ),
    // Powers the public "Track Ride" share links. The collection is created
    // with this fixed ID (see scripts/create-trip-shares-collection.mjs), so we
    // default to it when no env override is set — no per-env config required.
    tripShares:
      import.meta.env.VITE_APPWRITE_COLLECTION_TRIP_SHARES ||
      process.env.APPWRITE_COLLECTION_TRIP_SHARES ||
      "coolpool_trip_shares",
    deletedAccounts:
      import.meta.env.VITE_APPWRITE_COLLECTION_DELETED_ACCOUNTS ||
      process.env.APPWRITE_COLLECTION_DELETED_ACCOUNTS ||
      "coolpool_deleted_accounts",
    // Fixed IDs created by scripts/create-verification-collections.mjs.
    memberVerifications:
      import.meta.env.VITE_APPWRITE_COLLECTION_MEMBER_VERIFICATIONS ||
      process.env.APPWRITE_COLLECTION_MEMBER_VERIFICATIONS ||
      "coolpool_member_verifications",
    noShowReports:
      import.meta.env.VITE_APPWRITE_COLLECTION_NO_SHOW_REPORTS ||
      process.env.APPWRITE_COLLECTION_NO_SHOW_REPORTS ||
      "coolpool_no_show_reports",
  };
}

export function getBucketIds(): AppwriteBucketIds {
  return {
    driverDocs: requireCollectionId(
      import.meta.env.VITE_APPWRITE_DRIVER_DOCS_BUCKET_ID ||
        process.env.APPWRITE_DRIVER_DOCS_BUCKET_ID,
      "VITE_APPWRITE_DRIVER_DOCS_BUCKET_ID / APPWRITE_DRIVER_DOCS_BUCKET_ID",
    ),
    banners: requireCollectionId(
      import.meta.env.VITE_APPWRITE_BANNERS_BUCKET_ID || process.env.APPWRITE_BANNERS_BUCKET_ID,
      "VITE_APPWRITE_BANNERS_BUCKET_ID / APPWRITE_BANNERS_BUCKET_ID",
    ),
  };
}
