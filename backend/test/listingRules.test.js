import assert from "node:assert/strict";
import test from "node:test";
import {
  listingStatusError,
} from "../src/listingRules.js";

test("sold listings cannot be reactivated or made inactive", () => {
  const soldProduct = {
    status: "sold",
    stockQuantity: 0,
  };

  assert.equal(
    listingStatusError(soldProduct, "active"),
    "Sold listings cannot be reactivated."
  );
  assert.equal(
    listingStatusError(soldProduct, "inactive"),
    "Sold listings cannot be reactivated."
  );
  assert.equal(
    listingStatusError(soldProduct, "sold"),
    null
  );
});

test("business listings require stock before activation", () => {
  assert.equal(
    listingStatusError(
      {
        status: "inactive",
        stockQuantity: 0,
      },
      "active"
    ),
    "Add available stock before activating this listing."
  );

  assert.equal(
    listingStatusError(
      {
        status: "inactive",
        stockQuantity: 3,
      },
      "active"
    ),
    null
  );
});

test("inactive listings can be marked sold", () => {
  assert.equal(
    listingStatusError(
      {
        status: "inactive",
        stockQuantity: 1,
      },
      "sold"
    ),
    null
  );
});
