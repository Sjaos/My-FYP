import { Router } from "express";
import fs from "fs";
import path from "path";

import {
  supabase,
} from "../config/supabase.js";

import {
  auth,
  role,
} from "../middleware/auth.js";

import {
  upload,
} from "../middleware/upload.js";

import {
  clean,
  normalize,
  mapProduct,
  publicProduct,
} from "../utils.js";
import {
  listingStatusError,
} from "../listingRules.js";

const router = Router();

const allowedConditions = new Set([
  "New",
  "Used",
]);

const allowedStatuses = new Set([
  "active",
  "inactive",
  "sold",
]);
const allowedItemConditions = new Set([
  "Like New",
  "Good",
  "Fair",
]);

function parseBoolean(
  value,
  fallback = false
) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return (
    value === true ||
    value === "true" ||
    value === "1" ||
    value === 1
  );
}

function deleteUploadedFile(imageUrl) {
  if (
    !imageUrl ||
    !imageUrl.startsWith("/uploads/")
  ) {
    return;
  }

  const fileName =
    path.basename(imageUrl);

  const filePath =
    path.resolve(
      process.cwd(),
      "uploads",
      fileName
    );

  fs.unlink(
    filePath,
    (error) => {
      if (
        error &&
        error.code !== "ENOENT"
      ) {
        console.error(
          "Image deletion error:",
          error
        );
      }
    }
  );
}

function uploadedImageUrl(file) {
  return file
    ? `/uploads/${file.filename}`
    : null;
}

function validateProductFields({
  title,
  description,
  category,
  condition,
  price,
}) {
  if (!title) {
    return "Product title is required";
  }

  if (title.length > 120) {
    return (
      "Product title cannot exceed " +
      "120 characters"
    );
  }

  if (!description) {
    return (
      "Product description is required"
    );
  }

  if (description.length > 1500) {
    return (
      "Product description cannot exceed " +
      "1500 characters"
    );
  }

  if (!category) {
    return "Product category is required";
  }

  if (
    !allowedConditions.has(condition)
  ) {
    return (
      "Condition must be New or Used"
    );
  }

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return (
      "Price must be greater than zero"
    );
  }

  return null;
}

function listingDetails(body, userRole) {
  const sellerType =
    userRole === "business_seller"
      ? "business_seller"
      : "individual_seller";
  const isBusinessSeller =
    sellerType === "business_seller";
  const stockQuantity = Number(
    body.stockQuantity
  );
  const itemCondition = clean(
    body.itemCondition
  );
  const usageDuration = clean(
    body.usageDuration
  );
  const defects = clean(body.defects);
  const location = clean(body.location);

  if (
    body.sellingMethod &&
    body.sellingMethod !== "fixed_price"
  ) {
    return {
      error:
        "Live bidding is not enabled in this release; listings must use a fixed price.",
    };
  }

  if (isBusinessSeller) {
    if (
      !Number.isSafeInteger(stockQuantity) ||
      stockQuantity < 1 ||
      stockQuantity > 2147483647
    ) {
      return {
        error:
          "Business listings require a whole-number stock quantity between 1 and 2147483647.",
      };
    }

    return {
      sellerType,
      productType: "new",
      condition: "New",
      stockQuantity,
      itemCondition: null,
      usageDuration: null,
      defects: null,
      location: null,
      sellingMethod: "fixed_price",
    };
  }

  if (!allowedItemConditions.has(itemCondition)) {
    return {
      error:
        "Individual listings require condition Like New, Good or Fair.",
    };
  }

  if (!location || location.length > 120) {
    return {
      error:
        "Individual listings require a location of no more than 120 characters.",
    };
  }

  if (usageDuration.length > 100) {
    return {
      error:
        "Usage duration cannot exceed 100 characters.",
    };
  }

  if (!usageDuration) {
    return {
      error:
        "Individual listings require the item's usage duration.",
    };
  }

  if (!defects) {
    return {
      error:
        "Describe known defects or enter None if there are none.",
    };
  }

  if (defects.length > 1000) {
    return {
      error:
        "Defects information cannot exceed 1000 characters.",
    };
  }

  return {
    sellerType,
    productType: "used",
    condition: "Used",
    stockQuantity: 1,
    itemCondition,
    usageDuration: usageDuration || null,
    defects: defects || null,
    location,
    sellingMethod: "fixed_price",
  };
}

