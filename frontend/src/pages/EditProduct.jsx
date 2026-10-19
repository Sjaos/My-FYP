import {
  useEffect,
  useState,
} from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  API,
  api,
  currentUser,
} from "../api";

const categories = [
  "Electronics",
  "Furniture",
  "Books",
  "Fashion",
  "Sports",
  "Vehicles",
  "Mobile Phones",
  "Home Appliances",
  "Toys",
  "Other",
];

export default function EditProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isBusinessSeller =
    currentUser()?.role === "business_seller";

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Electronics",
    price: "",
    stockQuantity: "1",
    itemCondition: "Good",
    usageDuration: "",
    defects: "",
    location: "",
    isSale: false,
    freeShipping: false,
  });

  const [existingImage, setExistingImage] =
    useState("");
  const [newImage, setNewImage] =
    useState(null);
  const [newImagePreview, setNewImagePreview] =
    useState("");
  const [removeImage, setRemoveImage] =
    useState(false);
  const [loading, setLoading] =
    useState(true);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      try {
        const product = await api(
          `/api/products/${id}/manage`
        );

        if (cancelled) {
          return;
        }

        setForm({
          title: product.title || "",
          description:
            product.description || "",
          category:
            product.category ||
            "Electronics",
          price: product.price || "",
          stockQuantity:
            product.stockQuantity || 1,
          itemCondition:
            product.itemCondition || "Good",
          usageDuration:
            product.usageDuration || "",
          defects: product.defects || "",
          location: product.location || "",
          isSale: Boolean(
            product.isSale
          ),
          freeShipping: Boolean(
            product.freeShipping
          ),
        });

        setExistingImage(
          product.imageUrl || ""
        );
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProduct();

    return () => {
      cancelled = true;

      if (newImagePreview) {
        URL.revokeObjectURL(
          newImagePreview
        );
      }
    };
  }, [id]);

  function handleField(event) {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setForm((previousForm) => ({
      ...previousForm,
      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));
  }

  function handleImage(event) {
    const selectedFile =
      event.target.files?.[0] || null;

    if (newImagePreview) {
      URL.revokeObjectURL(
        newImagePreview
      );
    }

    setNewImage(selectedFile);
    setNewImagePreview(
      selectedFile
        ? URL.createObjectURL(selectedFile)
        : ""
    );

    if (selectedFile) {
      setRemoveImage(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (Number(form.price) <= 0) {
      setError(
        "Price must be greater than zero."
      );
      return;
    }

    const formData = new FormData();

    if (!isBusinessSeller && !form.location.trim()) {
      setError("Please enter the item's location.");
      return;
    }

    const listing = {
      ...form,
      sellerType: isBusinessSeller
        ? "business_seller"
        : "individual_seller",
      condition: isBusinessSeller ? "New" : "Used",
      productType: isBusinessSeller ? "new" : "used",
      stockQuantity: isBusinessSeller
        ? form.stockQuantity
        : "1",
      sellingMethod: "fixed_price",
    };

    Object.entries(listing).forEach(
      ([key, value]) => {
        formData.append(
          key,
          String(value)
        );
      }
    );

    formData.append(
      "removeImage",
      String(removeImage)
    );

    if (newImage) {
      formData.append(
        "image",
        newImage
      );
    }

    try {
      setSubmitting(true);

      await api(`/api/products/${id}`, {
        method: "PUT",
        body: formData,
      });

      navigate("/my-listings", {
        state: {
          message:
            "Product listing updated successfully.",
        },
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main>
        <p className="empty">
          Loading listing...
        </p>
      </main>
    );
  }

  if (error && !form.title) {
    return (
      <main>
        <p className="error">{error}</p>
      </main>
    );
  }

  const imageToDisplay =
    newImagePreview ||
    (
      existingImage &&
      !removeImage
        ? existingImage.startsWith("http")
          ? existingImage
          : `${API}${existingImage}`
        : ""
    );

  return (
    <main className="narrow">
      <form onSubmit={handleSubmit}>
        <h2>
          {isBusinessSeller
            ? "Edit Business Product"
            : "Edit Pre-Owned Listing"}
        </h2>

        {error && (
          <p className="error">{error}</p>
        )}

        <label>
          Product title
          <input
            name="title"
            type="text"
            value={form.title}
            onChange={handleField}
            maxLength="120"
            required
          />
        </label>

        <label>
          Description
          <textarea
            name="description"
            value={form.description}
            onChange={handleField}
            maxLength="1500"
            rows="6"
            required
          />
        </label>

        <label>
          Category
          <select
            name="category"
            value={form.category}
            onChange={handleField}
            required
          >
            {categories.map((category) => (
              <option
                key={category}
                value={category}
              >
                {category}
              </option>
            ))}
          </select>
        </label>

        {isBusinessSeller ? (
          <label>
            Product condition
            <input value="New" readOnly />
          </label>
        ) : (
          <>
            <label>
              Item condition
              <select
                name="itemCondition"
                value={form.itemCondition}
                onChange={handleField}
                required
              >
                <option value="Like New">Like New</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
              </select>
            </label>
            <label>
              Usage duration
              <input
                name="usageDuration"
                value={form.usageDuration}
                onChange={handleField}
                maxLength="100"
                required
              />
            </label>
            <label>
              Defects or wear
              <textarea
                name="defects"
                value={form.defects}
                onChange={handleField}
                maxLength="1000"
                rows="3"
                required
              />
            </label>
            <label>
              Item location
              <input
                name="location"
                value={form.location}
                onChange={handleField}
                maxLength="120"
                required
              />
            </label>
          </>
        )}

        <label>
          Price in PKR
          <input
            name="price"
            type="number"
            min="1"
            max="2147483647"
            step="1"
            value={form.price}
            onChange={handleField}
            required
          />
        </label>

        {isBusinessSeller && (
          <label>
            Available stock
            <input
              name="stockQuantity"
              type="number"
              min="1"
              step="1"
              value={form.stockQuantity}
              onChange={handleField}
              required
            />
          </label>
        )}

        <fieldset>
          <legend>Listing options</legend>

          <label className="checkbox-row">
            <input
              type="checkbox"
              name="isSale"
              checked={form.isSale}
              onChange={handleField}
            />
            <span>On sale</span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              name="freeShipping"
              checked={
                form.freeShipping
              }
              onChange={handleField}
            />
            <span>Free shipping</span>
          </label>
        </fieldset>

        {imageToDisplay && (
          <div className="listing-image-preview">
            <img
              src={imageToDisplay}
              alt="Product preview"
            />
          </div>
        )}

        <label>
          Replace image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImage}
          />
        </label>

        {existingImage && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={removeImage}
              onChange={(event) => {
                setRemoveImage(
                  event.target.checked
                );

                if (
                  event.target.checked
                ) {
                  setNewImage(null);
                  setNewImagePreview("");
                }
              }}
            />
            <span>
              Remove current image
            </span>
          </label>
        )}

        <button
          className="button block"
          type="submit"
          disabled={submitting}
        >
          {submitting
            ? "Saving..."
            : "Save Changes"}
        </button>

        <button
          className="secondary-button block"
          type="button"
          onClick={() =>
            navigate("/my-listings")
          }
        >
          Cancel
        </button>
      </form>
    </main>
  );
}