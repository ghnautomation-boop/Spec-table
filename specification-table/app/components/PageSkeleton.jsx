import { useNavigation } from "react-router";
import { useEffect, useState } from "react";

/**
 * Skeleton component pentru pagina de Templates
 */
export function TemplatesPageSkeleton() {
  return (
    <s-page heading="Specification Templates">
      {/* Banner skeleton */}
      <s-section>
        <div
          style={{
            height: "48px",
            borderRadius: "8px",
            background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
            backgroundSize: "200% 100%",
            animation: "skeleton-loading 1.5s ease-in-out infinite",
            marginBottom: "16px",
          }}
        />
      </s-section>

      {/* Search section skeleton */}
      <s-section>
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
          <div
            style={{
              width: "200px",
              height: "40px",
              borderRadius: "6px",
              background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
              backgroundSize: "200% 100%",
              animation: "skeleton-loading 1.5s ease-in-out infinite",
            }}
          />
          <div
            style={{
              width: "150px",
              height: "40px",
              borderRadius: "6px",
              background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
              backgroundSize: "200% 100%",
              animation: "skeleton-loading 1.5s ease-in-out infinite",
            }}
          />
        </div>
      </s-section>

      {/* Templates grid skeleton */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                padding: "20px",
                border: "1px solid var(--p-border-base)",
                borderRadius: "8px",
                background: "var(--p-background-base)",
              }}
            >
              {/* Template name skeleton */}
              <div
                style={{
                  height: "24px",
                  width: "60%",
                  borderRadius: "4px",
                  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                  backgroundSize: "200% 100%",
                  animation: "skeleton-loading 1.5s ease-in-out infinite",
                  marginBottom: "16px",
                }}
              />
              {/* Template status skeleton */}
              <div
                style={{
                  height: "20px",
                  width: "40%",
                  borderRadius: "4px",
                  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                  backgroundSize: "200% 100%",
                  animation: "skeleton-loading 1.5s ease-in-out infinite",
                  marginBottom: "12px",
                }}
              />
              {/* Assignment info skeleton */}
              <div
                style={{
                  height: "16px",
                  width: "80%",
                  borderRadius: "4px",
                  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                  backgroundSize: "200% 100%",
                  animation: "skeleton-loading 1.5s ease-in-out infinite",
                  marginBottom: "8px",
                }}
              />
              <div
                style={{
                  height: "16px",
                  width: "60%",
                  borderRadius: "4px",
                  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                  backgroundSize: "200% 100%",
                  animation: "skeleton-loading 1.5s ease-in-out infinite",
                }}
              />
            </div>
          ))}
        </div>
      </s-section>

      <style>{`
        @keyframes skeleton-loading {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </s-page>
  );
}

/**
 * Skeleton component pentru pagina de Home
 */
export function HomePageSkeleton() {
  return (
    <s-page>
      {/* Banner skeleton */}
      <s-section>
        <div
          style={{
            height: "220px",
            borderRadius: "8px",
            background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
            backgroundSize: "200% 100%",
            animation: "skeleton-loading 1.5s ease-in-out infinite",
            marginBottom: "16px",
          }}
        />
      </s-section>

      {/* Stats cards skeleton */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                padding: "16px",
                borderRadius: "8px",
                background: "var(--p-background-base)",
                border: "1px solid var(--p-border-base)",
              }}
            >
              <div
                style={{
                  height: "20px",
                  width: "60%",
                  borderRadius: "4px",
                  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                  backgroundSize: "200% 100%",
                  animation: "skeleton-loading 1.5s ease-in-out infinite",
                  marginBottom: "8px",
                }}
              />
              <div
                style={{
                  height: "32px",
                  width: "40%",
                  borderRadius: "4px",
                  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                  backgroundSize: "200% 100%",
                  animation: "skeleton-loading 1.5s ease-in-out infinite",
                }}
              />
            </div>
          ))}
        </div>
      </s-section>

      {/* Content sections skeleton */}
      <s-section>
        <div
          style={{
            height: "400px",
            borderRadius: "8px",
            background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
            backgroundSize: "200% 100%",
            animation: "skeleton-loading 1.5s ease-in-out infinite",
          }}
        />
      </s-section>

      <style>{`
        @keyframes skeleton-loading {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </s-page>
  );
}

/**
 * Wrapper component care detectează navigarea și afișează skeleton-uri
 */
export function NavigationSkeleton({ children, skeletonComponent }) {
  const navigation = useNavigation();
  const [isNavigating, setIsNavigating] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (navigation.state === "loading") {
      setIsNavigating(true);
      // Delay mic pentru a evita flickering pe navigări rapide
      const timer = setTimeout(() => {
        setShowSkeleton(true);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setIsNavigating(false);
      // Păstrează skeleton-ul puțin pentru smooth transition
      const timer = setTimeout(() => {
        setShowSkeleton(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [navigation.state]);

  // Dacă navigăm și skeleton-ul trebuie afișat, arată skeleton-ul
  if (isNavigating && showSkeleton && skeletonComponent) {
    return skeletonComponent;
  }

  return children;
}