async function getSellerProduct(
  productId,
  sellerId
) {
  const {
    data,
    error,
  } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error(
      "Fetch seller product error:",
      error
    );

    return {
      error: {
        status: 500,
        message:
          "Product could not be loaded",
      },
    };
  }

  if (!data) {
    return {
      error: {
        status: 404,
        message: "Product not found",
      },
    };
  }

  if (data.seller_id !== sellerId) {
    return {
      error: {
        status: 403,
        message:
          "You can manage only your own listings",
      },
    };
  }

  return {
    row: data,
    product: mapProduct(data),
  };
}

/*
  Public active products

  Supports:
  - Search
  - Category
  - Condition
  - Minimum price
  - Maximum price
  - Sale items
  - Free shipping
  - Sorting
*/
router.get(
  "/",
  async (request, response) => {
    try {
      const {
        q,
        category,
        condition,
        minPrice,
        maxPrice,
        isSale,
        freeShipping,
        sellerType,
        productType,
        sort = "newest",
      } = request.query;

      let query = supabase
        .from("products")
        .select("*")
        .eq("status", "active");

      if (category) {
        query = query.ilike(
          "category",
          clean(category)
        );
      }

      if (condition) {
        query = query.ilike(
          "condition",
          clean(condition)
        );
      }

      if (
        sellerType === "business_seller" ||
        sellerType === "individual_seller"
      ) {
        query = query.eq(
          "seller_type",
          sellerType
        );
      }

      if (
        productType === "new" ||
        productType === "used"
      ) {
        query = query.eq(
          "product_type",
          productType
        );
      }

      if (
        minPrice !== undefined &&
        minPrice !== ""
      ) {
        const minimumPrice =
          Number(minPrice);

        if (
          Number.isFinite(minimumPrice)
        ) {
          query = query.gte(
            "price",
            minimumPrice
          );
        }
      }

      if (
        maxPrice !== undefined &&
        maxPrice !== ""
      ) {
        const maximumPrice =
          Number(maxPrice);

        if (
          Number.isFinite(maximumPrice)
        ) {
          query = query.lte(
            "price",
            maximumPrice
          );
        }
      }

      if (isSale === "true") {
        query = query.eq(
          "is_sale",
          true
        );
      }

      if (freeShipping === "true") {
        query = query.eq(
          "free_shipping",
          true
        );
      }

      if (sort === "price_asc") {
        query = query.order(
          "price",
          {
            ascending: true,
          }
        );
      } else if (
        sort === "price_desc"
      ) {
        query = query.order(
          "price",
          {
            ascending: false,
          }
        );
      } else if (
        sort === "oldest"
      ) {
        query = query.order(
          "created_at",
          {
            ascending: true,
          }
        );
      } else {
        query = query.order(
          "created_at",
          {
            ascending: false,
          }
        );
      }

      const {
        data,
        error,
      } = await query;

      if (error) {
        console.error(
          "Fetch products error:",
          error
        );

        return response
          .status(500)
          .json({
            message:
              "Products could not be loaded",
          });
      }

      let products = (data || []).map(
        mapProduct
      );

      /*
        Search frontend-compatible rakhi hai.
        Title, description, category aur
        condition check honge.
      */
      if (q) {
        const searchText =
          normalize(q);

        products = products.filter(
          (product) =>
            [
              product.title,
              product.description,
              product.category,
              product.condition,
              product.itemCondition,
              product.location,
            ].some((value) =>
              normalize(value).includes(
                searchText
              )
            )
        );
      }

      return response.json(
        products.map(publicProduct)
      );
    } catch (error) {
      console.error(
        "Public products error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Products could not be loaded",
        });
    }
  }
);

