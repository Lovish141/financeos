import type { OrderRequestStatus } from "@prisma/client";

// Human labels + Badge tones for the order-request lifecycle, shared by the
// buyer portal and the staff review screen so both read consistently.
export const REQUEST_STATUS_LABEL: Record<OrderRequestStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const REQUEST_STATUS_TONE: Record<OrderRequestStatus, string> = {
  DRAFT: "gray",
  SUBMITTED: "blue",
  UNDER_REVIEW: "yellow",
  CHANGES_REQUESTED: "yellow",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "gray",
};
