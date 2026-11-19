// Sthamly AI web: 404 page (Blueprint 3.0, section 10)
// Galat URL par saaf message aur wapas chat par jaane ka raasta.
// Yahan koi API call ya login check nahi, taaki ye har haal mein dikhe.

import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <section className="card">
        <h1>यह पेज नहीं मिला</h1>
        <p className="muted">जो पता आपने खोला, वह इस ऐप में नहीं है।</p>
        <Link to="/chat" className="btn-primary">
          चैट पर वापस जाएँ
        </Link>
      </section>
    </main>
  );
}