/*
  Logged-in seller ki tamam listings
*/
router.get(
  "/mine",
  auth,
  role("seller"),
  async (request, response) => {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("products")
        .select("*")
        .eq(
          "seller_id",
          request.user.id
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (error) {
        console.error(
          "Fetch seller listings error:",
          error
        );

        return response
          .status(500)
          .json({
            message:
              "Your listings could not be loaded",
          });
      }

      return response.json(
        (data || [])
          .map(mapProduct)
          .map(publicProduct)
      );
    } catch (error) {
      console.error(
        "Seller listings error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Your listings could not be loaded",
        });
    }
  }
);

/*
  Seller listing summary
*/
router.get(
  "/mine/summary",
  auth,
  role("seller"),
  async (request, response) => {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("products")
        .select("status")
        .eq(
          "seller_id",
          request.user.id
        );

      if (error) {
        console.error(
          "Listing summary error:",
          error
        );

        return response
          .status(500)
          .json({
            message:
              "Listing summary could not be loaded",
          });
      }

      const products = data || [];

      const summary = {
        total: products.length,

        active: products.filter(
          (product) =>
            product.status ===
            "active"
        ).length,

        inactive: products.filter(
          (product) =>
            product.status ===
            "inactive"
        ).length,

        sold: products.filter(
          (product) =>
            product.status ===
            "sold"
        ).length,
      };

      return response.json(summary);
    } catch (error) {
      console.error(
        "Listing summary error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Listing summary could not be loaded",
        });
    }
  }
);

/*
  Public product details
*/
router.get(
  "/:id",
  async (request, response) => {
    try {
      const {
        data: productRow,
        error: productError,
      } = await supabase
        .from("products")
        .select("*")
        .eq(
          "id",
          request.params.id
        )
        .eq(
          "status",
          "active"
        )
        .maybeSingle();

      if (productError) {
        console.error(
          "Product details error:",
          productError
        );

        return response
          .status(500)
          .json({
            message:
              "Product could not be loaded",
          });
      }

      if (!productRow) {
        return response
          .status(404)
          .json({
            message:
              "Product not found",
          });
      }

      let sellerName = "Seller";

      const {
        data: seller,
        error: sellerError,
      } = await supabase
        .from("users")
        .select("name")
        .eq(
          "id",
          productRow.seller_id
        )
        .maybeSingle();

      if (sellerError) {
        console.error(
          "Product seller error:",
          sellerError
        );
      }

      if (seller?.name) {
        sellerName = seller.name;
      }

      return response.json({
        ...publicProduct(
          mapProduct(productRow)
        ),
        sellerName,
        sellerType:
          productRow.seller_type ||
          null,
      });
    } catch (error) {
      console.error(
        "Product details error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Product could not be loaded",
        });
    }
  }
);

/*
  Seller apni listing edit form
  ke liye load karega
*/
router.get(
  "/:id/manage",
  auth,
  role("seller"),
  async (request, response) => {
    try {
      const result =
        await getSellerProduct(
          request.params.id,
          request.user.id
        );

      if (result.error) {
        return response
          .status(
            result.error.status
          )
          .json({
            message:
              result.error.message,
          });
      }

      return response.json(
        publicProduct(
          result.product
        )
      );
    } catch (error) {
      console.error(
        "Manage product error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Product could not be loaded",
        });
    }
  }
);

