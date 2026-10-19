import { useEffect, useState } from "react";
import { api } from "../api";
import ProductGrid from "../components/ProductGrid";

export default function Recommendations() {
  const [recommendations, setRecommendations] =
    useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recommendationSource, setRecommendationSource] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendations() {
      try {
        setLoading(true);
        setError("");

        const response = await api(
          "/api/recommendations?limit=12"
        );

        if (!cancelled) {
          setRecommendations(
            response.recommendations || response || []
          );
          setRecommendationSource(
            response.recommendationSource || ""
          );
        }
      } catch (error) {
        if (!cancelled) {
          setError(error.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <section className="hero">
        <h1>Recommended for you</h1>

        <p>
          These products are selected using your
          interests and your product activity.
        </p>
        {recommendationSource ===
          "selbuy-live-catalog-hybrid" && (
          <p className="muted">
            Personalized from Selbuy products, interests, and marketplace activity.
          </p>
        )}
        {recommendationSource ===
          "fastapi-trained-model" && (
          <p className="muted">
            Ranked by the trained recommendation model.
          </p>
        )}
        {recommendationSource ===
          "trained-model-and-fallback" && (
          <p className="muted">
            Ranked using the trained model, with marketplace fallback results where needed.
          </p>
        )}
        {recommendationSource ===
          "javascript-fallback" && (
          <p className="muted">
            The trained model did not provide matching listings; these results use the marketplace fallback recommender.
          </p>
        )}
      </section>

      {loading && (
        <p className="empty">
          Loading recommendations...
        </p>
      )}

      {error && (
        <p className="error">{error}</p>
      )}

      {!loading && !error && (
        <ProductGrid
          products={recommendations}
          empty="No recommendations available yet."
        />
      )}
    </main>
  );
}