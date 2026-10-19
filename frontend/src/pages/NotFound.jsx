import { Link } from "react-router-dom";
export default function NotFound(){return <main className="narrow"><div className="empty-state"><h1>Page not found</h1><p>The page you requested does not exist or may have moved.</p><Link className="button" to="/">Back to marketplace</Link></div></main>}