/*
  Create product listing
*/
router.post(
  "/",
  auth,
  role("seller"),
  upload.single("image"),
  async (request, response) => {
    const newImageUrl =
      uploadedImageUrl(
        request.file
      );

    try {
      const title = clean(
        request.body.title
      );

      const description = clean(
        request.body.description
      );

      const category =
        clean(
          request.body.category
        ) || "General";

      const price = Number(
        request.body.price
      );
      const details = listingDetails(
        request.body,
        request.user.role
      );

      const isSale =
        parseBoolean(
          request.body.isSale
        );

      const freeShipping =
        parseBoolean(
          request.body.freeShipping
        );

      if (details.error) {
        if (newImageUrl) {
          deleteUploadedFile(newImageUrl);
        }

        return response
          .status(400)
          .json({
            message: details.error,
          });
      }

      const validationError =
        validateProductFields({
          title,
          description,
          category,
          condition: details.condition,
          price,
        });

      if (validationError) {
        if (newImageUrl) {
          deleteUploadedFile(
            newImageUrl
          );
        }

        return response
          .status(400)
          .json({
            message:
              validationError,
          });
      }

      const {
        data,
        error,
      } = await supabase
        .from("products")
        .insert({
          seller_id:
            request.user.id,

          title,

          description,

          category,

          condition: details.condition,

          seller_type:
            details.sellerType,

          product_type:
            details.productType,

          stock_quantity:
            details.stockQuantity,

          item_condition:
            details.itemCondition,

          usage_duration:
            details.usageDuration,

          defects:
            details.defects,

          location:
            details.location,

          selling_method:
            details.sellingMethod,

          price,

          is_sale:
            isSale,

          free_shipping:
            freeShipping,

          image_url:
            newImageUrl,

          status:
            "active",
        })
        .select("*")
        .single();

      if (error) {
        console.error(
          "Supabase create product error:",
          error
        );

        if (newImageUrl) {
          deleteUploadedFile(
            newImageUrl
          );
        }

        if (
          error.code === "23503"
        ) {
          return response
            .status(400)
            .json({
              message:
                "Seller account was not found in Supabase",
            });
        }

        return response
          .status(500)
          .json({
            message:
              "Product listing could not be created",
          });
      }

      return response
        .status(201)
        .json({
          message:
            "Product listing created successfully",

          product:
            publicProduct(
              mapProduct(data)
            ),
        });
    } catch (error) {
      console.error(
        "Create product error:",
        error
      );

      if (newImageUrl) {
        deleteUploadedFile(
          newImageUrl
        );
      }

      return response
        .status(500)
        .json({
          message:
            "Product listing could not be created",
        });
    }
  }
);

/*
  Update product listing
*/
router.put(
  "/:id",
  auth,
  role("seller"),
  upload.single("image"),
  async (request, response) => {
    const uploadedReplacement =
      uploadedImageUrl(
        request.file
      );

    try {
      const result =
        await getSellerProduct(
          request.params.id,
          request.user.id
        );

      if (result.error) {
        if (uploadedReplacement) {
          deleteUploadedFile(
            uploadedReplacement
          );
        }

        return response
          .status(
            result.error.status
          )
          .json({
            message:
              result.error.message,
          });
      }

      const existingProduct =
        result.product;

      const title = clean(
        request.body.title
      );

      const description = clean(
        request.body.description
      );

      const category = clean(
        request.body.category
      );

      const price = Number(
        request.body.price
      );
      const details = listingDetails(
        request.body,
        request.user.role
      );

      if (details.error) {
        if (uploadedReplacement) {
          deleteUploadedFile(uploadedReplacement);
        }

        return response
          .status(400)
          .json({
            message: details.error,
          });
      }

      const validationError =
        validateProductFields({
          title,
          description,
          category,
          condition: details.condition,
          price,
        });

      if (validationError) {
        if (uploadedReplacement) {
          deleteUploadedFile(
            uploadedReplacement
          );
        }

        return response
          .status(400)
          .json({
            message:
              validationError,
          });
      }

      const removeImage =
        parseBoolean(
          request.body.removeImage
        );

      let nextImageUrl =
        existingProduct.imageUrl ||
        null;

      /*
        Old image ko database update
        successful hone ke baad delete
        karenge.
      */
      let oldImageToDelete = null;

      if (
        removeImage &&
        nextImageUrl
      ) {
        oldImageToDelete =
          nextImageUrl;

        nextImageUrl = null;
      }

      if (uploadedReplacement) {
        if (nextImageUrl) {
          oldImageToDelete =
            nextImageUrl;
        }

        nextImageUrl =
          uploadedReplacement;
      }

      const {
        data,
        error,
      } = await supabase
        .from("products")
        .update({
          title,

          description,

          category,

          condition: details.condition,

          seller_type:
            details.sellerType,

          product_type:
            details.productType,

          stock_quantity:
            details.stockQuantity,

          item_condition:
            details.itemCondition,

          usage_duration:
            details.usageDuration,

          defects:
            details.defects,

          location:
            details.location,

          selling_method:
            details.sellingMethod,

          price,

          is_sale:
            parseBoolean(
              request.body.isSale,
              existingProduct.isSale
            ),

          free_shipping:
            parseBoolean(
              request.body
                .freeShipping,
              existingProduct
                .freeShipping
            ),

          image_url:
            nextImageUrl,
        })
        .eq(
          "id",
          request.params.id
        )
        .eq(
          "seller_id",
          request.user.id
        )
        .select("*")
        .single();

      if (error) {
        console.error(
          "Supabase update product error:",
          error
        );

        if (uploadedReplacement) {
          deleteUploadedFile(
            uploadedReplacement
          );
        }

        return response
          .status(500)
          .json({
            message:
              "Product listing could not be updated",
          });
      }

      if (oldImageToDelete) {
        deleteUploadedFile(
          oldImageToDelete
        );
      }

      return response.json({
        message:
          "Product listing updated successfully",

        product:
          publicProduct(
            mapProduct(data)
          ),
      });
    } catch (error) {
      console.error(
        "Update product error:",
        error
      );

      if (uploadedReplacement) {
        deleteUploadedFile(
          uploadedReplacement
        );
      }

      return response
        .status(500)
        .json({
          message:
            "Product listing could not be updated",
        });
    }
  }
);

