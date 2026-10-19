import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import "./fixes.css";
import "./search-results.css";
import "./search-suggestions.css";
createRoot(document.getElementById("root")).render(<BrowserRouter><App /></BrowserRouter>);
