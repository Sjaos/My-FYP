import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, currentUser } from "../api";

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

export default function AddProduct() {
  const navigate = useNavigate();
  const sellerType =
    currentUser()?.role === "business_seller"
      ? "business_seller"
      : "individual_seller";
  const isBusinessSeller =
    sellerType === "business_seller";

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

  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] =
    useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] =
    useState(false);

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

    setImage(selectedFile);

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImagePreview(
      selectedFile
        ? URL.createObjectURL(selectedFile)
        : ""
    );
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

    const listing = {
      ...form,
      sellerType,
      condition: isBusinessSeller ? "New" : "Used",
      productType: isBusinessSeller ? "new" : "used",
      stockQuantity: isBusinessSeller
        ? form.stockQuantity
        : "1",
      sellingMethod: "fixed_price",
    };

    if (!isBusinessSeller && !form.location.trim()) {
      setError("Please enter the item's location.");
      return;
    }

    Object.entries(listing).forEach(
      ([key, value]) => {
        formData.append(
          key,
          String(value)
        );
      }
    );

    if (image) {
      formData.append("image", image);
    }

    try {
      setSubmitting(true);

      await api("/api/products", {
        method: "POST",
        body: formData,
      });

      navigate("/my-listings", {
        state: {
          message:
            "Product listing created successfully.",
        },
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="narrow">
      <form onSubmit={handleSubmit}>
        <h2>
          {isBusinessSeller
            ? "Add New Business Product"
            : "List a Pre-Owned Item"}
        </h2>

        <p className="muted">
          {isBusinessSeller
            ? "Business listings are new products sold at a fixed price with trackable stock."
            : "Individual listings are for used items. Describe their condition and location accurately."}
        </p>

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
            placeholder="Example: HP EliteBook Laptop"
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
            placeholder="Describe specifications, condition and included accessories"
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
                placeholder="Example: 1 year"
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
                placeholder="Mention any known defects; write None if there are none."
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
                placeholder="City or area"
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
            placeholder="Example: 75000"
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
            <span>
              Mark this product as on sale
            </span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              name="freeShipping"
              checked={form.freeShipping}
              onChange={handleField}
            />
            <span>
              Free shipping is available
            </span>
          </label>
        </fieldset>

        <label>
          Product image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImage}
          />
        </label>

        {imagePreview && (
          <div className="listing-image-preview">
            <img
              src={imagePreview}
              alt="Selected product preview"
            />
          </div>
        )}

        <button
          className="button block"
          type="submit"
          disabled={submitting}
        >
          {submitting
            ? "Publishing..."
            : "Publish Product"}
        </button>
      </form>
    </main>
  );
}