/*
  Change listing status
*/
router.patch(
  "/:id/status",
  auth,
  role("seller"),
  async (request, response) => {
    try {
      const status = clean(
        request.body.status
      );

      if (
        !allowedStatuses.has(status)
      ) {
        return response
          .status(400)
          .json({
            message:
              "Status must be active, inactive or sold",
          });
      }

      const result =
        await getSellerProduct(
          request.params.id,
          request.user.id
        );

      if (result.error) {
        return response
          .status(
            result.error.status
          )
          .json({
            message:
              result.error.message,
          });
      }

      const statusError =
        listingStatusError(
          result.product,
          status
        );

      if (statusError) {
        return response
          .status(409)
          .json({
            message: statusError,
          });
      }

      const {
        data,
        error,
      } = await supabase
        .from("products")
        .update({
          status,
        })
        .eq(
          "id",
          request.params.id
        )
        .eq(
          "seller_id",
          request.user.id
        )
        .select("*")
        .single();

      if (error) {
        console.error(
          "Update product status error:",
          error
        );

        return response
          .status(500)
          .json({
            message:
              "Listing status could not be changed",
          });
      }

      return response.json({
        message:
          `Listing marked as ${status}`,

        product:
          publicProduct(
            mapProduct(data)
          ),
      });
    } catch (error) {
      console.error(
        "Product status error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Listing status could not be changed",
        });
    }
  }
);

/*
  Permanently delete seller listing

  Agar product kisi order mein use hua
  hai to database restriction deletion
  ko block karegi.
*/
router.delete(
  "/:id",
  auth,
  role("seller"),
  async (request, response) => {
    try {
      const result =
        await getSellerProduct(
          request.params.id,
          request.user.id
        );

      if (result.error) {
        return response
          .status(
            result.error.status
          )
          .json({
            message:
              result.error.message,
          });
      }

      const imageUrl =
        result.product.imageUrl;

      const {
        error,
      } = await supabase
        .from("products")
        .delete()
        .eq(
          "id",
          request.params.id
        )
        .eq(
          "seller_id",
          request.user.id
        );

      if (error) {
        console.error(
          "Delete product error:",
          error
        );

        if (
          error.code === "23503"
        ) {
          return response
            .status(409)
            .json({
              message:
                "This product has an order history and cannot be permanently deleted. Mark it as sold or inactive instead.",
            });
        }

        return response
          .status(500)
          .json({
            message:
              "Product listing could not be deleted",
          });
      }

      if (imageUrl) {
        deleteUploadedFile(
          imageUrl
        );
      }

      return response.json({
        message:
          "Product listing deleted permanently",
      });
    } catch (error) {
      console.error(
        "Delete listing error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Product listing could not be deleted",
        });
    }
  }
);

export default router;
