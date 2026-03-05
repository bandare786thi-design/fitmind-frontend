import { Link } from "react-router-dom";
import VideoBackground from "../components/VideoBackground";

export default function NotFoundPage() {
  return (
    <div className="auth-page">
      <VideoBackground src="/media/fitmind-bg.mp4" dim={0.70} />

      <div className="auth-box glass">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="helper">The page you’re looking for doesn’t exist.</p>
        <Link className="btn btn-primary" to="/dashboard">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}