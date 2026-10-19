import crypto from "crypto";
import bcrypt from "bcryptjs";
import { writeDb } from "./db.js";
const individualSellerId = crypto.randomUUID(),
  businessSellerId = crypto.randomUUID(),
  buyerId = crypto.randomUUID();
const products = [
  {
    title: "HP EliteBook Laptop",
    description: "Core i5 laptop for study and office work",
    category: "Electronics",
    condition: "Used",
    price: 75000,
  },
  {
    title: "Samsung Galaxy Phone",
    description: "Android smartphone in good condition",
    category: "Electronics",
    condition: "Used",
    price: 45000,
  },
  {
    title: "Study Chair",
    description: "Comfortable chair for study desk",
    category: "Furniture",
    condition: "New",
    price: 12000,
  },
  {
    title: "Software Engineering Book",
    description: "University textbook for software engineering students",
    category: "Books",
    condition: "Used",
    price: 2500,
  },
].map((p) => {
  const isBusinessProduct = p.condition === "New";
  return {
    ...p,
    id: crypto.randomUUID(),
    sellerId: isBusinessProduct
      ? businessSellerId
      : individualSellerId,
    sellerType: isBusinessProduct
      ? "business_seller"
      : "individual_seller",
    productType: isBusinessProduct ? "new" : "used",
    stockQuantity: isBusinessProduct ? 10 : 1,
    itemCondition: isBusinessProduct ? null : "Good",
    usageDuration: isBusinessProduct ? null : "1 year",
    defects: isBusinessProduct ? null : "None reported",
    location: isBusinessProduct ? null : "Attock",
    sellingMethod: "fixed_price",
    imageUrl: null,
    status: "active",
    createdAt: new Date().toISOString(),
  };
});
writeDb({
  users: [
    {
      id: individualSellerId,
      name: "Demo Individual Seller",
      email: "seller@selbuy.test",
      passwordHash: await bcrypt.hash("password", 10),
      role: "individual_seller",
      interests: [],
      createdAt: new Date().toISOString(),
    },
    {
      id: businessSellerId,
      name: "Demo Business Seller",
      email: "business@selbuy.test",
      passwordHash: await bcrypt.hash("password", 10),
      role: "business_seller",
      interests: [],
      createdAt: new Date().toISOString(),
    },
    {
      id: buyerId,
      name: "Demo Buyer",
      email: "buyer@selbuy.test",
      passwordHash: await bcrypt.hash("password", 10),
      role: "buyer",
      interests: ["Electronics", "Books"],
      createdAt: new Date().toISOString(),
    },
  ],
  products,
  savedItems: [],
  interactions: [],
});
console.log("Seed complete. Password for demo users: password");
